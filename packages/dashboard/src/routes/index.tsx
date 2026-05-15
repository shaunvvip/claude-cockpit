import { createRoute } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { useSessionStream } from '../hooks/useSessionStream.js'
import { KpiBar } from '../components/KpiBar.js'
import { SessionCard } from '../components/SessionCard.js'
import { Sparkline } from '../components/Sparkline.js'

// Mock 24h data — Phase 3 will replace with SQLite history
const xs24 = Array.from({ length: 24 }, (_, i) => i)
const mockCost24 = xs24.map(() => Math.random() * 2)
const mockCtx24 = xs24.map(() => Math.random() * 100)

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/',
  component: () => {
    const { sessions } = useSessionStream()
    return (
      <div>
        <KpiBar sessions={sessions} />
        <div className="text-cockpit-muted text-[10px] mb-2">ACTIVE SESSIONS</div>
        {sessions.length === 0 && <p className="text-cockpit-muted">No active sessions yet.</p>}
        {sessions.map((s) => <SessionCard key={s.sessionId} session={s} />)}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
            <div className="text-cockpit-muted text-[10px] mb-1">COST · 24h (mock)</div>
            <Sparkline data={[xs24, mockCost24]} color="#73bf69" />
          </div>
          <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
            <div className="text-cockpit-muted text-[10px] mb-1">CONTEXT % · 实时 (mock)</div>
            <Sparkline data={[xs24, mockCtx24]} color="#5794f2" />
          </div>
        </div>
      </div>
    )
  },
})
