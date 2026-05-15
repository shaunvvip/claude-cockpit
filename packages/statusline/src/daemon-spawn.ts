import { spawn } from 'node:child_process'
import { pingDaemon } from './rpc-client.js'
import { clearStaleSocket } from '../../daemon/src/stale-sock.js'

export interface SpawnDaemonOptions {
  command: string
  args: string[]
  sockPath: string
  waitMs: number
  env?: NodeJS.ProcessEnv
}

export async function spawnDaemon(opts: SpawnDaemonOptions): Promise<() => Promise<void>> {
  const child = spawn(opts.command, opts.args, {
    detached: true,
    stdio: 'ignore',
    env: opts.env ?? process.env,
  })
  child.unref()

  const deadline = Date.now() + opts.waitMs
  while (Date.now() < deadline) {
    if (await pingDaemon(opts.sockPath, 200)) {
      return async () => {
        try { if (child.pid) process.kill(child.pid, 'SIGTERM') } catch { /* already dead */ }
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`daemon did not respond within ${opts.waitMs}ms`)
}

export async function ensureDaemon(opts: SpawnDaemonOptions): Promise<void> {
  if (await pingDaemon(opts.sockPath, 200)) return
  clearStaleSocket(opts.sockPath)
  await spawnDaemon(opts)
}
