import { createRoute, useSearch, useParams } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { useSessionStream } from '../hooks/useSessionStream.js'
import { useSessionEvents } from '../hooks/useSessionEvents.js'
import { AlertBanner } from '../components/AlertBanner.js'
import { ControlButtons } from '../components/ControlButtons.js'
import { CtxChart } from '../components/CtxChart.js'
import { ToolBarChart } from '../components/ToolBarChart.js'
import { TodosPanel } from '../components/TodosPanel.js'
import { EventTimeline } from '../components/EventTimeline.js'

export interface SessionsDetailSearch {
  alert?: string
}

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/sessions/$sessionId',
  validateSearch: (search: Record<string, unknown>): SessionsDetailSearch => {
    const result: SessionsDetailSearch = {}
    if (typeof search.alert === 'string') result.alert = search.alert
    return result
  },
  component: SessionDetailPage,
})

function SessionDetailPage() {
  const { sessionId } = useParams({ from: Route.id })
  const { alert } = useSearch({ from: Route.id })
  const { sessions } = useSessionStream()
  const session = sessions.find((s) => s.sessionId === sessionId)
  const { events } = useSessionEvents(sessionId)

  return (
    <div>
      <AlertBanner ruleId={alert} />
      <div className="text-cockpit-muted text-[10px] mb-1">SESSION DETAIL</div>
      <h1 className="text-cockpit-text font-semibold mb-1">
        {session?.cwd.split('/').slice(-1)[0] ?? sessionId.slice(0, 8)}
      </h1>
      <div className="text-cockpit-muted text-[10px] mb-3">
        {session?.model} · sid {sessionId.slice(0, 8)} · {session?.transcriptPath ?? ''}
      </div>
      <div className="mb-3"><ControlButtons sessionId={sessionId} /></div>

      {!session && <p className="text-cockpit-muted">No live data for {sessionId.slice(0, 8)}. Waiting…</p>}

      {session && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <CtxChart ctxPct={session.ctxPct} />
            <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
              <div className="text-cockpit-muted text-[10px]">COST</div>
              <div className="text-lg">${session.cost.toFixed(2)}</div>
            </div>
            <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
              <div className="text-cockpit-muted text-[10px]">CACHE READ</div>
              <div className="text-lg">{session.cacheReadTokens ?? 0}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <ToolBarChart events={events} />
            <TodosPanel todos={session.todos} />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <EventTimeline events={events} />
          </div>
        </>
      )}
    </div>
  )
}
