import { startSocketServer } from './socket-server.js'
import { startHttpServer } from './http-server.js'
import { getSocketPath, getRuntimeInfoPath, getCockpitDir } from './paths.js'
import { writeRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'
import { IdleChecker } from './lifecycle.js'
import { SessionRegistry } from './session-registry.js'
import { WsBroadcaster } from './api/ws.js'
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

  const dist = findDashboardDist()
  const http = await startHttpServer({
    port: opts.port ?? 0,
    registry,
    broadcaster,
    ...(dist !== undefined && { staticDir: dist }),
  })
  const sock = await startSocketServer(getSocketPath(), (frame) => {
    if (frame.type === 'UPDATE_SESSION') {
      const updated = registry.upsert(frame.sessionId, {
        ...frame.payload,
        lastUpdate: Date.now(),
      })
      broadcaster.publishUpsert(updated)
    }
    opts.onFrame?.(frame)
  })

  writeRuntimeInfo(getRuntimeInfoPath(), {
    pid: process.pid,
    port: http.port,
    startedAt: Date.now(),
  })

  // Forward-declare shutdown so the timer callback can reference it
  let shutdownInvoked = false
  const shutdown = async (): Promise<void> => {
    if (shutdownInvoked) return
    shutdownInvoked = true
    clearInterval(idleTimer)
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
