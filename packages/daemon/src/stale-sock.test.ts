import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { isSocketAlive, clearStaleSocket } from './stale-sock.js'
import { startSocketServer, type SocketServer } from './socket-server.js'

let dir: string
let server: SocketServer | undefined

afterEach(async () => {
  await server?.stop()
  server = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('stale-sock', () => {
  it('isSocketAlive returns false when file does not exist', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    expect(await isSocketAlive(join(dir, 'nope.sock'))).toBe(false)
  })

  it('isSocketAlive returns false when file is plain regular file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    const sock = join(dir, 'fake.sock')
    writeFileSync(sock, 'not a real socket')
    expect(await isSocketAlive(sock)).toBe(false)
  })

  it('isSocketAlive returns true when daemon is listening', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    const sock = join(dir, 'real.sock')
    server = await startSocketServer(sock, () => undefined)
    expect(await isSocketAlive(sock)).toBe(true)
  })

  it('clearStaleSocket removes a non-listening sock file', () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    const sock = join(dir, 'stale.sock')
    writeFileSync(sock, '')
    clearStaleSocket(sock)
    expect(existsSync(sock)).toBe(false)
  })

  it('clearStaleSocket is idempotent', () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    expect(() => clearStaleSocket(join(dir, 'absent.sock'))).not.toThrow()
  })
})
