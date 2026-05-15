/**
 * Slice 1 integration test
 *
 * Verifies the full alert chain:
 *   session with high ctxPct
 *     → RuleEngine.tick() fires ctx-high rule
 *     → platform.notify mock called once
 *     → WsBroadcaster delivers ALERT frame to subscriber
 *
 * This replicates the ruleTick logic in main.ts without starting the full daemon.
 */
import { describe, it, expect, vi } from 'vitest'
import { RuleEngine } from './engine.js'
import { ctxHighRule } from './ctx-high.js'
import { WsBroadcaster } from '../api/ws.js'
import type { SessionState } from '@claude-cockpit/shared'
import type { PlatformActions } from '../platform/index.js'
import type { WsEvent } from '../api/ws.js'

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sess-1',
    pid: 42,
    ppid: 1,
    cwd: '/home/user/project',
    model: 'claude-opus-4-5',
    ctxPct: 0,
    cost: 0,
    tools: [],
    todos: [],
    mcpServers: [],
    transcriptPath: '/tmp/test.jsonl',
    status: 'busy',
    lastUpdate: 1000,
    startedAt: 1000,
    ...over,
  }
}

function makeMockPlatform(): PlatformActions {
  return {
    platform: 'darwin',
    notify: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(undefined),
    clipboardWrite: vi.fn().mockResolvedValue(undefined),
    focusTerminal: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Slice 1 integration — ctx-high alert chain', () => {
  it('session at ctxPct=95 → engine fires → notify called → ALERT WS frame broadcast', async () => {
    // Arrange
    const platform = makeMockPlatform()
    const broadcaster = new WsBroadcaster()
    const engine = new RuleEngine({ rules: [ctxHighRule], now: () => 1_000 })

    const receivedEvents: WsEvent[] = []
    broadcaster.subscribe((e) => receivedEvents.push(e))

    const session = makeSession({ ctxPct: 95 })
    const httpPort = 3333

    // Act — replicate the ruleTick body from main.ts
    const alerts = engine.tick([session])
    for (const alert of alerts) {
      const deepLink = `http://localhost:${httpPort}/sessions/${alert.sessionId}?alert=${alert.ruleId}`
      await platform.notify({ title: alert.title, body: alert.body, deepLink })
      broadcaster.publishAlert(alert)
    }

    // Assert: rule engine produced exactly one ctx-high alert
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.ruleId).toBe('ctx-high')
    expect(alerts[0]!.sessionId).toBe('sess-1')

    // Assert: platform.notify was called once with the alert details
    expect(platform.notify).toHaveBeenCalledTimes(1)
    expect(platform.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: alerts[0]!.title,
        body: alerts[0]!.body,
        deepLink: expect.stringContaining('/sessions/sess-1?alert=ctx-high'),
      }),
    )

    // Assert: WS subscriber received exactly one ALERT frame
    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]).toMatchObject({
      type: 'ALERT',
      alert: {
        ruleId: 'ctx-high',
        sessionId: 'sess-1',
      },
    })
  })

  it('session below threshold → engine silent → notify not called → no WS ALERT', async () => {
    const platform = makeMockPlatform()
    const broadcaster = new WsBroadcaster()
    const engine = new RuleEngine({ rules: [ctxHighRule], now: () => 1_000 })

    const receivedEvents: WsEvent[] = []
    broadcaster.subscribe((e) => receivedEvents.push(e))

    const session = makeSession({ ctxPct: 80 })

    const alerts = engine.tick([session])
    for (const alert of alerts) {
      await platform.notify({ title: alert.title, body: alert.body })
      broadcaster.publishAlert(alert)
    }

    expect(alerts).toHaveLength(0)
    expect(platform.notify).not.toHaveBeenCalled()
    expect(receivedEvents).toHaveLength(0)
  })

  it('dedup: second tick within 10 min does not re-notify', async () => {
    const clock = vi.fn(() => 1_000)
    const platform = makeMockPlatform()
    const broadcaster = new WsBroadcaster()
    const engine = new RuleEngine({ rules: [ctxHighRule], now: clock })

    const receivedEvents: WsEvent[] = []
    broadcaster.subscribe((e) => receivedEvents.push(e))

    const session = makeSession({ ctxPct: 95 })

    // First tick — should fire
    for (const alert of engine.tick([session])) {
      await platform.notify({ title: alert.title, body: alert.body })
      broadcaster.publishAlert(alert)
    }
    expect(platform.notify).toHaveBeenCalledTimes(1)
    expect(receivedEvents).toHaveLength(1)

    // Second tick 5 minutes later — dedup suppresses
    clock.mockReturnValue(1_000 + 5 * 60 * 1_000)
    for (const alert of engine.tick([session])) {
      await platform.notify({ title: alert.title, body: alert.body })
      broadcaster.publishAlert(alert)
    }
    expect(platform.notify).toHaveBeenCalledTimes(1)   // still 1
    expect(receivedEvents).toHaveLength(1)              // still 1

    // Third tick 11 minutes later — dedup window expired, re-fires
    clock.mockReturnValue(1_000 + 11 * 60 * 1_000)
    for (const alert of engine.tick([session])) {
      await platform.notify({ title: alert.title, body: alert.body })
      broadcaster.publishAlert(alert)
    }
    expect(platform.notify).toHaveBeenCalledTimes(2)
    expect(receivedEvents).toHaveLength(2)
  })
})
