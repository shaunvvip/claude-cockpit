import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root.js'
import { Route as IndexRoute } from './routes/index.js'
import { Route as SessionDetailRoute } from './routes/sessions.$sessionId.js'
import { Route as HistoryRoute } from './routes/history.js'
import { loadStoredTheme, getEffectiveTheme, applyTheme, watchSystemPreference } from './lib/theme.js'
import { initI18n, loadStoredLang } from './i18n/index.js'
import './styles.css'

const routeTree = RootRoute.addChildren([IndexRoute, SessionDetailRoute, HistoryRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

// Apply theme before React mounts to prevent FOUC
applyTheme(getEffectiveTheme(loadStoredTheme()))
watchSystemPreference(() => {
  if (loadStoredTheme() === 'auto') applyTheme(getEffectiveTheme('auto'))
})

await initI18n(loadStoredLang() ?? undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
)
