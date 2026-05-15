import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPlatformActions } from './index.js'

describe('getPlatformActions', () => {
  it('returns a PlatformActions with darwin or linux', () => {
    const a = getPlatformActions()
    expect(['darwin', 'linux']).toContain(a.platform)
    expect(typeof a.openUrl).toBe('function')
    expect(typeof a.openFile).toBe('function')
    expect(typeof a.clipboardWrite).toBe('function')
  })

  it('returns actions for the current platform without throwing', () => {
    expect(() => getPlatformActions()).not.toThrow()
  })
})

vi.mock('node:child_process', () => {
  const spawn = vi.fn(() => {
    const c: any = {
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'close') queueMicrotask(cb)
      }),
    }
    return c
  })
  return { spawn }
})

import { spawn } from 'node:child_process'
import * as macos from './macos.js'
import * as linux from './linux.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('macos.notify', () => {
  it('invokes osascript with display-notification AppleScript', async () => {
    await macos.notify({ title: 't', body: 'b' })
    expect(spawn).toHaveBeenCalledWith('osascript', expect.arrayContaining(['-e']))
    const args = (spawn as any).mock.calls[0][1] as string[]
    expect(args.join(' ')).toContain('display notification')
    expect(args.join(' ')).toContain('"b"')
    expect(args.join(' ')).toContain('"t"')
  })

  it('embeds deepLink in subtitle when provided', async () => {
    await macos.notify({ title: 't', body: 'b', deepLink: 'http://localhost:1234/x' })
    const args = (spawn as any).mock.calls[0][1] as string[]
    expect(args.join(' ')).toContain('http://localhost:1234/x')
  })
})

describe('linux.notify', () => {
  it('invokes notify-send with title and body', async () => {
    await linux.notify({ title: 't', body: 'b' })
    expect(spawn).toHaveBeenCalledWith('notify-send', expect.any(Array))
    const args = (spawn as any).mock.calls[0][1] as string[]
    expect(args).toContain('t')
    expect(args).toContain('b')
  })

  it('passes deepLink as hint when provided', async () => {
    await linux.notify({ title: 't', body: 'b', deepLink: 'http://x' })
    const args = (spawn as any).mock.calls[0][1] as string[]
    expect(args.join(' ')).toContain('http://x')
  })
})
