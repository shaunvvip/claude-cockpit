import type { AlertEvent, SessionState } from '@claude-cockpit/shared'
import type { Rule, RuleConfig, RuleContext } from './types.js'
import type { TranscriptEvent } from '../transcript-watcher.js'
import { DEFAULT_RULE_CONFIG } from './types.js'

const DEDUP_WINDOW_MS = 10 * 60 * 1000

export interface EngineOptions {
  rules: Rule[]
  config?: RuleConfig
  disabledRuleIds?: Set<string>
  now?: () => number
  getRecentEvents?: (sessionId: string) => readonly TranscriptEvent[]
  getBaseline?: (now: number) => number      // calls historyStore.computeBaselinePerSecond
}

export class RuleEngine {
  private readonly dedupTable = new Map<string, number>()
  private readonly rules: Rule[]
  private readonly config: RuleConfig
  private readonly disabled: Set<string>
  private readonly now: () => number
  private readonly getRecentEvents: (sessionId: string) => readonly TranscriptEvent[]
  private readonly getBaseline: (now: number) => number

  constructor(opts: EngineOptions) {
    this.rules = opts.rules
    this.config = opts.config ?? DEFAULT_RULE_CONFIG
    this.disabled = opts.disabledRuleIds ?? new Set()
    this.now = opts.now ?? Date.now
    this.getRecentEvents = opts.getRecentEvents ?? (() => [])
    this.getBaseline = opts.getBaseline ?? (() => 0)
  }

  tick(sessions: SessionState[]): AlertEvent[] {
    const now = this.now()
    const baseline = this.getBaseline(now)

    const out: AlertEvent[] = []
    for (const session of sessions) {
      if (session.status === 'closed') continue
      const ctx: RuleContext = {
        now,
        recentEvents: this.getRecentEvents(session.sessionId),
        history: { perSecondCostAvg7d: baseline },
        config: this.config,
      }
      for (const rule of this.rules) {
        if (this.disabled.has(rule.id)) continue
        const alert = rule.evaluate(session, ctx)
        if (!alert) continue
        const key = `${session.sessionId}:${rule.id}`
        const last = this.dedupTable.get(key)
        if (last !== undefined && now - last < DEDUP_WINDOW_MS) continue
        this.dedupTable.set(key, now)
        out.push(alert)
      }
    }
    return out
  }
}
