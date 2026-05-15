import type { AlertEvent, SessionState } from '@claude-cockpit/shared'
import type { Rule, RuleConfig, RuleContext } from './types.js'
import { DEFAULT_RULE_CONFIG } from './types.js'

const DEDUP_WINDOW_MS = 10 * 60 * 1000  // 同 session + 同规则 10min 内只发一次

export interface EngineOptions {
  rules: Rule[]
  config?: RuleConfig
  disabledRuleIds?: Set<string>
  now?: () => number
  getRecentEvents?: (sessionId: string) => readonly RuleContext['recentEvents'][number][]
}

export class RuleEngine {
  private readonly dedupTable = new Map<string, number>()  // "${sid}:${rid}" → lastFiredTs
  private readonly rules: Rule[]
  private readonly config: RuleConfig
  private readonly disabled: Set<string>
  private readonly now: () => number
  private readonly getRecentEvents: (sessionId: string) => readonly RuleContext['recentEvents'][number][]

  // baseline state for cost-spike
  private totalCost = 0
  private totalActiveSec = 0
  private lastBaselineTickMs: number | undefined

  constructor(opts: EngineOptions) {
    this.rules = opts.rules
    this.config = opts.config ?? DEFAULT_RULE_CONFIG
    this.disabled = opts.disabledRuleIds ?? new Set()
    this.now = opts.now ?? Date.now
    this.getRecentEvents = opts.getRecentEvents ?? (() => [])
  }

  /** 主流程：扫一遍所有 session，命中规则就吐 AlertEvent 数组 */
  tick(sessions: SessionState[]): AlertEvent[] {
    const now = this.now()
    this.updateBaseline(sessions, now)

    const out: AlertEvent[] = []
    for (const session of sessions) {
      if (session.status === 'closed') continue
      const ctx: RuleContext = {
        now,
        recentEvents: this.getRecentEvents(session.sessionId),
        rolling: {
          perSecondCostAvg: this.totalActiveSec > 0 ? this.totalCost / this.totalActiveSec : 0,
        },
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

  private updateBaseline(sessions: SessionState[], now: number): void {
    if (this.lastBaselineTickMs === undefined) {
      this.lastBaselineTickMs = now
      this.totalCost = sessions.reduce((acc, s) => acc + s.cost, 0)
      return
    }
    const dtSec = (now - this.lastBaselineTickMs) / 1000
    this.lastBaselineTickMs = now
    const activeCount = sessions.filter((s) => s.status !== 'closed').length
    this.totalActiveSec += activeCount * dtSec
    this.totalCost = sessions.reduce((acc, s) => acc + s.cost, 0)
  }
}
