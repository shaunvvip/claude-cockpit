import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { startSocketServer, type SocketServer } from './socket-server.js'
import type { RpcFrame } from '@claude-cockpit/shared'

let server: SocketServer | undefined
let dir: string

afterEach(async () => {
  await server?.stop()
  server = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function sendFrame(sockPath: string, frame: RpcFrame): Promise<RpcFrame> {
  return new Promise((resolve, reject) => {
    const c = createConnection(sockPath)
    let buf = ''
    c.on('data', (d) => {
      buf += d.toString()
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        resolve(JSON.parse(buf.slice(0, nl)))
        c.end()
      }
    })
    c.on('error', reject)
    c.write(JSON.stringify(frame) + '\n')
  })
}

describe('socket-server', () => {
  it('replies PONG to PING', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sock-'))
    const sockPath = join(dir, 's.sock')
    const onFrame = () => undefined
    server = await startSocketServer(sockPath, onFrame)
    const reply = await sendFrame(sockPath, { type: 'PING' })
    expect(reply).toEqual({ type: 'PONG' })
  })

  it('forwards UPDATE_SESSION to handler', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sock-'))
    const sockPath = join(dir, 's.sock')
    const received: RpcFrame[] = []
    server = await startSocketServer(sockPath, (f) => { received.push(f) })
    await sendFrame(sockPath, {
      type: 'UPDATE_SESSION',
      sessionId: 'abc',
      payload: { ctxPct: 47 },
    })
    expect(received[0]?.type).toBe('UPDATE_SESSION')
  })

  it('removes stale socket file on start', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sock-'))
    const sockPath = join(dir, 's.sock')
    // simulate stale file
    writeFileSync(sockPath, 'stale')
    server = await startSocketServer(sockPath, () => undefined)
    const reply = await sendFrame(sockPath, { type: 'PING' })
    expect(reply).toEqual({ type: 'PONG' })
  })
})
