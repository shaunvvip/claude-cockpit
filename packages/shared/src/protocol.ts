import type { SessionState } from './session-state.js'

export type RpcFrame =
  | { type: 'UPDATE_SESSION'; sessionId: string; payload: Partial<SessionState> }
  | { type: 'PING' }
  | { type: 'PONG' }

const FRAME_TYPES: ReadonlySet<string> = new Set(['UPDATE_SESSION', 'PING', 'PONG'])

export function isRpcFrame(value: unknown): value is RpcFrame {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.type === 'string' && FRAME_TYPES.has(v.type)
}
