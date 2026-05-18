import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HistoryStore } from '../../packages/daemon/src/history/store.js'
import { runCleanup } from '../../packages/daemon/src/history/cleanup.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

const DAY = 86400_000

describe('v0.9 history e2e', () => {
  let dir: string
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('full pipeline: ingest → flush → trends query → cleanup → trends empty', () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-e2e-'))
    const dbPath = join(dir, 'cockpit.db')

    // Phase 1: write 5 sessions over the past 100 days
    const store = new HistoryStore(dbPath)
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      store.recordSession(s({
        sessionId: `s${i}`,
        cost: 1.0 + i,
        startedAt: now - (i * 20) * DAY,    // 0, 20, 40, 60, 80 days ago
      }))
    }
    store.flush()

    // Phase 2: query trends — all 5 in range
    const all = store.queryTrends({ from: now - 100 * DAY, to: now + 1 })
    expect(all.buckets.length).toBeGreaterThanOrEqual(5)
    expect(all.totals.cost).toBeCloseTo(15.0, 1)   // 1+2+3+4+5

    // Phase 3: cleanup with 50-day retention — keeps s0..s2 (0/20/40 days), drops s3,s4
    const r = runCleanup(store, 50)
    expect(r.deleted.sessions).toBe(2)

    // Phase 4: query again — only 3 left
    const after = store.queryTrends({ from: now - 100 * DAY, to: now + 1 })
    expect(after.totals.sessions).toBe(3)
    expect(after.totals.cost).toBeCloseTo(6.0, 1)  // 1+2+3

    store.close()
  })

  it('idempotent re-ingest does not double-count after restart', () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-e2e-'))
    const dbPath = join(dir, 'cockpit.db')

    const s1 = new HistoryStore(dbPath)
    s1.recordSession(s({ cost: 3.0 }))
    s1.recordToolCall('sid', 1000, 'Read')
    s1.recordToolCall('sid', 1001, 'Edit')
    s1.close()

    // Simulate daemon restart re-reading transcript
    const s2 = new HistoryStore(dbPath)
    s2.recordToolCall('sid', 1000, 'Read')
    s2.recordToolCall('sid', 1001, 'Edit')
    s2.recordToolCall('sid', 1002, 'Bash')  // new
    s2.flush()

    expect((s2.db.prepare('SELECT COUNT(*) as c FROM tool_calls').get() as any).c).toBe(3)
    expect((s2.db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c).toBe(1)
    s2.close()
  })
})
