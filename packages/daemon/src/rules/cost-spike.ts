import type { Rule } from './types.js'

const MIN_AGE_MS = 30 * 60 * 1000

export const costSpikeRule: Rule = {
  id: 'cost-spike',
  evaluate(session, ctx) {
    if (ctx.now - session.startedAt < MIN_AGE_MS) return null
    if (ctx.rolling.perSecondCostAvg <= 0) return null

    // v0.5 simplified: compare instantaneous rate (cost / activeSec) with baseline.
    // Phase 3 will swap this for SQLite-backed 5min-vs-24h-avg (spec §5 R11).
    const activeSec = Math.max(1, (ctx.now - session.startedAt) / 1000)
    const sessionRate = session.cost / activeSec
    const threshold = ctx.rolling.perSecondCostAvg * ctx.config.costSpikeMultiplier
    if (sessionRate <= threshold) return null

    return {
      ruleId: 'cost-spike',
      sessionId: session.sessionId,
      ts: ctx.now,
      title: `cost spike — $${session.cost.toFixed(2)} on ${session.cwd.split('/').slice(-1)[0]}`,
      body: `Rate ${(sessionRate * 3600).toFixed(2)}/hr vs avg ${(ctx.rolling.perSecondCostAvg * 3600).toFixed(2)}/hr.`,
    }
  },
}
