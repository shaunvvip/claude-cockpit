import { describe, it, expect, vi } from 'vitest'
import { IdleChecker } from './lifecycle.js'

describe('IdleChecker', () => {
  it('does NOT call shutdown when any session updated within window', () => {
    const shutdown = vi.fn()
    const now = 100_000
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => false,
      lastSessionUpdate: () => now - 1_000,
      now: () => now,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).not.toHaveBeenCalled()
  })

  it('calls shutdown when no recent updates AND no browsers', () => {
    const shutdown = vi.fn()
    const now = 100_000
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => false,
      lastSessionUpdate: () => now - 31 * 60_000,
      now: () => now,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('does NOT call shutdown when browsers connected, even if sessions idle', () => {
    const shutdown = vi.fn()
    const now = 100_000
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => true,
      lastSessionUpdate: () => now - 31 * 60_000,
      now: () => now,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).not.toHaveBeenCalled()
  })

  it('handles undefined lastSessionUpdate (no sessions ever) as idle', () => {
    const shutdown = vi.fn()
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => false,
      lastSessionUpdate: () => undefined,
      now: () => 100_000,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).toHaveBeenCalledTimes(1)
  })
})
