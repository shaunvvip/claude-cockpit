import { promisify } from 'node:util'
import { execFile as _execFile } from 'node:child_process'
import { readlink as _readlink } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import type { SessionRegistry } from '../session-registry.js'
import type { PlatformActions } from '../platform/index.js'
import type { EventBuffer } from '../event-buffer.js'
import type { AlertStore } from '../alert-store.js'

const execFile = promisify(_execFile)

async function ppidLooksLikeClaude(ppid: number, platform: 'darwin' | 'linux'): Promise<boolean> {
  if (ppid <= 0) return false
  try {
    if (platform === 'linux') {
      const target = await _readlink(`/proc/${ppid}/exe`)
      return target.toLowerCase().includes('claude')
    }
    const { stdout } = await execFile('ps', ['-p', String(ppid), '-o', 'comm='])
    return stdout.toLowerCase().includes('claude')
  } catch {
    return false
  }
}

export interface ApiResponse {
  status: number
  body: string
  contentType: string
  headers?: Record<string, string>
}

export interface ApiContext {
  registry: SessionRegistry
  platform: PlatformActions
  port: number
  request?: IncomingMessage    // optional for backward-compat with existing tests
  alerts?: AlertStore
  events?: EventBuffer
}

function checkOriginOk(req: IncomingMessage | undefined, port: number): boolean {
  if (!req) return true
  const origin = req.headers.origin
  if (!origin) return true
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (c) => buf += c)
    req.on('end', () => resolve(buf))
    req.on('error', reject)
  })
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
    if (!s.lastEditPath) return json(400, { error: 'no recent file edit found' })
    await ctx.platform.openFile(s.lastEditPath)
    return json(200, { ok: true, path: s.lastEditPath })
  }

  const openDash = url.match(/^\/api\/sessions\/([^/]+)\/open-dashboard$/)
  if (method === 'POST' && openDash) {
    if (!ctx.port) return json(500, { error: 'port unknown' })
    await ctx.platform.openUrl(`http://localhost:${ctx.port}/sessions/${openDash[1]}`)
    return json(200, { ok: true })
  }

  const interrupt = url.match(/^\/api\/sessions\/([^/]+)\/interrupt$/)
  if (method === 'POST' && interrupt) {
    const s = ctx.registry.get(interrupt[1]!)
    if (!s) return json(404, { error: 'session not found' })
    if (s.ppid <= 0) return json(422, { error: 'stop-unavailable', reason: 'no ppid' })
    const looksClaude = await ppidLooksLikeClaude(s.ppid, ctx.platform.platform)
    if (!looksClaude) return json(422, { error: 'stop-unavailable', reason: 'ppid not claude' })
    try {
      process.kill(s.ppid, 'SIGINT')
    } catch (e) {
      return json(422, { error: 'stop-unavailable', reason: String(e) })
    }
    return json(200, { ok: true })
  }

  const copyInfo = url.match(/^\/api\/sessions\/([^/]+)\/copy-info$/)
  if (method === 'POST' && copyInfo) {
    const s = ctx.registry.get(copyInfo[1]!)
    if (!s) return json(404, { error: 'session not found' })
    if (!ctx.request) return json(400, { error: 'missing request' })
    const body = await readBody(ctx.request)
    let parsed: { field?: string }
    try { parsed = JSON.parse(body) } catch { return json(400, { error: 'invalid body' }) }
    const field = parsed.field
    let text: string
    switch (field) {
      case 'sessionId':      text = s.sessionId; break
      case 'cost':           text = s.cost.toFixed(2); break
      case 'transcriptPath': text = s.transcriptPath; break
      case 'cwd':            text = s.cwd; break
      default:               return json(400, { error: 'unknown field' })
    }
    await ctx.platform.clipboardWrite(text)
    return json(200, { ok: true, copied: text })
  }

  const focus = url.match(/^\/api\/sessions\/([^/]+)\/focus-terminal$/)
  if (method === 'POST' && focus) {
    const s = ctx.registry.get(focus[1]!)
    if (!s) return json(404, { error: 'session not found' })
    if (s.ppid <= 0) return json(422, { error: 'no ppid' })
    await ctx.platform.focusTerminal(s.ppid).catch(() => undefined)
    return json(200, { ok: true })
  }

  const interruptRedirect = url.match(/^\/api\/sessions\/([^/]+)\/interrupt-redirect$/)
  if (method === 'GET' && interruptRedirect) {
    if (!checkOriginOk(ctx.request, ctx.port)) return json(403, { error: 'origin denied' })
    const sid = interruptRedirect[1]!
    const s = ctx.registry.get(sid)
    if (s && s.ppid > 0) {
      const ok = await ppidLooksLikeClaude(s.ppid, ctx.platform.platform)
      if (ok) {
        try { process.kill(s.ppid, 'SIGINT') } catch { /* */ }
      }
    }
    return { status: 302, body: '', contentType: 'text/plain', headers: { Location: `/sessions/${sid}` } }
  }

  const openFileRedirect = url.match(/^\/api\/sessions\/([^/]+)\/open-file-redirect$/)
  if (method === 'GET' && openFileRedirect) {
    if (!checkOriginOk(ctx.request, ctx.port)) return json(403, { error: 'origin denied' })
    const sid = openFileRedirect[1]!
    const s = ctx.registry.get(sid)
    if (s?.lastEditPath) {
      await ctx.platform.openFile(s.lastEditPath).catch(() => undefined)
    }
    return { status: 302, body: '', contentType: 'text/plain', headers: { Location: `/sessions/${sid}` } }
  }

  const recentAlerts = url.match(/^\/api\/sessions\/([^/]+)\/recent-alerts$/)
  if (method === 'GET' && recentAlerts) {
    if (!ctx.alerts) return json(200, { alerts: [] })
    return json(200, { alerts: ctx.alerts.bySession(recentAlerts[1]!) })
  }

  const eventsMatch = url.match(/^\/api\/sessions\/([^/]+)\/events(\?.*)?$/)
  if (method === 'GET' && eventsMatch) {
    if (!ctx.events) return json(200, { events: [] })
    const sinceMatch = url.match(/[?&]since=(\d+)/)
    const since = sinceMatch ? Number(sinceMatch[1]) : 0
    const all = ctx.events.get(eventsMatch[1]!)
    const filtered = since > 0 ? all.filter((e) => e.ts >= since) : all
    return json(200, { events: filtered })
  }

  return json(404, { error: 'not found' })
}

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}
