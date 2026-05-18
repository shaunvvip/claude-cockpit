import { describe, it, expect } from 'vitest'
import { loopDetectRule } from './loop-detect.js'
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

function fe(path: string, ts: number, tool: 'Edit' | 'Write' | 'Read' = 'Edit'): TranscriptEvent {
  return { type: 'FILE_EDIT', path, tool, ts }
}

function ctxWithEvents(events: TranscriptEvent[]) {
  return { now: NOW, recentEvents: events, history: { perSecondCostAvg7d: 0 }, config: DEFAULT_RULE_CONFIG }
}

describe('loop-detect rule', () => {
  it('fires when same path edited > threshold (default 8) in 10min', () => {
    const events: TranscriptEvent[] = []
    for (let i = 0; i < 9; i++) events.push(fe('/x/a.ts', NOW - i * 60_000))
    const r = loopDetectRule.evaluate(makeSession(), ctxWithEvents(events))
    expect(r).not.toBeNull()
    expect(r!.body).toContain('a.ts')
  })

  it('does not fire below threshold', () => {
    const events: TranscriptEvent[] = []
    for (let i = 0; i < 8; i++) events.push(fe('/x/a.ts', NOW - i * 60_000))
    const r = loopDetectRule.evaluate(makeSession(), ctxWithEvents(events))
    expect(r).toBeNull()
  })

  it('ignores Read tool (only Edit/Write count)', () => {
    const events: TranscriptEvent[] = []
    for (let i = 0; i < 20; i++) events.push(fe('/x/a.ts', NOW - i * 30_000, 'Read'))
    const r = loopDetectRule.evaluate(makeSession(), ctxWithEvents(events))
    expect(r).toBeNull()
  })

  it('ignores events older than 10 min', () => {
    const events: TranscriptEvent[] = []
    for (let i = 0; i < 15; i++) events.push(fe('/x/a.ts', NOW - 11 * 60_000 - i * 1000))
    const r = loopDetectRule.evaluate(makeSession(), ctxWithEvents(events))
    expect(r).toBeNull()
  })

  it('picks the most-edited path when multiple cross threshold', () => {
    const events: TranscriptEvent[] = []
    for (let i = 0; i < 9; i++) events.push(fe('/x/a.ts', NOW - i * 1000))
    for (let i = 0; i < 12; i++) events.push(fe('/x/b.ts', NOW - i * 1000))
    const r = loopDetectRule.evaluate(makeSession(), ctxWithEvents(events))
    expect(r!.body).toContain('b.ts')
  })
})
