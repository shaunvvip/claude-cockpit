import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { handleApiRequest } from './routes.js'
import { SessionRegistry } from '../session-registry.js'
import type { PlatformActions } from '../platform/index.js'

function makeFakeRequest(body: string): IncomingMessage {
  const r = Readable.from(Buffer.from(body)) as unknown as IncomingMessage
  return r
}

vi.mock('node:child_process', () => ({
  execFile: (_cmd: string, _args: string[], cb: (e: unknown, r: { stdout: string }) => void) => {
    cb(null, { stdout: 'claude\n' })
  },
}))
vi.mock('node:fs/promises', async () => ({
  readlink: vi.fn(async () => '/usr/local/bin/claude'),
}))

function makeCtx(registry = new SessionRegistry()) {
  const platform: PlatformActions = {
    platform: 'darwin',
    openUrl: async () => undefined,
    openFile: async () => undefined,
    clipboardWrite: async () => undefined,
    notify: async () => undefined,
    focusTerminal: async () => undefined,
  }
  return { registry, platform, port: 5050 }
}

describe('handleApiRequest', () => {
  it('GET /api/sessions returns list as JSON', async () => {
    const ctx = makeCtx()
    ctx.registry.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t.jsonl', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = await handleApiRequest('GET', '/api/sessions', ctx)
    expect(res?.status).toBe(200)
    const body = JSON.parse(res!.body)
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].sessionId).toBe('a')
  })

  it('GET /api/sessions/:id returns single session', async () => {
    const ctx = makeCtx()
    ctx.registry.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = await handleApiRequest('GET', '/api/sessions/a', ctx)
    expect(res?.status).toBe(200)
    expect(JSON.parse(res!.body).sessionId).toBe('a')
  })

  it('returns 404 for unknown session GET', async () => {
    const res = await handleApiRequest('GET', '/api/sessions/nope', makeCtx())
    expect(res?.status).toBe(404)
  })

  it('returns null for non-/api paths so http-server falls through to static', async () => {
    expect(await handleApiRequest('GET', '/index.html', makeCtx())).toBeNull()
  })

  it('POST open-file returns 404 for unknown session', async () => {
    const res = await handleApiRequest('POST', '/api/sessions/nope/open-file', makeCtx())
    expect(res?.status).toBe(404)
  })

  it('POST open-dashboard calls platform.openUrl with /sessions/:id', async () => {
    const ctx = makeCtx()
    const calls: string[] = []
    ctx.platform = { ...ctx.platform, openUrl: async (u) => { calls.push(u) } }
    const res = await handleApiRequest('POST', '/api/sessions/x/open-dashboard', ctx)
    expect(res?.status).toBe(200)
    expect(calls[0]).toBe('http://localhost:5050/sessions/x')
  })
})

describe('POST /interrupt', () => {
  it('returns 404 when session missing', async () => {
    const ctx = makeCtx()
    const res = await handleApiRequest('POST', '/api/sessions/x/interrupt', ctx)
    expect(res?.status).toBe(404)
  })

  it('returns 422 when session has no ppid', async () => {
    const ctx = makeCtx()
    ctx.registry.upsert('sid', { lastUpdate: 0, ppid: 0 })
    const res = await handleApiRequest('POST', '/api/sessions/sid/interrupt', ctx)
    expect(res?.status).toBe(422)
  })

  it('sends SIGINT and returns 200 when ppid looks like claude', async () => {
    const ctx = makeCtx()
    ctx.registry.upsert('sid', { lastUpdate: 0, ppid: 99999 })
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const res = await handleApiRequest('POST', '/api/sessions/sid/interrupt', ctx)
    expect(res?.status).toBe(200)
    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGINT')
    killSpy.mockRestore()
  })
})

describe('POST /open-file', () => {
  it('returns 404 for unknown session', async () => {
    const res = await handleApiRequest('POST', '/api/sessions/nope/open-file', makeCtx())
    expect(res?.status).toBe(404)
  })

  it('returns 400 when no lastEditPath', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0 })
    const openFile = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, openFile } as any
    const res = await handleApiRequest('POST', '/api/sessions/sid/open-file', { registry, platform, port: 1234 })
    expect(res?.status).toBe(400)
  })

  it('calls platform.openFile with lastEditPath', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, lastEditPath: '/x/y.ts' })
    const openFile = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, openFile } as any
    const res = await handleApiRequest('POST', '/api/sessions/sid/open-file', { registry, platform, port: 1234 })
    expect(res?.status).toBe(200)
    expect(openFile).toHaveBeenCalledWith('/x/y.ts')
    expect(JSON.parse(res!.body).path).toBe('/x/y.ts')
  })
})

