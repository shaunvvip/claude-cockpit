import type { SessionState } from '@claude-cockpit/shared'

export function KpiBar({ sessions }: { sessions: SessionState[] }) {
  const totalCost = sessions.reduce((a, s) => a + s.cost, 0)
  const avgCtx = sessions.length === 0 ? 0 : sessions.reduce((a, s) => a + s.ctxPct, 0) / sessions.length
  return (
    <div className="grid grid-cols-5 gap-2 mb-3">
      <Kpi label="SESSIONS ACTIVE" value={String(sessions.length)} color="#5794f2" />
      <Kpi label="COST 今日" value={`$${totalCost.toFixed(2)}`} color="#73bf69" />
      <Kpi label="AVG CTX %" value={`${Math.round(avgCtx)}%`} color="#f2cc0c" />
      <Kpi label="CACHE HIT" value="—" color="#73bf69" />
      <Kpi label="SUBS USED" value="—" color="#5794f2" />
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
      <div className="text-cockpit-muted text-[10px]">{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
    </div>
  )
}
