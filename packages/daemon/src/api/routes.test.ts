import { describe, it, expect, vi } from 'vitest'
import { handleApiRequest } from './routes.js'
import { SessionRegistry } from '../session-registry.js'
import type { PlatformActions } from '../platform/index.js'

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

  it('POST open-file returns 400 when no recent edit', async () => {
    const ctx = makeCtx()
    ctx.registry.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = await handleApiRequest('POST', '/api/sessions/a/open-file', ctx)
    expect(res?.status).toBe(400)
  })

  it('POST open-file returns 200 with scaffold note when recent Edit exists', async () => {
    const ctx = makeCtx()
    ctx.registry.upsert('a', {
      cwd: '/x', model: 'm', transcriptPath: '/t', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1,
      tools: [{ ts: 1, name: 'Edit', status: 'ok' }],
    })
    const res = await handleApiRequest('POST', '/api/sessions/a/open-file', ctx)
    expect(res?.status).toBe(200)
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
