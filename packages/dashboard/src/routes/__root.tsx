import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex">
      <aside className="w-40 bg-[#0a0e12] border-r border-cockpit-line p-4 text-xs">
        <div className="text-cockpit-muted tracking-widest mb-3">CLAUDE-COCKPIT</div>
        <div className="px-2 py-1 rounded bg-cockpit-panel border-l-2 border-cockpit-info">
          Overview
        </div>
      </aside>
      <main className="flex-1 p-3"><Outlet /></main>
    </div>
  ),
})
