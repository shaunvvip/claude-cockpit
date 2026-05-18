import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTrends, useTop, useProjects, useSparkline } from './useHistory.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
})

describe('useHistory hooks', () => {
  it('useTrends fetches /trends?days=30', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ buckets: [], totals: { cost: 0, sessions: 0, cacheHitRate: 0 } }) })
    const { result } = renderHook(() => useTrends(30))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock.mock.calls[0][0]).toContain('/api/history/trends?days=30')
    expect(result.current.error).toBeUndefined()
  })

  it('useTop builds correct URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
    renderHook(() => useTop('cost', 'project', 7, 5))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toContain('metric=cost')
    expect(fetchMock.mock.calls[0][0]).toContain('dimension=project')
    expect(fetchMock.mock.calls[0][0]).toContain('days=7')
    expect(fetchMock.mock.calls[0][0]).toContain('limit=5')
  })

  it('useProjects on http error sets error state', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    const { result } = renderHook(() => useProjects(30))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('503')
  })

  it('useSparkline returns buckets', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ buckets: [{ t: 1, v: 2 }] }) })
    const { result } = renderHook(() => useSparkline('cost', 1, 'hour'))
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.buckets).toHaveLength(1)
  })
})
