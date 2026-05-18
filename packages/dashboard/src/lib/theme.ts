export type Theme = 'auto' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'cockpit-theme'

export function loadStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch { /* SSR / storage disabled */ }
  return 'auto'
}

export function storeTheme(t: Theme): void {
  try { localStorage.setItem(STORAGE_KEY, t) } catch { /* */ }
}

export function getEffectiveTheme(stored: Theme): EffectiveTheme {
  if (stored === 'light') return 'light'
  if (stored === 'dark') return 'dark'
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export function applyTheme(effective: EffectiveTheme): void {
  document.documentElement.setAttribute('data-theme', effective)
}

export function watchSystemPreference(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia('(prefers-color-scheme: light)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
