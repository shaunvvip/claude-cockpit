import { useTranslation } from 'react-i18next'

type Tab = 'trends' | 'top' | 'projects'

export function HistoryTabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const { t } = useTranslation()
  const tabs: Tab[] = ['trends', 'top', 'projects']
  return (
    <div className="flex gap-1 border-b border-cockpit-line mb-3">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-3 py-1.5 text-xs uppercase tracking-wide ${
            active === tab
              ? 'text-cockpit-text border-b-2 border-cockpit-info -mb-px'
              : 'text-cockpit-muted hover:text-cockpit-text'
          }`}
        >
          {t(`history.tabs.${tab}`)}
        </button>
      ))}
    </div>
  )
}
