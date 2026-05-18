import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ projects: [
      { key: '/proj/x', label: 'x', cost: 12.34, sessions: 5, totalTokens: 1500000, lastUpdate: Date.now() - 60_000 },
    ]}),
  })
})

describe('ProjectsTab', () => {
  it('renders project cards', async () => {
    render(<ProjectsTab />)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText(/\$12\.34/)).toBeInTheDocument()
    expect(screen.getByText(/1\.50M tokens/)).toBeInTheDocument()
  })

  it('opens confirm modal then cancels', async () => {
    render(<ProjectsTab />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText(/Clear all history/))
    expect(screen.getByText(/Permanently delete/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Permanently delete/)).toBeNull()
  })
})
