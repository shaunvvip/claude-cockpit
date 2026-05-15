import { createConnection } from 'node:net'
import type { SessionState, RpcFrame } from '@claude-cockpit/shared'

export async function pingDaemon(sockPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection(sockPath)
    const timer = setTimeout(() => { conn.destroy(); resolve(false) }, timeoutMs)
    conn.on('connect', () => {
      conn.write(JSON.stringify({ type: 'PING' }) + '\n')
    })
    conn.on('data', (d) => {
      clearTimeout(timer)
      conn.end()
      try {
        const reply = JSON.parse(d.toString().split('\n')[0]!) as RpcFrame
        resolve(reply.type === 'PONG')
      } catch { resolve(false) }
    })
    conn.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

export function sendUpdateSession(
  sockPath: string,
  sessionId: string,
  payload: Partial<SessionState>,
): Promise<void> {
  return new Promise((resolve) => {
    const conn = createConnection(sockPath)
    conn.on('connect', () => {
      const frame: RpcFrame = { type: 'UPDATE_SESSION', sessionId, payload }
      conn.write(JSON.stringify(frame) + '\n')
    })
    conn.on('data', () => { conn.end(); resolve() })
    conn.on('error', () => resolve())   // fire-and-forget
    setTimeout(() => { conn.destroy(); resolve() }, 300)
  })
}
