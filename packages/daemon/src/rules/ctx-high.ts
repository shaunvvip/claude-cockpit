import type { Rule } from './types.js'

export const ctxHighRule: Rule = {
  id: 'ctx-high',
  evaluate(session, ctx) {
    if (session.ctxPct < ctx.config.ctxHighThresholdPct) return null
    return {
      ruleId: 'ctx-high',
      sessionId: session.sessionId,
      ts: ctx.now,
      title: `context ${Math.round(session.ctxPct)}% — ${session.cwd.split('/').slice(-1)[0]}`,
      body: 'Consider /compact before context overflows.',
    }
  },
}
