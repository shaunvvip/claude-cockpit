const ITEMS = [
  { key: 'overview', label: '⊞ Overview', active: true },
  { key: 'sessions', label: '⊟ Sessions' },
  { key: 'history',  label: '⊿ History' },
  { key: 'mcp',      label: '⊕ MCP' },
  { key: 'alerts',   label: '▲ Alerts' },
  { key: 'settings', label: '⚙ Settings' },
]

export function Sidebar() {
  return (
    <aside className="w-40 bg-[#0a0e12] border-r border-cockpit-line p-4 text-xs">
      <div className="text-cockpit-muted tracking-widest mb-3">CLAUDE-COCKPIT</div>
      {ITEMS.map((item) => (
        <div
          key={item.key}
          className={
            'px-2 py-1 mb-1 rounded ' +
            (item.active
              ? 'bg-cockpit-panel border-l-2 border-cockpit-info text-cockpit-text'
              : 'text-cockpit-muted')
          }
        >
          {item.label}
        </div>
      ))}
    </aside>
  )
}
