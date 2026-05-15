import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { startSocketServer, type SocketServer } from '../../daemon/src/socket-server.js'
import { sendUpdateSession, pingDaemon } from './rpc-client.js'
import type { RpcFrame } from '@claude-cockpit/shared'

let server: SocketServer | undefined
let dir: string

afterEach(async () => {
  await server?.stop()
  server = undefined
  rmSync(dir, { recursive: true, force: true })
})

describe('rpc-client', () => {
  it('pingDaemon returns true when server responds', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rpc-'))
    const sock = join(dir, 's.sock')
    server = await startSocketServer(sock, () => undefined)
    expect(await pingDaemon(sock, 500)).toBe(true)
  })

  it('pingDaemon returns false when no server', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rpc-'))
    const sock = join(dir, 'absent.sock')
    expect(await pingDaemon(sock, 200)).toBe(false)
  })

  it('sendUpdateSession delivers payload to handler', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rpc-'))
    const sock = join(dir, 's.sock')
    const received: RpcFrame[] = []
    server = await startSocketServer(sock, (f) => { received.push(f) })
    await sendUpdateSession(sock, 'sid-1', { ctxPct: 33, cost: 0.1 })
    await new Promise((r) => setTimeout(r, 50))
    expect(received[0]).toMatchObject({ type: 'UPDATE_SESSION', sessionId: 'sid-1' })
  })
})
