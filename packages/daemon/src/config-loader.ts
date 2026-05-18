import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AlertRuleId } from '@claude-cockpit/shared'
import { DEFAULT_RULE_CONFIG, type RuleConfig } from './rules/types.js'

export interface CockpitConfig {
  disabledRules: Set<AlertRuleId>
  ruleConfig: RuleConfig
  retentionDays?: number
  statuslinePreset?: 'minimal' | 'essential' | 'full'
  dashboardTheme?: 'auto' | 'light' | 'dark'
  dashboardLang?: 'en' | 'zh-CN'
  historyFlushMs?: number
}

interface RawConfig {
  disabledRules?: string[]
  ctxHighThresholdPct?: number
  costSpikeMultiplier?: number
  loopDetectThreshold?: number
  loopDetectWindowMs?: number
  subagentStuckMinutes?: number
  retentionDays?: number
  statuslinePreset?: string
  dashboardTheme?: string
  dashboardLang?: string
  historyFlushMs?: number
}

const VALID_RULE_IDS = new Set<AlertRuleId>(['ctx-high', 'cost-spike', 'loop-detect', 'subagent-stuck'])

export function loadConfig(path: string = join(homedir(), '.claude-cockpit', 'config.json')): CockpitConfig {
  const fallback: CockpitConfig = {
    disabledRules: new Set(),
    ruleConfig: DEFAULT_RULE_CONFIG,
  }
  if (!existsSync(path)) return fallback
  let raw: RawConfig
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as RawConfig
  } catch (e) {
    console.error('[cockpit] config.json invalid, ignoring:', e)
    return fallback
  }
  const disabled = new Set<AlertRuleId>()
  for (const id of raw.disabledRules ?? []) {
    if (VALID_RULE_IDS.has(id as AlertRuleId)) disabled.add(id as AlertRuleId)
  }
  const ruleConfig: RuleConfig = {
    ctxHighThresholdPct:    raw.ctxHighThresholdPct    ?? DEFAULT_RULE_CONFIG.ctxHighThresholdPct,
    costSpikeMultiplier:    raw.costSpikeMultiplier    ?? DEFAULT_RULE_CONFIG.costSpikeMultiplier,
    loopDetectThreshold:    raw.loopDetectThreshold    ?? DEFAULT_RULE_CONFIG.loopDetectThreshold,
    loopDetectWindowMs:     raw.loopDetectWindowMs     ?? DEFAULT_RULE_CONFIG.loopDetectWindowMs,
    subagentStuckMinutes:   raw.subagentStuckMinutes   ?? DEFAULT_RULE_CONFIG.subagentStuckMinutes,
  }
  const retentionDays = typeof raw.retentionDays === 'number' && raw.retentionDays > 0 ? raw.retentionDays : undefined

  const validPresets = new Set(['minimal', 'essential', 'full'])
  const validThemes = new Set(['auto', 'light', 'dark'])
  const validLangs = new Set(['en', 'zh-CN'])

  const statuslinePreset =
    typeof raw.statuslinePreset === 'string' && validPresets.has(raw.statuslinePreset)
      ? raw.statuslinePreset as 'minimal' | 'essential' | 'full'
      : undefined

  const dashboardTheme =
    typeof raw.dashboardTheme === 'string' && validThemes.has(raw.dashboardTheme)
      ? raw.dashboardTheme as 'auto' | 'light' | 'dark'
      : undefined

  const dashboardLang =
    typeof raw.dashboardLang === 'string' && validLangs.has(raw.dashboardLang)
      ? raw.dashboardLang as 'en' | 'zh-CN'
      : undefined

  const historyFlushMs =
    typeof raw.historyFlushMs === 'number' && raw.historyFlushMs > 0
      ? raw.historyFlushMs
      : undefined

  return {
    disabledRules: disabled,
    ruleConfig,
    ...(retentionDays !== undefined && { retentionDays }),
    ...(statuslinePreset !== undefined && { statuslinePreset }),
    ...(dashboardTheme !== undefined && { dashboardTheme }),
    ...(dashboardLang !== undefined && { dashboardLang }),
    ...(historyFlushMs !== undefined && { historyFlushMs }),
  }
}
