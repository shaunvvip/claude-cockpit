import { useState } from 'react'
import { useTop } from '../../hooks/useHistory.js'
import { palette } from '../../lib/colors.js'

type Metric = 'cost' | 'tokens' | 'tools'
type Dimension = 'project' | 'tool' | 'session'

function metricValue(item: { cost?: number; tokens?: number; toolCalls?: number }, metric: Metric): number {
  if (metric === 'cost') return item.cost ?? 0
  if (metric === 'tokens') return item.tokens ?? 0
  return item.toolCalls ?? 0
}

function metricLabel(metric: Metric, v: number): string {
  if (metric === 'cost') return `$${v.toFixed(2)}`
  if (metric === 'tokens') return v.toLocaleString()
  return `${v} calls`
}

export function TopTab() {
  const [metric, setMetric] = useState<Metric>('cost')
  const [dimension, setDimension] = useState<Dimension>('project')
  const top = useTop(metric, dimension, 30, 10)

  const max = top.data?.items.reduce((acc, it) => Math.max(acc, metricValue(it, metric)), 0) ?? 1

  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs">
        <div className="flex gap-1">
          {(['cost', 'tokens', 'tools'] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-2 py-1 border rounded ${metric === m ? 'bg-cockpit-info text-cockpit-bg' : 'border-cockpit-line text-cockpit-muted'}`}>
              {m}
            </button>
          ))}
        </div>
        <span className="text-cockpit-muted self-center">by</span>
        <div className="flex gap-1">
          {(['project', 'tool', 'session'] as Dimension[]).map(d => (
            <button key={d} onClick={() => setDimension(d)}
              className={`px-2 py-1 border rounded ${dimension === d ? 'bg-cockpit-info text-cockpit-bg' : 'border-cockpit-line text-cockpit-muted'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
        {top.loading && <p className="text-cockpit-muted text-xs">Loading…</p>}
        {top.error && <p className="text-cockpit-crit text-xs">Error: {top.error}</p>}
        {top.data && top.data.items.length === 0 && <p className="text-cockpit-muted text-xs">No data in this window.</p>}
        {top.data && top.data.items.map(item => {
          const v = metricValue(item, metric)
          const w = max > 0 ? (v / max) * 100 : 0
          const label = String(item.key).split('/').filter(Boolean).slice(-2).join('/') || item.key
          return (
            <div key={item.key} className="flex items-center gap-2 text-xs mb-1">
              <div className="w-40 truncate text-cockpit-text">{label}</div>
              <div className="flex-1 h-2 bg-cockpit-line rounded">
                <div className="h-2 rounded" style={{ width: `${w}%`, background: palette.info }} />
              </div>
              <div className="w-24 text-right tabular-nums text-cockpit-muted">{metricLabel(metric, v)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
