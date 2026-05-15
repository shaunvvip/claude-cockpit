import type { McpServerInfo } from '@claude-cockpit/shared'
import { palette } from '../lib/colors.js'

const HEALTH_COLOR: Record<McpServerInfo['health'], string> = {
  healthy: palette.ok,
  degraded: palette.warn,
  down: palette.crit,
}

export function McpHealthBar({ servers }: { servers: McpServerInfo[] }) {
  if (servers.length === 0) return <span className="text-cockpit-muted text-[10px]">no MCP</span>
  return (
    <span className="text-[10px] text-cockpit-muted">
      MCP{' '}
      {servers.map((s) => (
        <span key={s.name} title={`${s.name}: ${s.health}`} style={{ color: HEALTH_COLOR[s.health] }}>●</span>
      ))}
    </span>
  )
}
