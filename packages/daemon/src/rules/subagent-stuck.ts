import type { Rule } from './types.js'

export const subagentStuckRule: Rule = {
  id: 'subagent-stuck',
  evaluate(session, ctx) {
    const stuckMs = ctx.config.subagentStuckMinutes * 60 * 1000
    let lastTaskTs: number | undefined
    let lastAnyToolTs: number | undefined
    for (const e of ctx.recentEvents) {
      if (e.type !== 'TOOL_USE') continue
      lastAnyToolTs = lastAnyToolTs === undefined ? e.ts : Math.max(lastAnyToolTs, e.ts)
      if (e.name === 'Task') {
        lastTaskTs = lastTaskTs === undefined ? e.ts : Math.max(lastTaskTs, e.ts)
      }
    }
    if (lastTaskTs === undefined) return null
    if (ctx.now - lastTaskTs < stuckMs) return null
    if (lastAnyToolTs !== undefined && lastAnyToolTs > lastTaskTs) return null

    return {
      ruleId: 'subagent-stuck',
      sessionId: session.sessionId,
      ts: ctx.now,
      title: `subagent stuck — ${Math.round((ctx.now - lastTaskTs) / 60_000)} min`,
      body: 'Task subagent has been running without tool activity. Consider stopping if it looks frozen.',
    }
  },
}
