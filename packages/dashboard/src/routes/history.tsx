import { createRoute, useSearch, useNavigate } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { useTranslation } from 'react-i18next'
import { HistoryTabs } from '../components/HistoryTabs.js'
import { TrendsTab } from '../components/history/TrendsTab.js'
import { TopTab } from '../components/history/TopTab.js'
import { ProjectsTab } from '../components/history/ProjectsTab.js'

export interface HistorySearch { tab?: 'trends' | 'top' | 'projects' }

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/history',
  validateSearch: (search: Record<string, unknown>): HistorySearch => {
    const result: HistorySearch = {}
    if (search.tab === 'trends' || search.tab === 'top' || search.tab === 'projects') result.tab = search.tab
    return result
  },
  component: HistoryPage,
})

function HistoryPage() {
  const { t } = useTranslation()
  const { tab } = useSearch({ from: Route.id })
  const navigate = useNavigate({ from: Route.id })
  const activeTab = tab ?? 'trends'

  return (
    <div>
      <div className="text-cockpit-muted text-[10px] mb-1">HISTORY</div>
      <h1 className="text-cockpit-text font-semibold mb-3">{t('history.title')}</h1>
      <HistoryTabs
        active={activeTab}
        onChange={(tab) => navigate({ search: { tab } as any })}
      />
      {activeTab === 'trends'   && <TrendsTab />}
      {activeTab === 'top'      && <TopTab />}
      {activeTab === 'projects' && <ProjectsTab />}
    </div>
  )
}
