import { describe, it, expect, vi } from 'vitest'
import { RuleEngine } from './engine.js'
import { ctxHighRule } from './ctx-high.js'
import type { SessionState } from '@claude-cockpit/shared'

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '', status: 'busy',
    lastUpdate: 0, startedAt: 0,
    ...over,
  }
}

describe('RuleEngine', () => {
  it('runs rules and returns alerts', () => {
    const engine = new RuleEngine({ rules: [ctxHighRule], now: () => 1000 })
    const alerts = engine.tick([makeSession({ ctxPct: 95 })])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.ruleId).toBe('ctx-high')
  })

  it('dedupes same session + same rule within 10 minutes', () => {
    const clock = vi.fn(() => 1000)
    const engine = new RuleEngine({ rules: [ctxHighRule], now: clock })
    const s = makeSession({ ctxPct: 95 })
    expect(engine.tick([s])).toHaveLength(1)
    clock.mockReturnValue(1000 + 5 * 60 * 1000)  // 5 minutes later
    expect(engine.tick([s])).toHaveLength(0)
    clock.mockReturnValue(1000 + 11 * 60 * 1000) // 11 minutes later
    expect(engine.tick([s])).toHaveLength(1)
  })

  it('skips disabled rules', () => {
    const engine = new RuleEngine({
      rules: [ctxHighRule],
      disabledRuleIds: new Set(['ctx-high']),
      now: () => 1000,
    })
    expect(engine.tick([makeSession({ ctxPct: 95 })])).toHaveLength(0)
  })

  it('skips closed sessions', () => {
    const engine = new RuleEngine({ rules: [ctxHighRule], now: () => 1000 })
    expect(engine.tick([makeSession({ ctxPct: 95, status: 'closed' })])).toHaveLength(0)
  })

  it('different sessions are deduped independently', () => {
    const engine = new RuleEngine({ rules: [ctxHighRule], now: () => 1000 })
    const a = makeSession({ sessionId: 'a', ctxPct: 95 })
    const b = makeSession({ sessionId: 'b', ctxPct: 95 })
    expect(engine.tick([a, b])).toHaveLength(2)
  })
})
