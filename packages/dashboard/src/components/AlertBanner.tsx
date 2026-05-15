import { palette } from '../lib/colors.js'

const RULE_LABELS: Record<string, { color: string; label: string }> = {
  'ctx-high':         { color: palette.crit,    label: 'Context near limit' },
  'cost-spike':       { color: palette.warning, label: 'Cost spike' },
  'loop-detect':      { color: palette.warning, label: 'Possible loop' },
  'subagent-stuck':   { color: palette.warning, label: 'Subagent stuck' },
}

export function AlertBanner({ ruleId }: { ruleId: string | undefined }) {
  if (!ruleId) return null
  const cfg = RULE_LABELS[ruleId] ?? { color: palette.warning, label: ruleId }
  return (
    <div
      role="alert"
      data-rule-id={ruleId}
      className="px-3 py-2 mb-3 rounded text-xs font-medium"
      style={{ background: cfg.color, color: '#0e1419' }}
    >
      ● {cfg.label} · alert={ruleId}
    </div>
  )
}
