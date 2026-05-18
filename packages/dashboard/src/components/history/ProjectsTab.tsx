import { useState } from 'react'
import { useProjects } from '../../hooks/useHistory.js'
import { apiUrl } from '../../lib/api.js'

function ago(ts: number, now: number = Date.now()): string {
  if (!ts) return 'never'
  const m = Math.floor((now - ts) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ProjectsTab() {
  const projects = useProjects(30)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const onClear = async () => {
    setClearing(true)
    try {
      const res = await fetch(apiUrl('/api/history/clear'), { method: 'POST' })
      if (res.ok) {
        setConfirmOpen(false)
        window.location.reload()
      }
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-[10px] text-cockpit-muted hover:text-cockpit-crit border border-cockpit-line rounded px-2 py-1"
        >
          Clear all history…
        </button>
      </div>

      {projects.loading && <p className="text-cockpit-muted text-xs">Loading…</p>}
      {projects.error && <p className="text-cockpit-crit text-xs">Error: {projects.error}</p>}
      {projects.data && projects.data.projects.length === 0 && <p className="text-cockpit-muted text-xs">No projects in this window.</p>}
      {projects.data?.projects.map(p => (
        <div key={p.key} className="bg-cockpit-panel border border-cockpit-line rounded p-3">
          <div className="text-cockpit-text font-semibold">{p.label}</div>
          <div className="text-cockpit-muted text-[10px] mb-2">{p.key}</div>
          <div className="text-cockpit-text text-xs">
            ${p.cost.toFixed(2)} · {p.sessions} sessions · {(p.totalTokens / 1_000_000).toFixed(2)}M tokens · last {ago(p.lastUpdate)}
          </div>
        </div>
      ))}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-cockpit-bg border border-cockpit-line rounded p-4 max-w-sm">
            <div className="text-cockpit-text mb-3">Permanently delete all history?</div>
            <div className="text-cockpit-muted text-xs mb-4">
              This empties all 4 tables (sessions / tool_calls / events / usage_snapshots). Cannot be undone.
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmOpen(false)} className="px-3 py-1 border border-cockpit-line rounded text-xs">Cancel</button>
              <button onClick={onClear} disabled={clearing}
                className="px-3 py-1 bg-cockpit-crit text-cockpit-bg rounded text-xs">
                {clearing ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
