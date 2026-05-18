import { describe, it, expect } from 'vitest'
import { HistoryStore } from './store.js'
import { runCleanup, msUntilNextLocalMidnight } from './cleanup.js'
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

describe('runCleanup', () => {
  it('deletes nothing from empty db', () => {
    const store = new HistoryStore(':memory:')
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(0)
    expect(r.deleted.tool_calls).toBe(0)
  })

  it('deletes rows older than retention window', () => {
    const store = new HistoryStore(':memory:')
    const now = Date.now()
    store.recordSession(s({ sessionId: 'old', startedAt: now - 100 * DAY }))
    store.recordSession(s({ sessionId: 'new', startedAt: now - 5 * DAY }))
    store.recordToolCall('old', now - 100 * DAY, 'Read')
    store.recordToolCall('new', now - 1 * DAY, 'Edit')
    store.flush()
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(1)
    expect(r.deleted.tool_calls).toBe(1)
    const rows = store.db.prepare('SELECT id FROM sessions').all() as any[]
    expect(rows.map(r => r.id)).toEqual(['new'])
  })

  it('cleans all 4 tables transactionally', () => {
    const store = new HistoryStore(':memory:')
    const now = Date.now()
    store.recordSession(s({ startedAt: now - 100 * DAY }))
    store.recordToolCall('sid', now - 100 * DAY, 'Read')
    store.recordAlert({ ruleId: 'ctx-high', sessionId: 'sid', ts: now - 100 * DAY, title: 't', body: 'b' })
    store.recordUsage(s({ usage5hPct: 1 }), now - 100 * DAY)
    store.flush()
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(1)
    expect(r.deleted.tool_calls).toBe(1)
    expect(r.deleted.events).toBe(1)
    expect(r.deleted.usage_snapshots).toBe(1)
  })

  it('keeps boundary rows (exactly at cutoff)', () => {
    const store = new HistoryStore(':memory:')
    const now = Date.now()
    const cutoff = now - 90 * DAY
    store.recordSession(s({ startedAt: cutoff + 1 }))
    store.flush()
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(0)
  })
})

describe('msUntilNextLocalMidnight', () => {
  it('returns positive value', () => {
    const ms = msUntilNextLocalMidnight()
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })
})
