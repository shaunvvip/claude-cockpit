import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TrendsTab } from './TrendsTab.js'

vi.mock('uplot', () => {
  return {
    default: class UPlot {
      constructor(_opts: unknown, _data: unknown, _el: HTMLElement) {}
      destroy() {}
    },
  }
})

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
})

describe('TrendsTab', () => {
  it('renders totals + sparklines once trends data arrives', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/trends')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            buckets: [{ date: '2026-05-15', cost: 1.0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 800, cacheCreationTokens: 100, sessions: 2 }],
            totals: { cost: 1.0, sessions: 2, cacheHitRate: 0.8 },
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ snapshots: [] }) })
    })
    render(<TrendsTab />)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
    expect(screen.getByText(/DAILY COST/)).toBeInTheDocument()
    expect(screen.getByText(/CACHE HIT RATE/)).toBeInTheDocument()
    expect(screen.getByText(/\$1\.00/)).toBeInTheDocument()
  })

  it('shows error when fetch fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    render(<TrendsTab />)
    await waitFor(() => expect(screen.queryByText(/Error/)).toBeInTheDocument())
  })
})
