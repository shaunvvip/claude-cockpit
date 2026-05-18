import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { loadStoredTheme, storeTheme, getEffectiveTheme, applyTheme, type Theme } from '../lib/theme.js'
import { setLang, i18n } from '../i18n/index.js'

export function Sidebar() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(loadStoredTheme())
  const [lang, setLangState] = useState(i18n.language)

  function cycleTheme() {
    const next: Theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
    setTheme(next)
    storeTheme(next)
    applyTheme(getEffectiveTheme(next))
  }

  async function toggleLang() {
    const next = lang === 'en' ? 'zh-CN' : 'en'
    await setLang(next)
    setLangState(next)
  }

  return (
    <aside className="w-40 bg-cockpit-panel border-r border-cockpit-line p-4 text-xs flex flex-col min-h-screen">
      <div className="text-cockpit-muted tracking-widest mb-3">CLAUDE-COCKPIT</div>
      <Link
        to="/"
        className="block px-2 py-1 mb-1 rounded text-cockpit-muted hover:text-cockpit-text [&.active]:bg-cockpit-bg [&.active]:border-l-2 [&.active]:border-cockpit-info [&.active]:text-cockpit-text"
        activeOptions={{ exact: true }}
      >
        ⊞ {t('nav.overview')}
      </Link>
      <Link
        to="/history"
        className="block px-2 py-1 mb-1 rounded text-cockpit-muted hover:text-cockpit-text [&.active]:bg-cockpit-bg [&.active]:border-l-2 [&.active]:border-cockpit-info [&.active]:text-cockpit-text"
      >
        ⊿ {t('nav.history')}
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1 border-t border-cockpit-line pt-3 mt-2">
        <button
          type="button"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme} (click to cycle)`}
          title={`Theme: ${theme} (click to cycle)`}
          className="flex-1 text-center text-cockpit-muted border border-cockpit-line rounded px-2 py-1 hover:text-cockpit-text hover:border-cockpit-info"
        >
          {theme === 'auto' ? '◐' : theme === 'light' ? '☀' : '🌙'}
        </button>
        <button
          type="button"
          onClick={toggleLang}
          aria-label="Toggle language"
          title="Toggle language"
          className="flex-1 text-center text-cockpit-muted border border-cockpit-line rounded px-2 py-1 hover:text-cockpit-text hover:border-cockpit-info"
        >
          {lang === 'en' ? '中' : 'EN'}
        </button>
      </div>
    </aside>
  )
}
