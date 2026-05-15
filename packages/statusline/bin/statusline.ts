#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runStatusline } from '../src/main.js'
import { detectOsc8Support } from '../src/osc8.js'
import { pingDaemon, sendUpdateSession } from '../src/rpc-client.js'
import { ensureDaemon } from '../src/daemon-spawn.js'
import { readRuntimeInfo } from '../../daemon/src/runtime-info.js'
import type { SessionState } from '@claude-cockpit/shared'

const here = dirname(fileURLToPath(import.meta.url))
const daemonBin = resolve(here, '../../daemon/bin/daemon.ts')

async function fetchSession(port: number, sid: string): Promise<SessionState | undefined> {
  try {
    const res = await fetch(`http://localhost:${port}/api/sessions/${sid}`)
    if (!res.ok) return undefined
    return await res.json() as SessionState
  } catch { return undefined }
}

const stdin = readFileSync(0, 'utf8')
const sockPath = join(tmpdir(), 'claude-cockpit.sock')

const wasAlive = await pingDaemon(sockPath, 80)
if (!wasAlive) {
  void ensureDaemon({
    command: 'npx',
    args: ['tsx', daemonBin],
    sockPath,
    waitMs: 0,
  }).catch(() => undefined)
}

const out = await runStatusline({
  stdin,
  sockPath,
  detect: detectOsc8Support,
  ensureDaemon,
  pingDaemon,
  sendUpdateSession,
  readRuntimeInfo,
  fetchSession,
})
process.stdout.write(out + '\n')
