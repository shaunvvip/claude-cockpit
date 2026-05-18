import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsageBars, formatCountdown } from './UsageBars.js'
import type { SessionState } from '@claude-cockpit/shared'

const base: SessionState = {
  sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'claude-opus-4-7',
  ctxPct: 50, cost: 1.00, tools: [], todos: [], mcpServers: [],
  transcriptPath: '/t', status: 'busy', lastUpdate: 1, startedAt: 1,
}

describe('formatCountdown', () => {
  it('returns empty string when resetAt is undefined', () => {
    expect(formatCountdown(undefined)).toBe('')
  })

  it('returns empty string when diff is 0 or negative', () => {
    const now = Date.now()
    expect(formatCountdown(now, now)).toBe('')
    expect(formatCountdown(now - 1000, now)).toBe('')
  })

  it('returns <1m when less than 1 minute', () => {
    const now = Date.now()
    expect(formatCountdown(now + 30_000, now)).toBe('<1m')
  })

  it('returns Xm for minutes < 60', () => {
    const now = Date.now()
    expect(formatCountdown(now + 5 * 60_000, now)).toBe('5m')
  })

  it('returns Xh Ym for hours < 24', () => {
    const now = Date.now()
    expect(formatCountdown(now + (2 * 60 + 30) * 60_000, now)).toBe('2h 30m')
  })

  it('returns Xh for exact hours', () => {
    const now = Date.now()
    expect(formatCountdown(now + 3 * 60 * 60_000, now)).toBe('3h')
  })

  it('returns Xd Yh for days with remaining hours', () => {
    const now = Date.now()
    expect(formatCountdown(now + (1 * 24 * 60 + 6 * 60) * 60_000, now)).toBe('1d 6h')
  })

  it('returns Xd for exact days', () => {
    const now = Date.now()
    expect(formatCountdown(now + 2 * 24 * 60 * 60_000, now)).toBe('2d')
  })
})

describe('UsageBars', () => {
  it('renders nothing when both usage fields are undefined', () => {
    const { container } = render(<UsageBars session={base} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows 5h bar when usage5hPct is defined', () => {
    render(<UsageBars session={{ ...base, usage5hPct: 45 }} />)
    expect(screen.getByText('5h')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
  })

  it('shows 7d bar when usage7dPct is defined', () => {
    render(<UsageBars session={{ ...base, usage7dPct: 80 }} />)
    expect(screen.getByText('7d')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('shows both bars when both usage fields are set', () => {
    render(<UsageBars session={{ ...base, usage5hPct: 30, usage7dPct: 60 }} />)
    expect(screen.getByText('5h')).toBeInTheDocument()
    expect(screen.getByText('7d')).toBeInTheDocument()
  })

  it('bar renders a countdown when resetAt is set in the future', () => {
    const resetAt = Date.now() + 10 * 60_000  // 10 min from now
    render(<UsageBars session={{ ...base, usage5hPct: 50, usage5hResetAt: resetAt }} />)
    // Countdown text will be 9m or 10m depending on execution timing; just assert it's present
    const countdown = screen.queryByText(/^\d+m$/)
    expect(countdown).not.toBeNull()
  })
})
