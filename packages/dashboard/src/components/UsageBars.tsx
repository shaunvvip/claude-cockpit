import type { SessionState } from '@claude-cockpit/shared'
import { palette } from '../lib/colors.js'

export function formatCountdown(resetAt: number | undefined, now: number = Date.now()): string {
  if (resetAt === undefined) return ''
  const diffMs = resetAt - now
  if (diffMs <= 0) return ''
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const remMin = m - h * 60
  if (h < 24) return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`
  const d = Math.floor(h / 24)
  const remH = h - d * 24
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`
}

// Quota thresholds match terminal statusline (claude-hud convention):
// >=90 critical, >=75 warning, else info. (ctx uses 85/70 — different metric.)
function barColor(pct: number): string {
  if (pct >= 90) return palette.crit
  if (pct >= 75) return palette.warning
  return palette.info
}

// Semantic clarification for tooltips. Anthropic's two windows behave differently:
// - 5h: rolling window that starts on first use after the prior reset
// - 7d: weekly calendar quota — aligned to your account's billing week, NOT a
//   rolling-past-7-days count. After the weekly boundary the counter goes to 0
//   and starts accumulating fresh.
const WINDOW_DESCRIPTION: Record<string, string> = {
  '5h': '5-hour rolling window (from first use after last reset)',
  '7d': 'Weekly quota — resets on your account billing-week boundary, not a rolling-7-days count',
}

function Bar({ label, pct, resetAt }: { label: string; pct: number; resetAt: number | undefined }) {
  const cd = formatCountdown(resetAt)
  const tooltip = `${WINDOW_DESCRIPTION[label] ?? label}${cd ? ` · resets in ${cd}` : ''}`
  return (
    <div className="flex items-center gap-2 text-[10px]" title={tooltip}>
      <div className="w-6 text-cockpit-muted cursor-help underline decoration-dotted decoration-cockpit-muted/40">{label}</div>
      <div className="flex-1 h-1.5 bg-cockpit-line rounded">
        <div className="h-1.5 rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor(pct) }} />
      </div>
      <div className="w-10 text-right tabular-nums" style={{ color: barColor(pct) }}>{Math.round(pct)}%</div>
      {cd && <div className="w-16 text-right text-cockpit-muted tabular-nums">{cd}</div>}
    </div>
  )
}

export function UsageBars({ session: s }: { session: SessionState }) {
  if (s.usage5hPct === undefined && s.usage7dPct === undefined) return null
  return (
    <div className="mt-2 space-y-0.5">
      {s.usage5hPct !== undefined && <Bar label="5h" pct={s.usage5hPct} resetAt={s.usage5hResetAt} />}
      {s.usage7dPct !== undefined && <Bar label="7d" pct={s.usage7dPct} resetAt={s.usage7dResetAt} />}
    </div>
  )
}
