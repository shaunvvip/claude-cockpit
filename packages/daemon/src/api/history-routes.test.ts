import { describe, it, expect, beforeEach } from 'vitest'
import { handleHistoryRequest } from './history-routes.js'
import { HistoryStore } from '../history/store.js'
import { SessionRegistry } from '../session-registry.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('handleHistoryRequest', () => {
  let history: HistoryStore
  let registry: SessionRegistry
  beforeEach(() => {
    history = new HistoryStore(':memory:')
    registry = new SessionRegistry()
  })

  const ctx = () => ({ registry, platform: { platform: 'darwin' as const } as any, port: 1234, history })

  it('GET /trends returns aggregated buckets', async () => {
    history.recordSession(s({ cost: 1.0, startedAt: Date.now() - 1000 }))
    history.flush()
    const res = await handleHistoryRequest('GET', '/api/history/trends?days=30', ctx())
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.buckets.length).toBeGreaterThan(0)
  })

  it('GET /top with invalid metric returns 400', async () => {
    const res = await handleHistoryRequest('GET', '/api/history/top?metric=foo&dimension=project', ctx())
    expect(res.status).toBe(400)
  })

  it('GET /sparkline with invalid bucket returns 400', async () => {
    const res = await handleHistoryRequest('GET', '/api/history/sparkline?metric=cost&bucket=day', ctx())
    expect(res.status).toBe(400)
  })

  it('GET /usage-snapshots returns snapshots in range', async () => {
    history.recordUsage(s({ usage5hPct: 50, usage7dPct: 20 }), Date.now() - 100)
    history.flush()
    const res = await handleHistoryRequest('GET', '/api/history/usage-snapshots?days=30', ctx())
    const body = JSON.parse(res.body)
    expect(body.snapshots.length).toBe(1)
  })

  it('POST /clear without Origin guard allowed (no Origin = OK)', async () => {
    history.recordSession(s({ cost: 1.0 }))
    history.flush()
    const res = await handleHistoryRequest('POST', '/api/history/clear', ctx())
    expect(res.status).toBe(200)
    expect(history.db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toMatchObject({ c: 0 })
  })

  it('POST /clear with foreign Origin returns 403', async () => {
    const req = { headers: { origin: 'http://evil.com' } } as any
    const res = await handleHistoryRequest('POST', '/api/history/clear', { ...ctx(), request: req })
    expect(res.status).toBe(403)
  })

  it('returns unavailable fallback when ctx.history undefined', async () => {
    const ctxNoHistory = { registry, platform: { platform: 'darwin' as const } as any, port: 1234 } as any
    const res = await handleHistoryRequest('GET', '/api/history/trends', ctxNoHistory)
    const body = JSON.parse(res.body)
    expect(body.unavailable).toBe(true)
  })

  it('returns 503 for POST when ctx.history undefined', async () => {
    const ctxNoHistory = { registry, platform: { platform: 'darwin' as const } as any, port: 1234 } as any
    const res = await handleHistoryRequest('POST', '/api/history/clear', ctxNoHistory)
    expect(res.status).toBe(503)
  })

  it('returns 404 for unknown sub-path', async () => {
    const res = await handleHistoryRequest('GET', '/api/history/nonexistent', ctx())
    expect(res.status).toBe(404)
  })
})
