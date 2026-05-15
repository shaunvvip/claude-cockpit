import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import type { SessionRegistry } from './session-registry.js'
import { handleApiRequest } from './api/routes.js'

export interface HttpServer {
  port: number
  stop(): Promise<void>
  broadcast(message: unknown): void
}

export interface HttpServerOptions {
  port: number
  staticDir?: string
  registry?: SessionRegistry
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
}

function serveStatic(staticDir: string, url: string, res: ServerResponse): boolean {
  const normRoot = normalize(staticDir)
  let path = normalize(join(staticDir, url === '/' ? '/index.html' : url))
  // Path traversal guard
  if (!path.startsWith(normRoot)) {
    res.writeHead(403); res.end(); return true
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    // SPA fallback to index.html
    path = join(staticDir, 'index.html')
    if (!existsSync(path)) return false
  }
  const ext = extname(path).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(readFileSync(path))
  return true
}

export async function startHttpServer(opts: HttpServerOptions): Promise<HttpServer> {
  const sockets = new Set<WebSocket>()

  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method && req.url && opts.registry) {
      const apiRes = handleApiRequest(req.method, req.url, opts.registry)
      if (apiRes) {
        res.writeHead(apiRes.status, { 'Content-Type': apiRes.contentType })
        res.end(apiRes.body)
        return
      }
    }
    if (req.method === 'GET' && opts.staticDir && serveStatic(opts.staticDir, req.url ?? '/', res)) {
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
