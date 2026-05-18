import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { RouterProvider, createRouter, createRootRoute, createRoute, createMemoryHistory } from '@tanstack/react-router'
import { SessionCard } from './SessionCard.js'
import type { SessionState } from '@claude-cockpit/shared'

const base: SessionState = {
  sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x/y/z', model: 'claude-opus-4-7',
  ctxPct: 47, cost: 0.42, tools: [], todos: [], mcpServers: [],
  transcriptPath: '/t', status: 'busy', lastUpdate: 1, startedAt: 1,
}

async function renderCard(session: SessionState) {
  const rootRoute = createRootRoute({ component: () => <SessionCard session={session} /> })
  const detailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sessions/$sessionId', component: () => null })
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(async () => { render(<RouterProvider router={router} />) })
}

describe('SessionCard', () => {
  it('shows cwd basename, model, ctx%, cost, status chip', async () => {
    await renderCard(base)
    await waitFor(() => expect(screen.getByText(/^z$/)).toBeInTheDocument())
    expect(screen.getByText(/claude-opus-4-7/)).toBeInTheDocument()
    expect(screen.getByText(/47%/)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.42/)).toBeInTheDocument()
    expect(screen.getByText(/busy/i)).toBeInTheDocument()
  })

  it('applies near-limit color when ctxPct >= 85', async () => {
    await renderCard({ ...base, ctxPct: 92 })
    const node = await waitFor(() => screen.getByText(/92%/))
    // ctxColor returns '#f4a261' (palette.near) when 85 <= pct < 95
    expect(node).toHaveStyle({ color: '#f4a261' })
  })
})
