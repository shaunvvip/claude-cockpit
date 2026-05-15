import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionCard } from './SessionCard.js'
import type { SessionState } from '@claude-cockpit/shared'

const base: SessionState = {
  sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x/y/z', model: 'claude-opus-4-7',
  ctxPct: 47, cost: 0.42, tools: [], todos: [], mcpServers: [],
  transcriptPath: '/t', status: 'busy', lastUpdate: 1, startedAt: 1,
}

describe('SessionCard', () => {
  it('shows cwd basename, model, ctx%, cost, status chip', () => {
    render(<SessionCard session={base} />)
    expect(screen.getByText(/^z$/)).toBeInTheDocument()  // cwd basename
    expect(screen.getByText(/claude-opus-4-7/)).toBeInTheDocument()
    expect(screen.getByText(/47%/)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.42/)).toBeInTheDocument()
    expect(screen.getByText(/busy/i)).toBeInTheDocument()
  })

  it('applies near-limit color when ctxPct >= 85', () => {
    render(<SessionCard session={{ ...base, ctxPct: 92 }} />)
    const node = screen.getByText(/92%/)
    // ctxColor returns '#f4a261' (palette.near) when 85 <= pct < 95
    expect(node).toHaveStyle({ color: '#f4a261' })
  })
})
