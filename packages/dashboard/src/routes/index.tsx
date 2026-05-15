import { createRoute } from '@tanstack/react-router'
import { Route as Root } from './__root.js'

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/',
  component: () => (
    <div>
      <h1 className="text-sm text-cockpit-muted mb-4">Overview</h1>
      <p>hello cockpit</p>
    </div>
  ),
})
