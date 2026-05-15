import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSessionStream } from './useSessionStream.js'

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

beforeEach(() => {
  MockWebSocket.instances = []
  ;(globalThis as any).WebSocket = MockWebSocket
})

afterEach(() => {
  MockWebSocket.instances = []
})

describe('useSessionStream', () => {
  it('initial fetch populates sessions', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ sessions: [{ sessionId: 'a', model: 'm', ctxPct: 10 }] }),
    })
    const { result } = renderHook(() => useSessionStream())
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))
    expect(result.current.sessions[0]!.sessionId).toBe('a')
  })

  it('updates on SESSION_UPSERT event', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ sessions: [] }),
    })
    const { result } = renderHook(() => useSessionStream())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => {
      MockWebSocket.instances[0]!.emit({ type: 'SESSION_UPSERT', session: { sessionId: 'b', ctxPct: 50 } })
    })
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))
    expect(result.current.sessions[0]!.sessionId).toBe('b')
  })

  it('removes session on SESSION_REMOVED event', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ sessions: [{ sessionId: 'a' }, { sessionId: 'b' }] }),
    })
    const { result } = renderHook(() => useSessionStream())
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))
    act(() => {
      MockWebSocket.instances[0]!.emit({ type: 'SESSION_REMOVED', sessionId: 'a' })
    })
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))
    expect(result.current.sessions[0]!.sessionId).toBe('b')
  })
})
