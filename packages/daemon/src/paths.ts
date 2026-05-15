import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export function getCockpitDir(): string {
  return join(homedir(), '.claude-cockpit')
}

export function getSocketPath(): string {
  return join(tmpdir(), 'claude-cockpit.sock')
}

export function getRuntimeInfoPath(): string {
  return join(getCockpitDir(), 'daemon.json')
}

export function getCrashLogPath(): string {
  return join(getCockpitDir(), 'crash.log')
}
