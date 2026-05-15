import { describe, it, expect } from 'vitest'
import { handleApiRequest } from './routes.js'
import { SessionRegistry } from '../session-registry.js'

describe('handleApiRequest', () => {
  it('GET /api/sessions returns list as JSON', () => {
    const r = new SessionRegistry()
    r.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t.jsonl', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = handleApiRequest('GET', '/api/sessions', r)
    expect(res?.status).toBe(200)
    const body = JSON.parse(res!.body)
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].sessionId).toBe('a')
  })

  it('GET /api/sessions/:id returns single session', () => {
    const r = new SessionRegistry()
    r.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = handleApiRequest('GET', '/api/sessions/a', r)
    expect(res?.status).toBe(200)
    expect(JSON.parse(res!.body).sessionId).toBe('a')
  })

  it('returns 404 for unknown session', () => {
    expect(handleApiRequest('GET', '/api/sessions/nope', new SessionRegistry())?.status).toBe(404)
  })

  it('returns null for non-/api paths so http-server can fallthrough to static', () => {
    expect(handleApiRequest('GET', '/index.html', new SessionRegistry())).toBeNull()
  })
})
