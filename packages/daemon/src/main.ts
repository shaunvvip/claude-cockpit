import { startSocketServer } from './socket-server.js'
import { startHttpServer } from './http-server.js'
import { getSocketPath, getRuntimeInfoPath, getCockpitDir, getDbPath } from './paths.js'
import { tryOpenHistory } from './history/availability.js'
import type { HistoryStore } from './history/store.js'
import { writeRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'
import { IdleChecker } from './lifecycle.js'
import { SessionRegistry } from './session-registry.js'
import { WsBroadcaster } from './api/ws.js'
import { TranscriptWatcher } from './transcript-watcher.js'
import { computeCtxPct } from './ctx-calc.js'
import { parseMcpConfig, getDefaultSettingsPath } from './mcp-inspector.js'
import { getPlatformActions } from './platform/index.js'
import { RuleEngine } from './rules/engine.js'
import { ctxHighRule } from './rules/ctx-high.js'
import { costSpikeRule } from './rules/cost-spike.js'
import { loopDetectRule } from './rules/loop-detect.js'
import { subagentStuckRule } from './rules/subagent-stuck.js'
import { EventBuffer } from './event-buffer.js'
import { AlertStore } from './alert-store.js'
import { loadConfig } from './config-loader.js'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { RpcFrame } from '@claude-cockpit/shared'

function findDashboardDist(): string | undefined {
  // src/main.ts is at packages/daemon/src/main.ts when running via tsx (no compilation)
  // It would be at packages/daemon/dist/main.js if compiled — handle both
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../dashboard/dist'),     // packages/daemon/src/  → packages/dashboard/dist
    join(here, '../../../dashboard/dist'),  // packages/daemon/dist/ → packages/dashboard/dist
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return undefined
}

export interface MainOptions {
  port?: number
  onFrame?: (f: RpcFrame) => void
  idleMs?: number              // override for tests; default 30 min
}

export async function startDaemon(opts: MainOptions = {}): Promise<() => Promise<void>> {
  mkdirSync(getCockpitDir(), { recursive: true })

  const registry = new SessionRegistry()
  const broadcaster = new WsBroadcaster()
  const mcpServers = parseMcpConfig(getDefaultSettingsPath())

  const watchers = new Map<string, TranscriptWatcher>()

  const platform = getPlatformActions()
  const eventBuffer = new EventBuffer()
  const alertStore = new AlertStore()

  // History layer — best-effort; degrades gracefully if better-sqlite3 fails (R15)
  const historyAvail = await tryOpenHistory(getDbPath())
  const historyStore: HistoryStore | undefined = historyAvail.store
  if (!historyAvail.available) {
    console.warn('[cockpit] history layer disabled:', historyAvail.reason)
  }

  const dist = findDashboardDist()
  const http = await startHttpServer({
    port: opts.port ?? 0,
    registry,
    broadcaster,
    platform,
    alertStore,
    eventBuffer,
    ...(historyStore !== undefined && { historyStore }),
    ...(dist !== undefined && { staticDir: dist }),
  })
  const sock = await startSocketServer(getSocketPath(), async (frame) => {
    if (frame.type !== 'UPDATE_SESSION') {
      opts.onFrame?.(frame)
      return
    }

    const updated = registry.upsert(frame.sessionId, {
      ...frame.payload,
      mcpServers,
      lastUpdate: Date.now(),
    })
    broadcaster.publishUpsert(updated)
    historyStore?.recordSession(updated)
    historyStore?.recordUsage(updated, Date.now())

    // Lazy-start a watcher for this session's transcript on first sight
    if (updated.transcriptPath && !watchers.has(frame.sessionId)) {
      const sessionId = frame.sessionId
      const w = new TranscriptWatcher(updated.transcriptPath, (e) => {
        eventBuffer.push(sessionId, e)
        if (e.type === 'TOOL_USE') {
          const cur = registry.get(sessionId)
          if (!cur) return
          const newTools = [
            { ts: e.ts, name: e.name, status: 'ok' as const },
            ...cur.tools,
          ].slice(0, 50)
          // Bump Task subagent counter (uncapped, unlike tools[])
          const nextTaskCount = (cur.taskCount ?? 0) + (e.name === 'Task' ? 1 : 0)
          // Update MCP server lastCallTs when tool name matches mcp__<server>__<tool>
          let nextMcp = cur.mcpServers
          const mcpMatch = e.name.match(/^mcp__([^_]+(?:_[^_]+)*)__/)
          if (mcpMatch) {
            const server = mcpMatch[1]
            nextMcp = cur.mcpServers.map((s) =>
              s.name === server ? { ...s, lastCallTs: e.ts } : s,
            )
          }
          const next = registry.upsert(sessionId, {
            tools: newTools,
            taskCount: nextTaskCount,
            mcpServers: nextMcp,
            lastUpdate: e.ts,
          })
          broadcaster.publishUpsert(next)
          historyStore?.recordToolCall(sessionId, e.ts, e.name)
        } else if (e.type === 'USAGE') {
          const cur = registry.get(sessionId)
          if (!cur) return
          // Total tokens in context = new input + cached reads + cache creation.
          // input_tokens alone is just the prompt delta (~tens of tokens) and
          // would always render as 0% (Bug B).
          const totalInContext = e.inputTokens + e.cacheReadTokens + e.cacheCreationTokens
          const ctxPct = computeCtxPct({ model: cur.model, inputTokens: totalInContext })
          const next = registry.upsert(sessionId, {
            ctxPct,
            inputTokens: e.inputTokens,
            outputTokens: e.outputTokens,
            cacheReadTokens: e.cacheReadTokens,
            cacheCreationTokens: e.cacheCreationTokens,
            lastUpdate: e.ts,
          })
          broadcaster.publishUpsert(next)
        } else if (e.type === 'TODOS') {
          const next = registry.upsert(sessionId, {
            todos: e.items,
            lastUpdate: e.ts,
          })
          broadcaster.publishUpsert(next)
        }
        if (e.type === 'FILE_EDIT') {
          const next = registry.upsert(sessionId, {
            lastEditPath: e.path,
            lastEditTs: e.ts,
            lastUpdate: Date.now(),
          })
          broadcaster.publishUpsert(next)
        }
      })
      try {
        await w.start()
        watchers.set(sessionId, w)
      } catch {
        // transcript file may not exist yet; will retry on next UPDATE_SESSION
      }
    }

    opts.onFrame?.(frame)
  })

  writeRuntimeInfo(getRuntimeInfoPath(), {
    pid: process.pid,
    port: http.port,
    startedAt: Date.now(),
  })

  const cockpitCfg = loadConfig()
  const ruleEngine = new RuleEngine({
    rules: [ctxHighRule, costSpikeRule, loopDetectRule, subagentStuckRule],
    config: cockpitCfg.ruleConfig,
    disabledRuleIds: cockpitCfg.disabledRules,
    getRecentEvents: (sid) => eventBuffer.recent(sid, Date.now(), 30 * 60 * 1000),
  })

  // First-run test notification — surfaces macOS notification permission prompt early (R7)
  void platform.notify({
    title: 'claude-cockpit ready',
    body: 'Alerts enabled. You can disable rules in ~/.claude-cockpit/config.json.',
  }).catch(() => undefined)

  const ruleTick = setInterval(() => {
    const alerts = ruleEngine.tick(registry.list())
    for (const alert of alerts) {
      const deepLink = `http://localhost:${http.port}/sessions/${alert.sessionId}?alert=${alert.ruleId}`
      void platform.notify({ title: alert.title, body: alert.body, deepLink }).catch((e) => {
        console.error('[cockpit] notify failed:', e)
      })
      alertStore.push(alert)
      broadcaster.publishAlert(alert)
      historyStore?.recordAlert(alert)
    }
  }, 10_000)

  const flushTimer: NodeJS.Timeout | undefined = historyStore
    ? setInterval(() => { try { historyStore.flush() } catch (e) { console.error('[cockpit] history flush failed:', e) } }, 5000)
    : undefined

  // Forward-declare shutdown so the timer callback can reference it
  let shutdownInvoked = false
  const shutdown = async (): Promise<void> => {
    if (shutdownInvoked) return
    shutdownInvoked = true
    clearInterval(idleTimer)
    clearInterval(ruleTick)
    if (flushTimer) clearInterval(flushTimer)
    historyStore?.close()
    for (const w of watchers.values()) {
      try { await w.stop() } catch { /* */ }
    }
    watchers.clear()
    await sock.stop()
    await http.stop()
    deleteRuntimeInfo(getRuntimeInfoPath())
  }

  const idleChecker = new IdleChecker({
    idleMs: opts.idleMs ?? 30 * 60_000,
    hasActiveBrowsers: () => broadcaster.hasActive(),
    lastSessionUpdate: () => registry.lastSessionUpdate(),
    now: () => Date.now(),
    onIdle: () => { void shutdown() },
  })
  const idleTimer: NodeJS.Timeout = setInterval(() => {
    registry.markIdle({ now: Date.now(), idleMs: 60_000 })
    idleChecker.tick()
  }, 60_000)
  idleTimer.unref()  // don't keep process alive just for idle ticking

  // expose registry on the returned shutdown function via Object.assign — Task 16 will use this
  // for HTTP route binding without needing globalThis abuse.
  Object.assign(shutdown, { registry, http })
  return shutdown
}
