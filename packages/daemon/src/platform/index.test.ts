import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  // execFile mock: default returns wmctrl -l -p output with a matching window
  const execFile = vi.fn((_cmd: string, _args: string[], cb: (e: unknown, r: { stdout: string; stderr: string }) => void) => {
    cb(null, { stdout: '0x00400001  0 1234 hostname My Terminal\n', stderr: '' })
  })
  return { spawn, execFile }
})

import { spawn, execFile } from 'node:child_process'
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

describe('linux.focusTerminal', () => {
  it('calls wmctrl -l -p to list windows, then wmctrl -i -a with the XID', async () => {
    // execFile mock returns a window list with pid 1234 → XID 0x00400001
    ;(execFile as any).mockImplementationOnce(
      (_cmd: string, _args: string[], cb: (e: unknown, r: { stdout: string; stderr: string }) => void) => {
        cb(null, { stdout: '0x00400001  0 1234 hostname My Terminal\n', stderr: '' })
      }
    )
    await linux.focusTerminal(1234)
    // execFile should have been called for wmctrl -l -p
    expect(execFile).toHaveBeenCalledWith('wmctrl', ['-l', '-p'], expect.any(Function))
    // spawn should have been called for wmctrl -i -a <xid>
    expect(spawn).toHaveBeenCalledWith('wmctrl', ['-i', '-a', '0x00400001'])
  })

  it('soft-fails (no throw) when pid is not found in wmctrl output', async () => {
    ;(execFile as any).mockImplementationOnce(
      (_cmd: string, _args: string[], cb: (e: unknown, r: { stdout: string; stderr: string }) => void) => {
        cb(null, { stdout: '0x00400002  0 9999 hostname Other Terminal\n', stderr: '' })
      }
    )
    await expect(linux.focusTerminal(1234)).resolves.toBeUndefined()
    // spawn should NOT have been called for wmctrl -i -a since no match
    const spawnCalls = (spawn as any).mock.calls as [string, string[]][]
    const wmctrlFocusCalls = spawnCalls.filter(([cmd, args]) => cmd === 'wmctrl' && args.includes('-a'))
    expect(wmctrlFocusCalls).toHaveLength(0)
  })

  it('soft-fails (no throw) when wmctrl is not installed', async () => {
    ;(execFile as any).mockImplementationOnce(
      (_cmd: string, _args: string[], cb: (e: unknown, r: unknown) => void) => {
        cb(new Error('wmctrl: command not found'), { stdout: '', stderr: '' })
      }
    )
    await expect(linux.focusTerminal(1234)).resolves.toBeUndefined()
  })
})
