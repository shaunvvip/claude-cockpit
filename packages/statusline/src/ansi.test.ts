import { describe, it, expect } from 'vitest'
import { coloredBar, getCtxColor, getQuotaColor } from './ansi.js'

describe('getCtxColor thresholds', () => {
  it('returns green below 70%', () => {
    expect(getCtxColor(0)).toBe('\x1b[32m')
    expect(getCtxColor(69)).toBe('\x1b[32m')
  })
  it('returns yellow 70-84%', () => {
    expect(getCtxColor(70)).toBe('\x1b[33m')
    expect(getCtxColor(84)).toBe('\x1b[33m')
  })
  it('returns red >=85%', () => {
    expect(getCtxColor(85)).toBe('\x1b[31m')
    expect(getCtxColor(100)).toBe('\x1b[31m')
  })
})

describe('getQuotaColor thresholds', () => {
  it('returns bright-blue below 75%', () => {
    expect(getQuotaColor(0)).toBe('\x1b[94m')
    expect(getQuotaColor(74)).toBe('\x1b[94m')
  })
  it('returns bright-magenta 75-89%', () => {
    expect(getQuotaColor(75)).toBe('\x1b[95m')
    expect(getQuotaColor(89)).toBe('\x1b[95m')
  })
  it('returns red >=90%', () => {
    expect(getQuotaColor(90)).toBe('\x1b[31m')
    expect(getQuotaColor(100)).toBe('\x1b[31m')
  })
})

describe('coloredBar', () => {
  it('fills proportional cells and dims the rest', () => {
    const bar = coloredBar(40, 10, () => '\x1b[31m')
    // 4 of 10 filled
    expect(bar).toMatch(/\x1b\[31m████\x1b\[0m\x1b\[2m░{6}\x1b\[0m/)
  })
  it('clamps negative to 0 and >100 to 100', () => {
    expect(coloredBar(-5, 5, () => '\x1b[31m')).toContain('░'.repeat(5))
    expect(coloredBar(200, 5, () => '\x1b[31m')).toContain('█'.repeat(5))
  })
})
