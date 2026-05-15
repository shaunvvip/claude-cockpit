import { describe, it, expect } from 'vitest'
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
