import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { loadStoredTheme, storeTheme, getEffectiveTheme, applyTheme, type Theme } from '../lib/theme.js'

export function Sidebar() {
  const [theme, setTheme] = useState<Theme>(loadStoredTheme())

  function cycleTheme() {
    const next: Theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
    setTheme(next)
    storeTheme(next)
    applyTheme(getEffectiveTheme(next))
  }

  return (
    <aside className="w-40 bg-[#0a0e12] border-r border-cockpit-line p-4 text-xs">
      <div className="text-cockpit-muted tracking-widest mb-3">CLAUDE-COCKPIT</div>
      <Link
        to="/"
        className="block px-2 py-1 mb-1 rounded text-cockpit-muted hover:text-cockpit-text [&.active]:bg-cockpit-panel [&.active]:border-l-2 [&.active]:border-cockpit-info [&.active]:text-cockpit-text"
        activeOptions={{ exact: true }}
      >
        ⊞ Overview
      </Link>
      <Link
        to="/history"
        className="block px-2 py-1 mb-1 rounded text-cockpit-muted hover:text-cockpit-text [&.active]:bg-cockpit-panel [&.active]:border-l-2 [&.active]:border-cockpit-info [&.active]:text-cockpit-text"
      >
        ⊿ History
      </Link>

      <div className="flex-1" />

      <button
        type="button"
        onClick={cycleTheme}
        aria-label={`Theme: ${theme} (click to cycle)`}
        title={`Theme: ${theme} (click to cycle)`}
        className="text-xs text-cockpit-muted px-2 py-1 hover:text-cockpit-text"
      >
        {theme === 'auto' ? '◐' : theme === 'light' ? '☀' : '🌙'}
      </button>
    </aside>
  )
}
