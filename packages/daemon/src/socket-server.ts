import { createServer, Server } from 'node:net'
import { existsSync, unlinkSync } from 'node:fs'
import { isRpcFrame, type RpcFrame } from '@claude-cockpit/shared'

export interface SocketServer {
  stop(): Promise<void>
}

export type FrameHandler = (frame: RpcFrame) => void

export async function startSocketServer(
  sockPath: string,
  onFrame: FrameHandler,
): Promise<SocketServer> {
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* race ok */ }
  }

  const server: Server = createServer((conn) => {
    let buf = ''
    conn.on('data', (chunk) => {
      buf += chunk.toString()
      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try {
          const parsed = JSON.parse(line)
          if (isRpcFrame(parsed)) {
            if (parsed.type === 'PING') {
              conn.write(JSON.stringify({ type: 'PONG' }) + '\n')
            } else {
              onFrame(parsed)
              conn.write(JSON.stringify({ type: 'PONG' }) + '\n')
            }
          }
        } catch { /* skip malformed */ }
        nl = buf.indexOf('\n')
      }
    })
    conn.on('error', () => undefined)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(sockPath, () => resolve())
  })

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          if (existsSync(sockPath)) {
            try { unlinkSync(sockPath) } catch { /* ignore */ }
          }
          resolve()
        })
      }),
  }
}
