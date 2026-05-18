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

describe('HistoryStore.queryTop', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('top projects by cost', () => {
    store.recordSession(s({ sessionId: 'a', projectDir: '/x', cost: 1.0, startedAt: Date.now() - 1000 }))
    store.recordSession(s({ sessionId: 'b', projectDir: '/y', cost: 5.0, startedAt: Date.now() - 2000 }))
    store.flush()
    const r = store.queryTop({ metric: 'cost', dimension: 'project', days: 30, limit: 5 })
    expect(r.items[0]!.key).toBe('/y')
    expect(r.items[0]!.cost).toBe(5.0)
  })

  it('top tools by call count', () => {
    const now = Date.now()
    store.recordToolCall('s1', now - 3000, 'Read')
    store.recordToolCall('s1', now - 2000, 'Read')
    store.recordToolCall('s1', now - 1000, 'Edit')
    store.flush()
    const r = store.queryTop({ metric: 'tools', dimension: 'tool', days: 30, limit: 5 })
    expect(r.items[0]!.key).toBe('Read')
    expect(r.items[0]!.toolCalls).toBe(2)
  })
})

describe('HistoryStore.querySparkline', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('returns hourly cost buckets', () => {
    const now = Date.now()
    store.recordSession(s({ sessionId: 'a', cost: 1.0, startedAt: now - 30 * 60_000 }))   // 30min ago
    store.recordSession(s({ sessionId: 'b', cost: 2.0, startedAt: now - 90 * 60_000 }))   // 90min ago
    store.flush()
    const r = store.querySparkline({ metric: 'cost', days: 1, bucket: 'hour' })
    expect(r.buckets.length).toBeGreaterThanOrEqual(1)
    expect(r.buckets.reduce((acc, b) => acc + b.v, 0)).toBeCloseTo(3.0, 2)
  })
})

describe('HistoryStore.queryUsageSnapshots', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('returns snapshots within window', () => {
    store.recordUsage(s({ usage5hPct: 25, usage7dPct: 10 }), Date.now() - 1000)
    store.recordUsage(s({ usage5hPct: 30, usage7dPct: 10 }), Date.now() - 500)
    store.flush()
    const r = store.queryUsageSnapshots({ days: 1 })
    expect(r.snapshots).toHaveLength(2)
    expect(r.snapshots[0]!.fiveHourPct).toBe(25)
  })
})

describe('HistoryStore.computeBaselinePerSecond', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('returns 0 on empty db', () => {
    expect(store.computeBaselinePerSecond({ now: Date.now(), windowDays: 7 })).toBe(0)
  })

  it('computes total cost / total active seconds', () => {
    const now = Date.now()
    // Session a: cost 10.0, ran 100 seconds, closed → ended_at set in recordSession
    store.recordSession(s({ sessionId: 'a', cost: 10.0, startedAt: now - 100_000, lastUpdate: now, status: 'closed' }))
    store.flush()
    const baseline = store.computeBaselinePerSecond({ now, windowDays: 7 })
    expect(baseline).toBeGreaterThan(0)
    expect(baseline).toBeCloseTo(0.1, 1)   // 10 / 100 = 0.1
  })
})
