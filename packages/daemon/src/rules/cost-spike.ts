import type { Rule } from './types.js'

export const costSpikeRule: Rule = {
  id: 'cost-spike',
  evaluate(session, ctx) {
    if (ctx.history.perSecondCostAvg7d <= 0) return null

    // v0.9: compare instantaneous rate (cost / activeSec) with SQLite 7-day baseline.
    const activeSec = Math.max(1, (ctx.now - session.startedAt) / 1000)
    const sessionRate = session.cost / activeSec
    const threshold = ctx.history.perSecondCostAvg7d * ctx.config.costSpikeMultiplier
    if (sessionRate <= threshold) return null

    return {
      ruleId: 'cost-spike',
      sessionId: session.sessionId,
      ts: ctx.now,
      title: `cost spike — $${session.cost.toFixed(2)} on ${session.cwd.split('/').slice(-1)[0]}`,
      body: `Rate ${(sessionRate * 3600).toFixed(2)}/hr vs 7d avg ${(ctx.history.perSecondCostAvg7d * 3600).toFixed(2)}/hr.`,
    }
  },
}
