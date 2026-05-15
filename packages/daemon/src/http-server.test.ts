import { describe, it, expect, afterEach } from 'vitest'
import { startHttpServer, type HttpServer } from './http-server.js'
import WebSocket from 'ws'

let server: HttpServer | undefined

afterEach(async () => {
  await server?.stop()
  server = undefined
})

describe('http-server', () => {
  it('serves GET /health with 200 ok', async () => {
    server = await startHttpServer({ port: 0 })
    const res = await fetch(`http://127.0.0.1:${server.port}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('listens on a random port when port=0', async () => {
    server = await startHttpServer({ port: 0 })
    expect(server.port).toBeGreaterThan(0)
  })

  it('accepts websocket connection at /ws', async () => {
    server = await startHttpServer({ port: 0 })
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server!.port}/ws`)
      ws.on('open', () => { ws.close(); resolve() })
      ws.on('error', reject)
    })
  })
})
