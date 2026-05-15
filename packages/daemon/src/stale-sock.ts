import { existsSync, unlinkSync } from 'node:fs'
import { createConnection } from 'node:net'

export async function isSocketAlive(sockPath: string): Promise<boolean> {
  if (!existsSync(sockPath)) return false
  return new Promise<boolean>((resolve) => {
    const conn = createConnection(sockPath)
    const timer = setTimeout(() => { conn.destroy(); resolve(false) }, 300)
    conn.on('connect', () => { clearTimeout(timer); conn.end(); resolve(true) })
    conn.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

export function clearStaleSocket(sockPath: string): void {
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* race ok */ }
  }
}
