import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../components/Sidebar.js'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-3"><Outlet /></main>
    </div>
  ),
})
