import { describe, it, expect } from 'vitest'
import { SessionRegistry } from './session-registry.js'

const baseUpdate = {
  cwd: '/x', model: 'm', transcriptPath: '/t.jsonl', lastUpdate: 1_000,
}

describe('SessionRegistry', () => {
  it('returns empty list initially', () => {
    expect(new SessionRegistry().list()).toEqual([])
  })

  it('upsert creates a new state with defaults', () => {
    const r = new SessionRegistry()
    r.upsert('sid', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1_000 })
    const s = r.list()[0]!
    expect(s.sessionId).toBe('sid')
    expect(s.ctxPct).toBe(0)
    expect(s.tools).toEqual([])
    expect(s.status).toBe('busy')
  })

  it('upsert merges into existing state, preserving missing fields', () => {
    const r = new SessionRegistry()
    r.upsert('sid', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1_000 })
    r.upsert('sid', { ctxPct: 47, lastUpdate: 2_000 })
    const s = r.list()[0]!
    expect(s.ctxPct).toBe(47)
    expect(s.cwd).toBe('/x')
    expect(s.lastUpdate).toBe(2_000)
  })

  it('lastSessionUpdate returns max lastUpdate across all sessions', () => {
    const r = new SessionRegistry()
    r.upsert('a', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 100 })
    r.upsert('b', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 300 })
    expect(r.lastSessionUpdate()).toBe(300)
  })

  it('lastSessionUpdate returns undefined when empty', () => {
    expect(new SessionRegistry().lastSessionUpdate()).toBeUndefined()
  })

  it('markIdle moves sessions older than threshold to idle', () => {
    const r = new SessionRegistry()
    r.upsert('a', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 0 })
    r.upsert('b', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 100_000 })
    r.markIdle({ now: 100_000, idleMs: 60_000 })
    const byId = Object.fromEntries(r.list().map(s => [s.sessionId, s]))
    expect(byId.a!.status).toBe('idle')
    expect(byId.b!.status).toBe('busy')
  })
})
