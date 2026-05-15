import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { McpServerInfo } from '@claude-cockpit/shared'

export function parseMcpConfig(path: string): McpServerInfo[] {
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const servers = raw.mcpServers
    if (!servers || typeof servers !== 'object') return []
    return Object.keys(servers as Record<string, unknown>).map((name) => ({
      name,
      health: 'healthy' as const,
    }))
  } catch {
    return []
  }
}

export function getDefaultSettingsPath(): string {
  return join(homedir(), '.claude/settings.json')
}
