import { describe, it, expect } from 'vitest'
import { ctxHighRule } from './ctx-high.js'
import { DEFAULT_RULE_CONFIG } from './types.js'
import type { SessionState } from '@claude-cockpit/shared'

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x/y', model: 'claude', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '', status: 'busy',
    lastUpdate: 0, startedAt: 0,
    ...over,
  }
}

const ctx = {
  now: 1000,
  recentEvents: [],
  history: { perSecondCostAvg7d: 0 },
  config: DEFAULT_RULE_CONFIG,
}

describe('ctx-high rule', () => {
  it('fires when ctxPct >= threshold (90)', () => {
    const r = ctxHighRule.evaluate(makeSession({ ctxPct: 91 }), ctx)
    expect(r).not.toBeNull()
    expect(r!.ruleId).toBe('ctx-high')
    expect(r!.sessionId).toBe('sid')
  })

  it('does not fire below threshold', () => {
    const r = ctxHighRule.evaluate(makeSession({ ctxPct: 89 }), ctx)
    expect(r).toBeNull()
  })

  it('fires at exactly threshold', () => {
    const r = ctxHighRule.evaluate(makeSession({ ctxPct: 90 }), ctx)
    expect(r).not.toBeNull()
  })

  it('respects custom config threshold', () => {
    const customCtx = { ...ctx, config: { ...ctx.config, ctxHighThresholdPct: 50 } }
    const r = ctxHighRule.evaluate(makeSession({ ctxPct: 60 }), customCtx)
    expect(r).not.toBeNull()
  })
})
