import { describe, it, expect } from 'vitest'
import { subagentStuckRule } from './subagent-stuck.js'
import { DEFAULT_RULE_CONFIG } from './types.js'
import type { SessionState } from '@claude-cockpit/shared'
import type { TranscriptEvent } from '../transcript-watcher.js'

const NOW = 1_000_000_000

function makeSession(): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '', status: 'busy',
    lastUpdate: 0, startedAt: 0,
  }
}

function ctxWith(events: TranscriptEvent[]) {
  return { now: NOW, recentEvents: events, history: { perSecondCostAvg7d: 0 }, config: DEFAULT_RULE_CONFIG }
}

describe('subagent-stuck rule', () => {
  it('fires when Task is the latest tool and > 5min has passed', () => {
    const r = subagentStuckRule.evaluate(makeSession(), ctxWith([
      { type: 'TOOL_USE', name: 'Task', ts: NOW - 6 * 60_000 },
    ]))
    expect(r).not.toBeNull()
  })

  it('does not fire when Task is recent (< 5min)', () => {
    const r = subagentStuckRule.evaluate(makeSession(), ctxWith([
      { type: 'TOOL_USE', name: 'Task', ts: NOW - 4 * 60_000 },
    ]))
    expect(r).toBeNull()
  })

  it('does not fire when there is newer non-Task tool activity', () => {
    const r = subagentStuckRule.evaluate(makeSession(), ctxWith([
      { type: 'TOOL_USE', name: 'Task', ts: NOW - 10 * 60_000 },
      { type: 'TOOL_USE', name: 'Edit', ts: NOW - 2 * 60_000 },
    ]))
    expect(r).toBeNull()
  })

  it('does not fire when no Task in window', () => {
    const r = subagentStuckRule.evaluate(makeSession(), ctxWith([
      { type: 'TOOL_USE', name: 'Edit', ts: NOW - 6 * 60_000 },
    ]))
    expect(r).toBeNull()
  })
})
