import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root.js'
import { Route as IndexRoute } from './routes/index.js'
import { Route as SessionDetailRoute } from './routes/sessions.$sessionId.js'
import { Route as HistoryRoute } from './routes/history.js'
import './styles.css'

const routeTree = RootRoute.addChildren([IndexRoute, SessionDetailRoute, HistoryRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
)
