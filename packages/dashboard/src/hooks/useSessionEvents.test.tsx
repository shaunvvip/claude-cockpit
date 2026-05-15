import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSessionEvents } from './useSessionEvents.js'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState = 1
  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => this.onopen?.(), 0)
  }
  close() { this.onclose?.() }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
}

const fetchMock = vi.fn()

beforeEach(() => {
  MockWebSocket.instances = []
  ;(globalThis as any).WebSocket = MockWebSocket
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ events: [{ type: 'TOOL_USE', name: 'X', ts: 1 }] }),
  })
})

afterEach(() => {
  MockWebSocket.instances = []
})

describe('useSessionEvents', () => {
  it('fetches events on mount', async () => {
    const { result } = renderHook(() => useSessionEvents('sid'))
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/sessions/sid/events')
  })

  it('refetches events on SESSION_UPSERT for matching sessionId', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [{ type: 'TOOL_USE', name: 'X', ts: 1 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [{ type: 'TOOL_USE', name: 'X', ts: 1 }, { type: 'USAGE', ts: 2 }] }),
      })

    const { result } = renderHook(() => useSessionEvents('sid'))
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))

    act(() => {
      MockWebSocket.instances[0]!.emit({ type: 'SESSION_UPSERT', session: { sessionId: 'sid' } })
    })

    await waitFor(() => expect(result.current.events).toHaveLength(2))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ignores SESSION_UPSERT for a different sessionId', async () => {
    const { result } = renderHook(() => useSessionEvents('sid'))
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))

    act(() => {
      MockWebSocket.instances[0]!.emit({ type: 'SESSION_UPSERT', session: { sessionId: 'other' } })
    })

    // Only the initial fetch should have occurred
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
