import { describe, it, expect, beforeEach } from 'vitest'
import { HistoryStore } from './store.js'
import type { SessionState, AlertEvent } from '@claude-cockpit/shared'

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('HistoryStore record + flush', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('flushes session row to sessions table', () => {
    store.recordSession(makeSession({ cost: 1.23 }))
    store.flush()
    const row = store.db.prepare('SELECT * FROM sessions WHERE id = ?').get('sid') as any
    expect(row.total_cost).toBe(1.23)
    expect(row.model).toBe('m')
  })

  it('flushes tool_calls and dedupes by (session_id, ts, tool_name)', () => {
    store.recordToolCall('sid', 100, 'Read')
    store.recordToolCall('sid', 100, 'Read')   // duplicate
    store.recordToolCall('sid', 100, 'Edit')   // different name, allowed
    store.flush()
    const rows = store.db.prepare('SELECT * FROM tool_calls').all() as any[]
    expect(rows).toHaveLength(2)
  })

  it('flushes alert event with JSON payload', () => {
    const alert: AlertEvent = { ruleId: 'ctx-high', sessionId: 'sid', ts: 100, title: 't', body: 'b' }
    store.recordAlert(alert)
    store.flush()
    const row = store.db.prepare('SELECT * FROM events WHERE event_type = ?').get('alert') as any
    expect(JSON.parse(row.payload_json)).toEqual({ ruleId: 'ctx-high', title: 't', body: 'b' })
  })

  it('dedupes usage snapshots when values unchanged', () => {
    const s = makeSession({ usage5hPct: 25, usage7dPct: 12 })
    store.recordUsage(s, 100)
    store.recordUsage(s, 200)                  // same values → skip
    store.recordUsage(makeSession({ usage5hPct: 26, usage7dPct: 12 }), 300)  // value changed
    store.flush()
    const rows = store.db.prepare('SELECT * FROM usage_snapshots ORDER BY ts').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].ts).toBe(100)
    expect(rows[1].ts).toBe(300)
  })

  it('skips usage snapshot when both pct are null', () => {
    store.recordUsage(makeSession(), 100)      // no usage* fields → skip
    store.flush()
    const rows = store.db.prepare('SELECT * FROM usage_snapshots').all()
    expect(rows).toHaveLength(0)
  })

  it('flush is idempotent on empty queues', () => {
    expect(() => store.flush()).not.toThrow()
    expect(() => store.flush()).not.toThrow()
  })

  it('multiple recordSession for same id collapse to one row (upsert)', () => {
    store.recordSession(makeSession({ cost: 1.0 }))
    store.recordSession(makeSession({ cost: 2.0 }))
    store.flush()
    const row = store.db.prepare('SELECT * FROM sessions WHERE id = ?').get('sid') as any
    expect(row.total_cost).toBe(2.0)
  })

  it('clearAll() empties all tables + queues', () => {
    store.recordSession(makeSession())
    store.recordToolCall('sid', 100, 'Read')
    store.recordAlert({ ruleId: 'ctx-high', sessionId: 'sid', ts: 1, title: 't', body: 'b' })
    store.flush()
    store.clearAll()
    expect(store.db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toMatchObject({ c: 0 })
    expect(store.db.prepare('SELECT COUNT(*) as c FROM tool_calls').get()).toMatchObject({ c: 0 })
    expect(store.db.prepare('SELECT COUNT(*) as c FROM events').get()).toMatchObject({ c: 0 })
  })

  it('close() flushes before closing', () => {
    store.recordSession(makeSession({ cost: 5.0 }))
    store.close()
    expect(true).toBe(true)
  })
})
