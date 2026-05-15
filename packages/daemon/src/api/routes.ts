import { promisify } from 'node:util'
import { execFile as _execFile } from 'node:child_process'
import { readlink as _readlink } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import type { SessionRegistry } from '../session-registry.js'
import type { PlatformActions } from '../platform/index.js'

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
}

export interface ApiContext {
  registry: SessionRegistry
  platform: PlatformActions
  port: number
  request?: IncomingMessage    // optional for backward-compat with existing tests
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

  return json(404, { error: 'not found' })
}

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}
