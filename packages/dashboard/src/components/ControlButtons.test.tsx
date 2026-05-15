import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ControlButtons } from './ControlButtons.js'

const fetchMock = vi.fn()

beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
})

describe('ControlButtons', () => {
  it('POSTs to /interrupt when Stop clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    render(<ControlButtons sessionId="sid" />)
    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/sessions/sid/interrupt')
    await screen.findByText('stop sent')
  })

  it('shows "stop unavailable" on 422', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 })
    render(<ControlButtons sessionId="sid" />)
    fireEvent.click(screen.getByText('Stop'))
    await screen.findByText('stop unavailable')
  })

  it('POSTs JSON body for Copy id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    render(<ControlButtons sessionId="sid" />)
    fireEvent.click(screen.getByText('Copy id'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const init = fetchMock.mock.calls[0][1] as any
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ field: 'sessionId' })
  })
})
