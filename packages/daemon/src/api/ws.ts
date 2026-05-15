import type { SessionState } from '@claude-cockpit/shared'

export type WsEvent =
  | { type: 'SESSION_UPSERT'; session: SessionState }
  | { type: 'SESSION_REMOVED'; sessionId: string }

export type WsListener = (event: WsEvent) => void

export class WsBroadcaster {
  private readonly listeners = new Set<WsListener>()

  subscribe(listener: WsListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  hasActive(): boolean { return this.listeners.size > 0 }

  publishUpsert(session: SessionState): void {
    for (const l of this.listeners) l({ type: 'SESSION_UPSERT', session })
  }

  publishRemoved(sessionId: string): void {
    for (const l of this.listeners) l({ type: 'SESSION_REMOVED', sessionId })
  }
}
