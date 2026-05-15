import type { Rule } from './types.js'

export const loopDetectRule: Rule = {
  id: 'loop-detect',
  evaluate(session, ctx) {
    const cutoff = ctx.now - ctx.config.loopDetectWindowMs
    const counts = new Map<string, number>()
    for (const e of ctx.recentEvents) {
      if (e.type !== 'FILE_EDIT') continue
      if (e.tool === 'Read') continue       // 只数 Edit/Write
      if (e.ts < cutoff) continue
      counts.set(e.path, (counts.get(e.path) ?? 0) + 1)
    }
    let offender: { path: string; count: number } | undefined
    for (const [path, count] of counts) {
      if (count > ctx.config.loopDetectThreshold) {
        if (!offender || count > offender.count) offender = { path, count }
      }
    }
    if (!offender) return null
    const base = offender.path.split('/').slice(-1)[0]
    return {
      ruleId: 'loop-detect',
      sessionId: session.sessionId,
      ts: ctx.now,
      title: `possible loop — ${base}`,
      body: `${offender.count} edits on ${base} in 10 min. (If you're refactoring, this is fine.)`,
    }
  },
}
