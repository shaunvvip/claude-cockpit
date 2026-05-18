import { describe, it, expect, beforeEach } from 'vitest'
import { HistoryStore } from './store.js'
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

describe('HistoryStore.queryTrends', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('aggregates daily costs across the time range', () => {
    const t0 = new Date('2026-05-10T00:00:00Z').getTime()
    store.recordSession(s({ sessionId: 'a', cost: 1.0, startedAt: t0 + 1000 }))
    store.recordSession(s({ sessionId: 'b', cost: 2.0, startedAt: t0 + 1000 }))                   // same day
    store.recordSession(s({ sessionId: 'c', cost: 3.0, startedAt: t0 + DAY + 1000 }))             // next day
    store.flush()
    const r = store.queryTrends({ from: t0 - DAY, to: t0 + 3 * DAY })
    expect(r.buckets).toHaveLength(2)
    expect(r.buckets[0]!.cost).toBe(3.0)   // day 1: a + b
    expect(r.buckets[1]!.cost).toBe(3.0)   // day 2: c
  })

  it('returns empty buckets array when no sessions in range', () => {
    const r = store.queryTrends({ from: 0, to: 100 })
    expect(r.buckets).toEqual([])
    expect(r.totals.cost).toBe(0)
  })

  it('computes cacheHitRate', () => {
    store.recordSession(s({ cacheReadTokens: 800, inputTokens: 200, startedAt: Date.now() - 1000 }))
    store.flush()
    const r = store.queryTrends({ from: 0, to: Date.now() + 1 })
    expect(r.totals.cacheHitRate).toBeCloseTo(800 / 1000, 2)
  })
})

describe('HistoryStore.queryProjects', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('groups sessions by project_dir', () => {
    store.recordSession(s({ sessionId: 'a', projectDir: '/proj/x', cost: 1.0, startedAt: Date.now() - 1000 }))
    store.recordSession(s({ sessionId: 'b', projectDir: '/proj/x', cost: 2.0, startedAt: Date.now() - 2000 }))
    store.recordSession(s({ sessionId: 'c', projectDir: '/proj/y', cost: 5.0, startedAt: Date.now() - 3000 }))
    store.flush()
    const r = store.queryProjects({ days: 30 })
    expect(r.projects).toHaveLength(2)
    expect(r.projects[0]!.key).toBe('/proj/y')   // highest cost first
    expect(r.projects[0]!.label).toBe('y')
    expect(r.projects[1]!.key).toBe('/proj/x')
    expect(r.projects[1]!.cost).toBe(3.0)
  })

  it('falls back to cwd when project_dir is null', () => {
    store.recordSession(s({ cwd: '/fallback/here', cost: 1.0, startedAt: Date.now() - 1000 }))
    store.flush()
    const r = store.queryProjects({ days: 30 })
    expect(r.projects[0]!.key).toBe('/fallback/here')
  })
})