describe('POST /copy-info', () => {
  it('returns 404 for unknown session', async () => {
    const platform = { platform: 'darwin' as const, clipboardWrite: vi.fn(async () => undefined) } as any
    const fakeReq = makeFakeRequest(JSON.stringify({ field: 'cost' }))
    const res = await handleApiRequest('POST', '/api/sessions/nope/copy-info', { registry: new SessionRegistry(), platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(404)
  })

  it('returns 400 on missing field', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, cost: 1.23 })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const fakeReq = makeFakeRequest('{}')
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, cost: 1.23 })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const fakeReq = makeFakeRequest('not-json')
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(400)
  })

  it('returns 400 when request is missing from context', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, cost: 1.23 })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234 })
    expect(res?.status).toBe(400)
  })

  it('copies cost', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, cost: 1.23 })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const fakeReq = makeFakeRequest(JSON.stringify({ field: 'cost' }))
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(200)
    expect(clipboardWrite).toHaveBeenCalledWith('1.23')
  })

  it('copies sessionId', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0 })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const fakeReq = makeFakeRequest(JSON.stringify({ field: 'sessionId' }))
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(200)
    expect(clipboardWrite).toHaveBeenCalledWith('sid')
  })

  it('copies transcriptPath', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, transcriptPath: '/path/to/t.jsonl' })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const fakeReq = makeFakeRequest(JSON.stringify({ field: 'transcriptPath' }))
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(200)
    expect(clipboardWrite).toHaveBeenCalledWith('/path/to/t.jsonl')
  })

  it('copies cwd', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, cwd: '/home/user/project' })
    const clipboardWrite = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, clipboardWrite } as any
    const fakeReq = makeFakeRequest(JSON.stringify({ field: 'cwd' }))
    const res = await handleApiRequest('POST', '/api/sessions/sid/copy-info', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(200)
    expect(clipboardWrite).toHaveBeenCalledWith('/home/user/project')
  })
})

describe('GET /interrupt-redirect', () => {
  it('redirects 302 to /sessions/:id', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, ppid: 0 })
    const platform = { platform: 'darwin' as const } as any
    const res = await handleApiRequest('GET', '/api/sessions/sid/interrupt-redirect', { registry, platform, port: 1234 })
    expect(res?.status).toBe(302)
    expect(res?.headers?.Location).toBe('/sessions/sid')
  })

  it('returns 403 on foreign Origin', async () => {
    const fakeReq = { headers: { origin: 'http://evil.com' } } as any
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0 })
    const platform = { platform: 'darwin' as const } as any
    const res = await handleApiRequest('GET', '/api/sessions/sid/interrupt-redirect', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(403)
  })

  it('allows same-origin Origin header', async () => {
    const fakeReq = { headers: { origin: 'http://localhost:1234' } } as any
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, ppid: 0 })
    const platform = { platform: 'darwin' as const } as any
    const res = await handleApiRequest('GET', '/api/sessions/sid/interrupt-redirect', { registry, platform, port: 1234, request: fakeReq })
    expect(res?.status).toBe(302)
  })
})

describe('GET /open-file-redirect', () => {
  it('calls openFile when lastEditPath present, then redirects', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, lastEditPath: '/x/y.ts' })
    const openFile = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, openFile } as any
    const res = await handleApiRequest('GET', '/api/sessions/sid/open-file-redirect', { registry, platform, port: 1234 })
    expect(res?.status).toBe(302)
    expect(openFile).toHaveBeenCalledWith('/x/y.ts')
  })
})

describe('POST /focus-terminal', () => {
  it('returns 404 when session missing', async () => {
    const focusTerminal = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, focusTerminal } as any
    const res = await handleApiRequest('POST', '/api/sessions/nope/focus-terminal', { registry: new SessionRegistry(), platform, port: 1234 })
    expect(res?.status).toBe(404)
  })

  it('returns 422 when ppid is 0', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, ppid: 0 })
    const focusTerminal = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, focusTerminal } as any
    const res = await handleApiRequest('POST', '/api/sessions/sid/focus-terminal', { registry, platform, port: 1234 })
    expect(res?.status).toBe(422)
  })

  it('calls platform.focusTerminal with ppid', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, ppid: 4321 })
    const focusTerminal = vi.fn(async () => undefined)
    const platform = { platform: 'darwin' as const, focusTerminal } as any
    const res = await handleApiRequest('POST', '/api/sessions/sid/focus-terminal', { registry, platform, port: 1234 })
    expect(res?.status).toBe(200)
    expect(focusTerminal).toHaveBeenCalledWith(4321)
  })

  it('soft-fails when focusTerminal rejects', async () => {
    const registry = new SessionRegistry()
    registry.upsert('sid', { lastUpdate: 0, ppid: 999 })
    const focusTerminal = vi.fn(async () => { throw new Error('wmctrl not found') })
    const platform = { platform: 'darwin' as const, focusTerminal } as any
    const res = await handleApiRequest('POST', '/api/sessions/sid/focus-terminal', { registry, platform, port: 1234 })
    expect(res?.status).toBe(200)
  })
})
