import { describe, it, expect } from 'vitest'
import { isSessionStatus, type SessionState } from './session-state.js'

describe('SessionStatus', () => {
  it('accepts the four known statuses', () => {
    expect(isSessionStatus('busy')).toBe(true)
    expect(isSessionStatus('idle')).toBe(true)
    expect(isSessionStatus('waiting')).toBe(true)
    expect(isSessionStatus('closed')).toBe(true)
  })

  it('rejects unknown statuses', () => {
    expect(isSessionStatus('unknown')).toBe(false)
    expect(isSessionStatus('')).toBe(false)
  })
})

describe('SessionState shape', () => {
  it('can be constructed with required fields only', () => {
    const s: SessionState = {
      sessionId: 'abc',
      pid: 1234,
      ppid: 1233,
      cwd: '/tmp',
      model: 'claude-opus-4-7',
      ctxPct: 0,
      cost: 0,
      tools: [],
      todos: [],
      mcpServers: [],
      transcriptPath: '/tmp/x.jsonl',
      status: 'busy',
      lastUpdate: Date.now(),
      startedAt: Date.now(),
    }
    expect(s.sessionId).toBe('abc')
  })
})
