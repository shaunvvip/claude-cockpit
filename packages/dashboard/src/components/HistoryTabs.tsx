type Tab = 'trends' | 'top' | 'projects'

export function HistoryTabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ['trends', 'top', 'projects']
  return (
    <div className="flex gap-1 border-b border-cockpit-line mb-3">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1.5 text-xs uppercase tracking-wide ${
            active === t
              ? 'text-cockpit-text border-b-2 border-cockpit-info -mb-px'
              : 'text-cockpit-muted hover:text-cockpit-text'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
