import { startSocketServer } from './socket-server.js'
import { startHttpServer } from './http-server.js'
import { getSocketPath, getRuntimeInfoPath, getCockpitDir } from './paths.js'
import { writeRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'
import { IdleChecker } from './lifecycle.js'
import { mkdirSync } from 'node:fs'
import type { RpcFrame } from '@claude-cockpit/shared'

export interface MainOptions {
  port?: number
  onFrame?: (f: RpcFrame) => void
  idleMs?: number              // override for tests; default 30 min
}

export async function startDaemon(opts: MainOptions = {}): Promise<() => Promise<void>> {
  mkdirSync(getCockpitDir(), { recursive: true })
  const http = await startHttpServer({ port: opts.port ?? 0 })
  const sock = await startSocketServer(getSocketPath(), opts.onFrame ?? (() => undefined))
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
    hasActiveBrowsers: () => false,         // wired up in Task 17 (WS broadcaster)
    lastSessionUpdate: () => undefined,     // wired up in Task 13 (SessionRegistry)
    now: () => Date.now(),
    onIdle: () => { void shutdown() },
  })
  const idleTimer: NodeJS.Timeout = setInterval(() => idleChecker.tick(), 60_000)
  idleTimer.unref()  // don't keep process alive just for idle ticking

  return shutdown
}
