import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiBar } from './KpiBar.js'
import type { SessionState } from '@claude-cockpit/shared'

const makeSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'claude-opus-4-7',
  ctxPct: 50, cost: 1.00, tools: [], todos: [], mcpServers: [],
  transcriptPath: '/t', status: 'busy', lastUpdate: 1, startedAt: 1,
  ...overrides,
})

describe('KpiBar', () => {
  it('shows session count, total cost, avg ctx', () => {
    const sessions = [
      makeSession({ ctxPct: 40, cost: 1.00 }),
      makeSession({ ctxPct: 60, cost: 2.50 }),
    ]
    render(<KpiBar sessions={sessions} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('$3.50')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows 0% avg ctx and $0.00 cost for empty sessions', () => {
    render(<KpiBar sessions={[]} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('renders CACHE HIT and SUBS USED placeholders', () => {
    render(<KpiBar sessions={[]} />)
    expect(screen.getByText('CACHE HIT')).toBeInTheDocument()
    expect(screen.getByText('SUBS USED')).toBeInTheDocument()
  })
})
