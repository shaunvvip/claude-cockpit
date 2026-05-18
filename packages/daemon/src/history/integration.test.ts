import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HistoryStore } from './store.js'
import type { SessionState } from '@claude-cockpit/shared'

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'cockpit-hist-'))
}

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('HistoryStore daemon-restart idempotency', () => {
  it('re-ingesting the same tool_calls does not duplicate rows', () => {
    const dir = freshDir()
    const dbPath = join(dir, 'cockpit.db')
    try {
      // Run 1
      const s1 = new HistoryStore(dbPath)
      s1.recordSession(makeSession({ cost: 1.0 }))
      s1.recordToolCall('sid', 100, 'Read')
      s1.recordToolCall('sid', 200, 'Edit')
      s1.flush()
      s1.close()

      // Run 2 — simulate daemon restart re-reading transcript
      const s2 = new HistoryStore(dbPath)
      s2.recordToolCall('sid', 100, 'Read')   // same as before
      s2.recordToolCall('sid', 200, 'Edit')
      s2.recordToolCall('sid', 300, 'Write')  // new
      s2.flush()
      const rows = s2.db.prepare('SELECT * FROM tool_calls ORDER BY ts').all() as any[]
      expect(rows).toHaveLength(3)            // not 5
      s2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('re-ingesting the same session updates instead of duplicating', () => {
    const dir = freshDir()
    const dbPath = join(dir, 'cockpit.db')
    try {
      const s1 = new HistoryStore(dbPath)
      s1.recordSession(makeSession({ cost: 1.0 }))
      s1.flush()
      s1.close()

      const s2 = new HistoryStore(dbPath)
      s2.recordSession(makeSession({ cost: 5.0 }))   // same id, updated cost
      s2.flush()
      const rows = s2.db.prepare('SELECT * FROM sessions').all() as any[]
      expect(rows).toHaveLength(1)
      expect(rows[0].total_cost).toBe(5.0)
      s2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('persists across instance close + re-open', () => {
    const dir = freshDir()
    const dbPath = join(dir, 'cockpit.db')
    try {
      const s1 = new HistoryStore(dbPath)
      s1.recordSession(makeSession({ cost: 7.7 }))
      s1.close()

      const s2 = new HistoryStore(dbPath)
      const row = s2.db.prepare('SELECT * FROM sessions WHERE id = ?').get('sid') as any
      expect(row.total_cost).toBe(7.7)
      s2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
