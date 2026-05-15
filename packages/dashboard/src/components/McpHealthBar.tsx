import type { McpServerInfo } from '@claude-cockpit/shared'
import { palette } from '../lib/colors.js'

const HEALTH_COLOR: Record<McpServerInfo['health'], string> = {
  healthy: palette.ok,
  degraded: palette.warn,
  down: palette.crit,
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000   // < 5min since last call → bright
const IDLE_WINDOW_MS = 30 * 60 * 1000    // > 30min → dim (configured but inactive)

function ago(ts: number, now: number): string {
  const m = Math.floor((now - ts) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function McpHealthBar({ servers, now = Date.now() }: { servers: McpServerInfo[]; now?: number }) {
  if (servers.length === 0) return <span className="text-cockpit-muted text-[10px]">no MCP</span>
  return (
    <span className="text-[10px] text-cockpit-muted">
      MCP{' '}
      {servers.map((s) => {
        const sinceMs = s.lastCallTs ? now - s.lastCallTs : Infinity
        const isActive = sinceMs < ACTIVE_WINDOW_MS
        const isIdle = sinceMs > IDLE_WINDOW_MS
        const tooltip = s.lastCallTs
          ? `${s.name}: ${s.health} · last used ${ago(s.lastCallTs, now)}`
          : `${s.name}: ${s.health} · not used yet`
        return (
          <span
            key={s.name}
            title={tooltip}
            style={{
              color: HEALTH_COLOR[s.health],
              opacity: isIdle ? 0.35 : 1,
              textShadow: isActive ? `0 0 4px ${HEALTH_COLOR[s.health]}` : undefined,
            }}
          >●</span>
        )
      })}
    </span>
  )
}
