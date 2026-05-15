import { describe, it, expect } from 'vitest'
import { isRpcFrame, type RpcFrame } from './protocol.js'

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
