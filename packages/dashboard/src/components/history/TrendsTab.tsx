import { useTranslation } from 'react-i18next'
import { useTrends, useUsageSnapshots } from '../../hooks/useHistory.js'
import { Sparkline } from '../Sparkline.js'
import { palette } from '../../lib/colors.js'

export function TrendsTab() {
  const { t } = useTranslation()
  const trends = useTrends(30)
  const usage = useUsageSnapshots(30)

  if (trends.loading) return <p className="text-cockpit-muted text-xs">{t('history.loading')}</p>
  if (trends.error) return <p className="text-cockpit-crit text-xs">Error: {trends.error}</p>
  if (!trends.data) return null

  const { buckets, totals } = trends.data
  const dates = buckets.map(b => new Date(b.date).getTime() / 1000)
  const costs = buckets.map(b => b.cost)
  const hitRates = buckets.map(b => {
    const totalIn = b.inputTokens + b.cacheReadTokens + b.cacheCreationTokens
    return totalIn > 0 ? b.cacheReadTokens / totalIn : 0
  })

  return (
    <div className="space-y-3">
      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3 text-xs text-cockpit-text">
        {t('history.trends.totals')} <span className="font-semibold">${totals.cost.toFixed(2)}</span> · {totals.sessions} {t('history.trends.sessions')} · {(totals.cacheHitRate * 100).toFixed(0)}% {t('history.trends.cacheHit')}
      </div>

      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
        <div className="text-cockpit-muted text-[10px] mb-2">{t('history.trends.dailyCost')}</div>
        <Sparkline data={[dates, costs]} color={palette.ok} />
      </div>

      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
        <div className="text-cockpit-muted text-[10px] mb-2">{t('history.trends.cacheRate')}</div>
        <Sparkline data={[dates, hitRates]} color={palette.info} />
      </div>

      {usage.data && usage.data.snapshots.length > 0 && (
        <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
          <div className="text-cockpit-muted text-[10px] mb-2">{t('history.trends.usage')}</div>
          <Sparkline
            data={[
              usage.data.snapshots.map(s => s.ts / 1000),
              usage.data.snapshots.map(s => s.fiveHourPct ?? 0),
            ]}
            color={palette.info}
          />
          <Sparkline
            data={[
              usage.data.snapshots.map(s => s.ts / 1000),
              usage.data.snapshots.map(s => s.sevenDayPct ?? 0),
            ]}
            color={palette.warning}
          />
        </div>
      )}
    </div>
  )
}
