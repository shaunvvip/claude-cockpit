import { useEffect, useState } from 'react'
import { apiUrl, wsUrl } from '../lib/api.js'

export interface SessionEvent {
  type: 'TOOL_USE' | 'USAGE' | 'TODOS' | 'FILE_EDIT'
  ts: number
  [k: string]: unknown
}

export function useSessionEvents(sessionId: string): { events: SessionEvent[] } {
  const [events, setEvents] = useState<SessionEvent[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/events`))
      if (!res.ok) return
      const body = await res.json() as { events: SessionEvent[] }
      if (!cancelled) setEvents(body.events)
    })()
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    const ws = new WebSocket(wsUrl())
    ws.onmessage = (e) => {
      const ev = JSON.parse((e as MessageEvent).data as string) as any
      if (ev.type === 'SESSION_UPSERT' && ev.session?.sessionId === sessionId) {
        void fetch(apiUrl(`/api/sessions/${sessionId}/events`))
          .then((r) => r.ok ? r.json() : null)
          .then((b: any) => { if (b) setEvents(b.events) })
      }
    }
    return () => ws.close()
  }, [sessionId])

  return { events }
}
