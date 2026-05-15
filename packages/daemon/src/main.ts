import { startSocketServer } from './socket-server.js'
import { startHttpServer } from './http-server.js'
import { getSocketPath, getRuntimeInfoPath, getCockpitDir } from './paths.js'
import { writeRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'
import { mkdirSync } from 'node:fs'
import type { RpcFrame } from '@claude-cockpit/shared'

export interface MainOptions {
  port?: number
  onFrame?: (f: RpcFrame) => void
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
  return async () => {
    await sock.stop()
    await http.stop()
    deleteRuntimeInfo(getRuntimeInfoPath())
  }
}
