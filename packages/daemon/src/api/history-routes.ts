import type { IncomingMessage } from 'node:http'
import type { ApiContext, ApiResponse } from './routes.js'

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}

function checkOriginOk(req: IncomingMessage | undefined, port: number): boolean {
  if (!req) return true
  const origin = req.headers.origin
  if (!origin) return true
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`
}

function clampDays(raw: string | null, def: number, max = 90): number {
  if (!raw) return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

function clampLimit(raw: string | null, def: number, max = 100): number {
  if (!raw) return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function handleHistoryRequest(method: string, url: string, ctx: ApiContext): Promise<ApiResponse> {
  // If history is unavailable, every endpoint returns a friendly fallback
  if (!ctx.history) {
    if (method === 'POST') {
      return json(503, { error: 'history-unavailable', reason: 'SQLite layer disabled (install failure or disabled)' })
    }
    return json(200, { unavailable: true, reason: 'history layer disabled' })
  }

  const u = new URL(url, 'http://localhost')

  if (method === 'GET' && u.pathname === '/api/history/trends') {
    const days = clampDays(u.searchParams.get('days'), 30)
    const to = Date.now()
    const from = to - days * 86400_000
    return json(200, ctx.history.queryTrends({ from, to }))
  }

  if (method === 'GET' && u.pathname === '/api/history/top') {
    const metric = (u.searchParams.get('metric') ?? 'cost') as any
    const dimension = (u.searchParams.get('dimension') ?? 'project') as any
    const days = clampDays(u.searchParams.get('days'), 30)
    const limit = clampLimit(u.searchParams.get('limit'), 10)
    if (!['cost', 'tokens', 'tools'].includes(metric)) return json(400, { error: 'invalid metric' })
    if (!['project', 'tool', 'session'].includes(dimension)) return json(400, { error: 'invalid dimension' })
    return json(200, ctx.history.queryTop({ metric, dimension, days, limit }))
  }

  if (method === 'GET' && u.pathname === '/api/history/projects') {
    const days = clampDays(u.searchParams.get('days'), 30)
    return json(200, ctx.history.queryProjects({ days }))
  }

  if (method === 'GET' && u.pathname === '/api/history/sparkline') {
    const metric = (u.searchParams.get('metric') ?? 'cost') as 'cost' | 'ctx'
    const days = clampDays(u.searchParams.get('days'), 1)
    const bucket = (u.searchParams.get('bucket') ?? 'hour') as 'hour' | 'minute'
    if (!['cost', 'ctx'].includes(metric)) return json(400, { error: 'invalid metric' })
    if (!['hour', 'minute'].includes(bucket)) return json(400, { error: 'invalid bucket' })
    return json(200, ctx.history.querySparkline({ metric, days, bucket }))
  }

  if (method === 'GET' && u.pathname === '/api/history/usage-snapshots') {
    const days = clampDays(u.searchParams.get('days'), 30)
    return json(200, ctx.history.queryUsageSnapshots({ days }))
  }

  if (method === 'GET' && u.pathname === '/api/history/sessions') {
    const from = Number(u.searchParams.get('from') ?? 0)
    const to = Number(u.searchParams.get('to') ?? Date.now())
    const limit = clampLimit(u.searchParams.get('limit'), 100)
    return json(200, ctx.history.querySessions({ from, to, limit }))
  }

  if (method === 'POST' && u.pathname === '/api/history/clear') {
    if (!checkOriginOk(ctx.request, ctx.port)) return json(403, { error: 'origin denied' })
    ctx.history.clearAll()
    return json(200, { ok: true })
  }

  return json(404, { error: 'not found' })
}
