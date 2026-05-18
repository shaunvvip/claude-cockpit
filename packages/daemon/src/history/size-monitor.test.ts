import { describe, it, expect } from 'vitest'
import { HistoryStore } from './store.js'
import { dbSizeBytes, checkDbSize } from './size-monitor.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('size-monitor', () => {
  it('reports positive size for non-empty db', () => {
    const store = new HistoryStore(':memory:')
    store.recordSession(s())
    store.flush()
    expect(dbSizeBytes(store)).toBeGreaterThan(0)
  })

  it('checkDbSize does not warn under threshold', () => {
    const store = new HistoryStore(':memory:')
    store.recordSession(s())
    store.flush()
    const r = checkDbSize(store)
    expect(r.warned).toBe(false)
    expect(r.bytes).toBeGreaterThan(0)
  })
})
