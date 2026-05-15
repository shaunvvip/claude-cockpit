import { useEffect, useState } from 'react'
import type { SessionState } from '@claude-cockpit/shared'
import { apiUrl, wsUrl } from '../lib/api.js'

interface WsEvent {
  type: 'SESSION_UPSERT' | 'SESSION_REMOVED'
  session?: SessionState
  sessionId?: string
}

export function useSessionStream(): { sessions: SessionState[] } {
  const [sessions, setSessions] = useState<SessionState[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(apiUrl('/api/sessions'))
      if (!res.ok) return
      const body = await res.json() as { sessions: SessionState[] }
      if (!cancelled) setSessions(body.sessions)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const ws = new WebSocket(wsUrl())
    ws.onmessage = (e) => {
      const event = JSON.parse((e as MessageEvent).data as string) as WsEvent
      setSessions((prev) => {
        if (event.type === 'SESSION_UPSERT' && event.session) {
          const incoming = event.session
          const idx = prev.findIndex((s) => s.sessionId === incoming.sessionId)
          if (idx === -1) return [...prev, incoming]
          const next = prev.slice()
          next[idx] = incoming
          return next
        }
        if (event.type === 'SESSION_REMOVED' && event.sessionId) {
          const sid = event.sessionId
          return prev.filter((s) => s.sessionId !== sid)
        }
        return prev
      })
    }
    return () => ws.close()
  }, [])

  return { sessions }
}
