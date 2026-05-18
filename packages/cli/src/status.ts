import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const DAEMON_JSON = join(homedir(), '.claude-cockpit', 'daemon.json')
const DB_PATH     = join(homedir(), '.claude-cockpit', 'cockpit.db')
const SETTINGS    = join(homedir(), '.claude', 'settings.json')
const CONFIG      = join(homedir(), '.claude-cockpit', 'config.json')

interface DaemonInfo { pid: number; port: number; startedAt: number }

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return null }
}

function fmtAgo(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function readPkgVersion(): string {
  // status.ts may be loaded from packages/cli/src or from bundled dist/cli.js;
  // try a few paths to find the published package.json.
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', '..', '..', 'package.json'),    // packages/cli/src → repo root
    join(here, '..', 'package.json'),                 // dist/cli.js → dist/../package.json (npm bundle)
    join(here, '..', '..', 'package.json'),           // alt
  ]
  for (const p of candidates) {
    const pkg = readJson<{ version: string }>(p)
    if (pkg?.version) return pkg.version
  }
  return 'unknown'
}

export async function runStatus(): Promise<number> {
  const daemon = readJson<DaemonInfo>(DAEMON_JSON)
  const version = readPkgVersion()

  console.log(`claude-cockpit v${version}\n`)

  console.log('Daemon')
  if (daemon) {
    const uptimeMs = Date.now() - daemon.startedAt
    console.log(`  pid:      ${daemon.pid}`)
    console.log(`  port:     ${daemon.port}`)
    console.log(`  uptime:   ${fmtAgo(uptimeMs)}`)
    console.log(`  started:  ${new Date(daemon.startedAt).toISOString().replace('T', ' ').slice(0, 19)}`)
  } else {
    console.log('  not running (will lazy-start on next CC refresh)')
  }
  console.log('')

  console.log('History (SQLite)')
  if (existsSync(DB_PATH)) {
    const dbSize = statSync(DB_PATH).size
    const walPath = DB_PATH + '-wal'
    const walSize = existsSync(walPath) ? statSync(walPath).size : 0
    const totalBytes = dbSize + walSize
    console.log(`  path:     ${DB_PATH}`)
    console.log(`  size:     ${(totalBytes / 1024 / 1024).toFixed(1)} MB (incl WAL)`)
  } else {
    console.log('  not yet created (will appear after first session)')
  }
  console.log('')

  const config = readJson<{ statuslinePreset?: string }>(CONFIG)
  const settings = readJson<{ statusLine?: { command?: string } }>(SETTINGS)
  console.log('Statusline plugin')
  const wiredUp = settings?.statusLine?.command?.includes('claude-cockpit') ?? false
  console.log(`  wired up: ${wiredUp ? '✓' : '✗  (run claude-cockpit configure to set up)'}`)
  console.log(`  preset:   ${config?.statuslinePreset ?? 'essential (default)'}`)

  return 0
}
