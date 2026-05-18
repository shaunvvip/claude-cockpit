import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface StatuslineConfig {
  preset: 'minimal' | 'essential' | 'full'
}

export function readStatuslineConfig(): StatuslineConfig {
  const path = join(homedir(), '.claude-cockpit', 'config.json')
  if (!existsSync(path)) return { preset: 'essential' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const p = raw.statuslinePreset
    if (p === 'minimal' || p === 'essential' || p === 'full') return { preset: p }
  } catch { /* ignore */ }
  return { preset: 'essential' }
}
