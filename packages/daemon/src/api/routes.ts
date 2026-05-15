import type { SessionRegistry } from '../session-registry.js'
import type { PlatformActions } from '../platform/index.js'

export interface ApiResponse {
  status: number
  body: string
  contentType: string
}

export interface ApiContext {
  registry: SessionRegistry
  platform: PlatformActions
  port: number
}

export async function handleApiRequest(
  method: string,
  url: string,
  ctx: ApiContext,
): Promise<ApiResponse | null> {
  if (!url.startsWith('/api/')) return null

  if (method === 'GET' && url === '/api/sessions') {
    return json(200, { sessions: ctx.registry.list() })
  }

  const get = url.match(/^\/api\/sessions\/([^/]+)$/)
  if (method === 'GET' && get) {
    const s = ctx.registry.get(get[1]!)
    if (!s) return json(404, { error: 'session not found' })
    return json(200, s)
  }

  const openFile = url.match(/^\/api\/sessions\/([^/]+)\/open-file$/)
  if (method === 'POST' && openFile) {
    const s = ctx.registry.get(openFile[1]!)
    if (!s) return json(404, { error: 'session not found' })
    const recentEdit = s.tools.find((t) => t.name === 'Edit' || t.name === 'Write')
    if (!recentEdit) return json(400, { error: 'no recent file edit found' })
    return json(200, { ok: true, note: 'open-file scaffold; needs path tracking in Phase 2' })
  }

  const openDash = url.match(/^\/api\/sessions\/([^/]+)\/open-dashboard$/)
  if (method === 'POST' && openDash) {
    if (!ctx.port) return json(500, { error: 'port unknown' })
    await ctx.platform.openUrl(`http://localhost:${ctx.port}/sessions/${openDash[1]}`)
    return json(200, { ok: true })
  }

  return json(404, { error: 'not found' })
}

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}
