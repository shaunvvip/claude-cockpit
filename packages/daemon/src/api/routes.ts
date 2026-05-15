import type { SessionRegistry } from '../session-registry.js'

export interface ApiResponse {
  status: number
  body: string
  contentType: string
}

export function handleApiRequest(method: string, url: string, registry: SessionRegistry): ApiResponse | null {
  if (!url.startsWith('/api/')) return null

  if (method === 'GET' && url === '/api/sessions') {
    return json(200, { sessions: registry.list() })
  }

  const m = url.match(/^\/api\/sessions\/([^/]+)$/)
  if (method === 'GET' && m) {
    const s = registry.get(m[1]!)
    if (!s) return json(404, { error: 'session not found' })
    return json(200, s)
  }

  return json(404, { error: 'not found' })
}

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}
