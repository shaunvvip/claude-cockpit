import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initI18n, setLang, i18n, loadStoredLang } from './index.js'

// Node 25 stub-localStorage workaround
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

describe('i18n', () => {
  beforeEach(async () => {
    vi.stubGlobal('localStorage', makeMemoryStorage())
    await initI18n('en')
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('resolves known en key', () => {
    expect(i18n.t('nav.overview')).toBe('Overview')
  })

  it('falls back for unknown key (returns the key itself)', () => {
    expect(i18n.t('this.does.not.exist')).toBe('this.does.not.exist')
  })

  it('changeLanguage switches resources', async () => {
    await setLang('zh-CN')
    expect(i18n.t('nav.overview')).toBe('总览')
  })

  it('interpolation works ({{ago}})', async () => {
    await setLang('en')
    expect(i18n.t('mcp.lastUsed', { ago: '5m' })).toBe('last used 5m')
  })

  it('storeLang persists across init', async () => {
    await setLang('zh-CN')
    expect(loadStoredLang()).toBe('zh-CN')
  })

  it('en as fallbackLng when key missing in zh-CN', async () => {
    await setLang('zh-CN')
    expect(i18n.options.fallbackLng).toEqual(['en'])
  })
})
