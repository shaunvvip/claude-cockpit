import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'

export interface HttpServer {
  port: number
  stop(): Promise<void>
  broadcast(message: unknown): void
}

export interface HttpServerOptions {
  port: number
}

export async function startHttpServer(opts: HttpServerOptions): Promise<HttpServer> {
  const sockets = new Set<WebSocket>()

  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ noServer: true })

  http.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.add(ws)
        ws.on('close', () => sockets.delete(ws))
      })
    } else {
      socket.destroy()
    }
  })

  const port: number = await new Promise<number>((resolve, reject) => {
    http.once('error', reject)
    http.listen(opts.port, '127.0.0.1', () => {
      const addr = http.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('no address'))
    })
  })

  return {
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const ws of sockets) ws.terminate()
        wss.close(() => http.close(() => resolve()))
      }),
    broadcast: (message: unknown) => {
      const data = JSON.stringify(message)
      for (const ws of sockets) {
        if (ws.readyState === ws.OPEN) ws.send(data)
      }
    },
  }
}
