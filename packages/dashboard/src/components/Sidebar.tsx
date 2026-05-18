import { Link } from '@tanstack/react-router'

export function Sidebar() {
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
    </aside>
  )
}
