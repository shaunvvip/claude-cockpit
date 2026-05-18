import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const STORAGE_KEY = 'cockpit-lang'
export type Lang = 'en' | 'zh-CN'

export function loadStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'zh-CN') return v
  } catch { /* */ }
  return null
}

export function storeLang(l: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* */ }
}

function detectBrowserLang(): Lang {
  const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en'
  if (nav.startsWith('zh')) return 'zh-CN'
  return 'en'
}

export function initI18n(serverDefault?: Lang): Promise<unknown> {
  const initial: Lang = loadStoredLang() ?? serverDefault ?? detectBrowserLang()
  return i18n
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
      lng: initial,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    })
}

export async function setLang(l: Lang): Promise<void> {
  storeLang(l)
  await i18n.changeLanguage(l)
}

export { i18n }
