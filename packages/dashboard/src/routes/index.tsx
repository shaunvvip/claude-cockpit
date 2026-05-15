import { createRoute } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { useSessionStream } from '../hooks/useSessionStream.js'
import { KpiBar } from '../components/KpiBar.js'
import { SessionCard } from '../components/SessionCard.js'

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
      </div>
    )
  },
})
