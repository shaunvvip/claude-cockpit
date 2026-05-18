import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TopTab } from './TopTab.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [
      { key: '/proj/big', cost: 89.12, sessions: 12 },
      { key: '/proj/small', cost: 12.34, sessions: 3 },
    ]}),
  })
})

describe('TopTab', () => {
  it('renders items with bars', async () => {
    render(<TopTab />)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
    expect(screen.getByText(/proj\/big/)).toBeInTheDocument()
    expect(screen.getByText(/\$89\.12/)).toBeInTheDocument()
  })

  it('switching dimension re-fetches', async () => {
    render(<TopTab />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('tool'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toContain('dimension=tool')
  })
})
