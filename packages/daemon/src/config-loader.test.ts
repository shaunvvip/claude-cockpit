import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from './config-loader.js'

describe('loadConfig', () => {
  let tmpFile: string

  beforeEach(() => {
    const d = mkdtempSync(join(tmpdir(), 'cfg-'))
    tmpFile = join(d, 'config.json')
  })

  afterEach(() => { try { unlinkSync(tmpFile) } catch { /* */ } })

  it('returns defaults when file does not exist', () => {
    const c = loadConfig(tmpFile)
    expect(c.disabledRules.size).toBe(0)
    expect(c.ruleConfig.loopDetectThreshold).toBe(8)
  })

  it('parses disabledRules, ignoring unknown', () => {
    writeFileSync(tmpFile, JSON.stringify({
      disabledRules: ['ctx-high', 'totally-fake'],
    }))
    const c = loadConfig(tmpFile)
    expect(c.disabledRules.has('ctx-high')).toBe(true)
    expect(c.disabledRules.size).toBe(1)
  })

  it('overrides individual thresholds', () => {
    writeFileSync(tmpFile, JSON.stringify({
      loopDetectThreshold: 15,
      ctxHighThresholdPct: 80,
    }))
    const c = loadConfig(tmpFile)
    expect(c.ruleConfig.loopDetectThreshold).toBe(15)
    expect(c.ruleConfig.ctxHighThresholdPct).toBe(80)
    expect(c.ruleConfig.costSpikeMultiplier).toBe(2.0)
  })

  it('falls back to defaults on malformed JSON', () => {
    writeFileSync(tmpFile, '{ not valid json')
    const c = loadConfig(tmpFile)
    expect(c.ruleConfig.loopDetectThreshold).toBe(8)
  })

  it('parses statuslinePreset / dashboardTheme / dashboardLang', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statuslinePreset: 'full',
      dashboardTheme: 'light',
      dashboardLang: 'zh-CN',
    }))
    const c = loadConfig(tmpFile)
    expect(c.statuslinePreset).toBe('full')
    expect(c.dashboardTheme).toBe('light')
    expect(c.dashboardLang).toBe('zh-CN')
  })

  it('ignores invalid preset / theme / lang values', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statuslinePreset: 'XXX',
      dashboardTheme: 'rainbow',
      dashboardLang: 'klingon',
    }))
    const c = loadConfig(tmpFile)
    expect(c.statuslinePreset).toBeUndefined()
    expect(c.dashboardTheme).toBeUndefined()
    expect(c.dashboardLang).toBeUndefined()
  })

  it('parses historyFlushMs when positive number', () => {
    writeFileSync(tmpFile, JSON.stringify({ historyFlushMs: 2000 }))
    const c = loadConfig(tmpFile)
    expect(c.historyFlushMs).toBe(2000)
  })
})
