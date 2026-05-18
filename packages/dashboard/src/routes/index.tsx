import { createRoute } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { useSessionStream } from '../hooks/useSessionStream.js'
import { useSparkline } from '../hooks/useHistory.js'
import { KpiBar } from '../components/KpiBar.js'
import { SessionCard } from '../components/SessionCard.js'
import { Sparkline } from '../components/Sparkline.js'

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/',
  component: () => {
    const { sessions } = useSessionStream()
    const costSparkline = useSparkline('cost', 1, 'hour')
    const ctxSparkline = useSparkline('ctx', 1, 'hour')
    return (
      <div>
        <KpiBar sessions={sessions} />
        <div className="text-cockpit-muted text-[10px] mb-2">ACTIVE SESSIONS</div>
        {sessions.length === 0 && <p className="text-cockpit-muted">No active sessions yet.</p>}
        {sessions.map((s) => <SessionCard key={s.sessionId} session={s} />)}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
            <div className="text-cockpit-muted text-[10px] mb-1">COST · 24h</div>
            {costSparkline.data && costSparkline.data.buckets.length > 0 ? (
              <Sparkline
                data={[
                  costSparkline.data.buckets.map(b => b.t / 1000),
                  costSparkline.data.buckets.map(b => b.v),
                ]}
                color="#73bf69"
              />
            ) : (
              <div className="text-cockpit-muted text-[10px]">no data yet</div>
            )}
          </div>
          <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
            <div className="text-cockpit-muted text-[10px] mb-1">CONTEXT % · 24h</div>
            {ctxSparkline.data && ctxSparkline.data.buckets.length > 0 ? (
              <Sparkline
                data={[
                  ctxSparkline.data.buckets.map(b => b.t / 1000),
                  ctxSparkline.data.buckets.map(b => b.v),
                ]}
                color="#5794f2"
              />
            ) : (
              <div className="text-cockpit-muted text-[10px]">no data yet</div>
            )}
          </div>
        </div>
      </div>
    )
  },
})
