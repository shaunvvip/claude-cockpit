import type { AlertEvent, AlertRuleId, SessionState } from '@claude-cockpit/shared'
import type { TranscriptEvent } from '../transcript-watcher.js'

export interface RuleContext {
  now: number                              // ms epoch
  recentEvents: readonly TranscriptEvent[] // 最近 N 分钟，由 EventBuffer 提供
  history: { perSecondCostAvg7d: number }   // 全局基线，cost-spike 用
  config: RuleConfig
}

export interface RuleConfig {
  ctxHighThresholdPct: number              // default 90
  costSpikeMultiplier: number              // default 2.0
  loopDetectThreshold: number              // default 8 (spec §5 R12)
  loopDetectWindowMs: number               // default 10 * 60 * 1000
  subagentStuckMinutes: number             // default 5
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  ctxHighThresholdPct: 90,
  costSpikeMultiplier: 2.0,
  loopDetectThreshold: 8,
  loopDetectWindowMs: 10 * 60 * 1000,
  subagentStuckMinutes: 5,
}

export interface Rule {
  id: AlertRuleId
  evaluate(session: SessionState, ctx: RuleContext): AlertEvent | null
}
