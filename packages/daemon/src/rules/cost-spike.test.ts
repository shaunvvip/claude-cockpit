import { describe, it, expect } from 'vitest'
import { costSpikeRule } from './cost-spike.js'
import { DEFAULT_RULE_CONFIG } from './types.js'
import type { SessionState } from '@claude-cockpit/shared'

const NOW = 1_000_000_000

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '', status: 'busy',
    lastUpdate: 0, startedAt: NOW - 60 * 60 * 1000, // 1 hour ago
    ...over,
  }
}

const baseCtx = {
  now: NOW,
  recentEvents: [],
  history: { perSecondCostAvg7d: 0.0001 }, // ~$0.36/hr baseline
  config: DEFAULT_RULE_CONFIG,
}

describe('cost-spike rule', () => {
  it('fires when session rate > baseline * multiplier', () => {
    // session.cost 1.50 over 1hr = 0.000417/s, baseline 0.0001 * 2 = 0.0002, fire
    const r = costSpikeRule.evaluate(makeSession({ cost: 1.50 }), baseCtx)
    expect(r).not.toBeNull()
    expect(r!.ruleId).toBe('cost-spike')
  })

  it('does not fire below threshold', () => {
    // session.cost 0.30 over 1hr = 0.0000833/s, below baseline*2
    const r = costSpikeRule.evaluate(makeSession({ cost: 0.30 }), baseCtx)
    expect(r).toBeNull()
  })

  it('does not fire when baseline is 0 (empty db)', () => {
    const r = costSpikeRule.evaluate(makeSession({ cost: 100 }), {
      ...baseCtx, history: { perSecondCostAvg7d: 0 },
    })
    expect(r).toBeNull()
  })
})
