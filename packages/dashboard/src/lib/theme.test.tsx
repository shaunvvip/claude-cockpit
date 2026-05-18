import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadStoredTheme, storeTheme, getEffectiveTheme, applyTheme } from './theme.js'

// Node 25 ships a stub `localStorage` global without storage; install an in-memory shim.
function makeMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() { return Object.keys(store).length },
    clear() { store = {} },
    getItem(k: string) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k]! : null },
    key(i: number) { return Object.keys(store)[i] ?? null },
    removeItem(k: string) { delete store[k] },
    setItem(k: string, v: string) { store[k] = String(v) },
  }
}

describe('theme', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', makeMemoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('loadStoredTheme defaults to auto', () => {
    expect(loadStoredTheme()).toBe('auto')
  })

  it('storeTheme + loadStoredTheme round-trip for each value', () => {
    storeTheme('light'); expect(loadStoredTheme()).toBe('light')
    storeTheme('dark');  expect(loadStoredTheme()).toBe('dark')
    storeTheme('auto');  expect(loadStoredTheme()).toBe('auto')
  })

  it('loadStoredTheme ignores garbage values', () => {
    localStorage.setItem('cockpit-theme', 'rainbow')
    expect(loadStoredTheme()).toBe('auto')
  })

  it('getEffectiveTheme returns explicit value for light/dark', () => {
    expect(getEffectiveTheme('light')).toBe('light')
    expect(getEffectiveTheme('dark')).toBe('dark')
  })

  it('getEffectiveTheme(auto) uses matchMedia', () => {
    const mq = { matches: true, addEventListener() {}, removeEventListener() {} } as any
    vi.stubGlobal('matchMedia', () => mq)
    expect(getEffectiveTheme('auto')).toBe('light')
    mq.matches = false
    expect(getEffectiveTheme('auto')).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('applyTheme sets data-theme attribute', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
