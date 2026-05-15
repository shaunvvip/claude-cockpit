import { describe, it, expect } from 'vitest'
import { computeCtxPct, getModelWindow } from './ctx-calc.js'

describe('getModelWindow', () => {
  it('returns 1M for [1m] variants', () => {
    expect(getModelWindow('claude-opus-4-7[1m]')).toBe(1_000_000)
  })
  it('returns 200K for default models', () => {
    expect(getModelWindow('claude-opus-4-7')).toBe(200_000)
  })
})

describe('computeCtxPct', () => {
  it('returns input/200K * 100 for opus 4.7 (200K window)', () => {
    expect(computeCtxPct({ model: 'claude-opus-4-7', inputTokens: 100_000 })).toBeCloseTo(50)
  })
  it('returns input/1M * 100 for 1M context variant', () => {
    expect(computeCtxPct({ model: 'claude-opus-4-7[1m]', inputTokens: 500_000 })).toBeCloseTo(50)
  })
  it('returns 0 for 0 tokens', () => {
    expect(computeCtxPct({ model: 'm', inputTokens: 0 })).toBe(0)
  })
  it('caps at 100', () => {
    expect(computeCtxPct({ model: 'claude-opus-4-7', inputTokens: 300_000 })).toBe(100)
  })
})
