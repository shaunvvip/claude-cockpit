import { describe, it, expect, vi } from 'vitest'
import { WsBroadcaster } from './ws.js'
import type { SessionState } from '@claude-cockpit/shared'
import type { AlertEvent } from '@claude-cockpit/shared'

const sample: SessionState = {
  sessionId: 'sid', pid: 0, ppid: 0, cwd: '/x', model: 'm',
  ctxPct: 0, cost: 0, tools: [], todos: [], mcpServers: [],
  transcriptPath: '/t', status: 'busy', lastUpdate: 1, startedAt: 1,
}

describe('WsBroadcaster', () => {
  it('emits SESSION_UPSERT events to subscribers', () => {
    const b = new WsBroadcaster()
    const events: unknown[] = []
    b.subscribe((e) => events.push(e))
    b.publishUpsert(sample)
    expect(events[0]).toMatchObject({ type: 'SESSION_UPSERT', session: { sessionId: 'sid' } })
  })

  it('emits SESSION_REMOVED events to subscribers', () => {
    const b = new WsBroadcaster()
    const events: unknown[] = []
    b.subscribe((e) => events.push(e))
    b.publishRemoved('sid')
    expect(events[0]).toMatchObject({ type: 'SESSION_REMOVED', sessionId: 'sid' })
  })

  it('hasActive returns true when at least one subscriber, false after unsubscribe', () => {
    const b = new WsBroadcaster()
    expect(b.hasActive()).toBe(false)
    const unsub = b.subscribe(() => undefined)
    expect(b.hasActive()).toBe(true)
    unsub()
    expect(b.hasActive()).toBe(false)
  })

  it('does not call removed listeners', () => {
    const b = new WsBroadcaster()
    const calls: string[] = []
    const unsubA = b.subscribe(() => calls.push('A'))
    b.subscribe(() => calls.push('B'))
    unsubA()
    b.publishUpsert(sample)
    expect(calls).toEqual(['B'])
  })
})

describe('WsBroadcaster.publishAlert', () => {
  it('delivers ALERT to all subscribers', () => {
    const b = new WsBroadcaster()
    const a = vi.fn()
    const c = vi.fn()
    b.subscribe(a)
    b.subscribe(c)
    const alert: AlertEvent = {
      ruleId: 'ctx-high',
      sessionId: 'sid',
      ts: 1,
      title: 't',
      body: 'b',
    }
    b.publishAlert(alert)
    expect(a).toHaveBeenCalledWith({ type: 'ALERT', alert })
    expect(c).toHaveBeenCalledWith({ type: 'ALERT', alert })
  })
})
