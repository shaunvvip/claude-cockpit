import { describe, it, expect } from 'vitest'
import { isRpcFrame, type RpcFrame } from './protocol.js'
import type { AlertEvent, AlertRuleId } from './protocol.js'

describe('isRpcFrame', () => {
  it('accepts a well-formed UPDATE_SESSION frame', () => {
    const frame: RpcFrame = { type: 'UPDATE_SESSION', sessionId: 'abc', payload: {} }
    expect(isRpcFrame(frame)).toBe(true)
  })

  it('rejects null and missing type', () => {
    expect(isRpcFrame(null)).toBe(false)
    expect(isRpcFrame({ type: 'NOPE' })).toBe(false)
    expect(isRpcFrame({})).toBe(false)
  })
})

describe('AlertEvent shape', () => {
  it('accepts a well-formed alert', () => {
    const alert: AlertEvent = {
      ruleId: 'ctx-high',
      sessionId: 'sid',
      ts: Date.now(),
      title: 'context near limit',
      body: 'consider /compact',
    }
    expect(alert.ruleId).toBe('ctx-high')
  })

  it('AlertRuleId is restricted to 4 strings', () => {
    const ids: AlertRuleId[] = ['ctx-high', 'cost-spike', 'loop-detect', 'subagent-stuck']
    expect(ids).toHaveLength(4)
  })
})
