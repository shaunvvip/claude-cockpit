import type { SessionState } from '@claude-cockpit/shared'
import { Link } from '@tanstack/react-router'
import { ctxColor, palette } from '../lib/colors.js'
import { McpHealthBar } from './McpHealthBar.js'
import { UsageBars } from './UsageBars.js'

const STATUS_BG: Record<SessionState['status'], string> = {
  busy: palette.ok, idle: palette.muted, waiting: palette.info, closed: palette.crit,
}

export function SessionCard({ session: s }: { session: SessionState }) {
  const cwdShort = s.cwd.split('/').filter(Boolean).slice(-1)[0] ?? s.cwd
  const todosDone = s.todos.filter((t) => t.completed).length
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: s.sessionId }}
      className="block bg-cockpit-panel border border-cockpit-line rounded p-3 mb-1 hover:border-cockpit-info cursor-pointer"
      style={{ borderLeft: `3px solid ${STATUS_BG[s.status]}` }}
    >
      <div className="grid grid-cols-[1fr_60px_60px_60px_60px_80px] gap-3 items-center text-xs">
        <div>
          <div className="text-cockpit-text font-semibold">{cwdShort}</div>
          <div className="text-cockpit-muted text-[10px]">{s.model} · sid {s.sessionId.slice(0, 6)}</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">CTX</div>
          <div style={{ color: ctxColor(s.ctxPct) }}>{Math.round(s.ctxPct)}%</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">COST</div>
          <div>${s.cost.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">TOOLS</div>
          <div className="text-cockpit-info">{s.tools.length}</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">TODOS</div>
          <div>{todosDone}/{s.todos.length || '—'}</div>
        </div>
        <div className="text-right">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: STATUS_BG[s.status], color: '#0e1419' }}>
            ● {s.status}
          </span>
        </div>
      </div>
      <UsageBars session={s} />
      <div className="mt-2">
        <McpHealthBar servers={s.mcpServers} />
      </div>
    </Link>
  )
}
