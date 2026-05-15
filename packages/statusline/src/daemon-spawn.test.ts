import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnDaemon } from './daemon-spawn.js'
import { pingDaemon } from './rpc-client.js'

let dir: string
let cleanupFn: (() => Promise<void>) | undefined

afterEach(async () => {
  if (cleanupFn) await cleanupFn()
  cleanupFn = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const here = dirname(fileURLToPath(import.meta.url))
function dirname(p: string): string { return p.slice(0, p.lastIndexOf('/')) }

const DAEMON_BIN = resolve(here, '../../daemon/bin/daemon.ts')

describe('spawnDaemon', () => {
  it('starts a daemon when none is running and ping succeeds', async () => {
    dir = mkdtempSync(join(tmpdir(), 'spawn-'))
    const sockPath = join(dir, 'claude-cockpit.sock')
    cleanupFn = await spawnDaemon({
      command: 'npx',
      args: ['tsx', DAEMON_BIN],
      sockPath,
      waitMs: 10000,
      env: { ...process.env, TMPDIR: dir, HOME: dir },
    })
    expect(await pingDaemon(sockPath, 500)).toBe(true)
  }, 15000)
})
