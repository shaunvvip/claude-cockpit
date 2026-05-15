import type { SessionEvent } from '../hooks/useSessionEvents.js'

const WINDOW_MS = 5 * 60 * 1000

export function ToolBarChart({ events }: { events: readonly SessionEvent[] }) {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'TOOL_USE') continue
    if (e.ts < cutoff) continue
    const name = e.name as string
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = sorted[0]?.[1] ?? 1
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
      <div className="text-cockpit-muted text-[10px] mb-1">TOOLS · last 5 min</div>
      {sorted.length === 0 && <div className="text-cockpit-muted text-[10px]">—</div>}
      {sorted.map(([name, count]) => (
        <div key={name} className="flex items-center gap-2 text-xs mb-0.5">
          <div className="w-20 truncate text-cockpit-text">{name}</div>
          <div className="flex-1 h-2 bg-cockpit-line rounded">
            <div className="h-2 bg-cockpit-info rounded" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <div className="w-6 text-right text-cockpit-muted">{count}</div>
        </div>
      ))}
    </div>
  )
}
