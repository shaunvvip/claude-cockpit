import { describe, it, expect } from 'vitest'
import { renderMinimal, renderEssential, formatCountdown } from './render.js'

describe('renderMinimal', () => {
  it('outputs one line with model, cwd, branch, ctx (cost no longer displayed)', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/home/me/proj', model: 'claude-opus-4-7',
      branch: 'main', ctxPct: 47,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: false,
    })
    expect(out).toContain('claude-opus-4-7')
    expect(out).toContain('proj')
    expect(out).toContain('main')
    expect(out).toContain('47%')
    expect(out).not.toContain('$')          // cost intentionally removed
    expect(out).toContain('[cockpit]')
    expect(out).toContain('\x1b[32m')       // green ctx color (47% < 70 threshold)
  })

  it('emits OSC 8 escape sequences when supported', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/x', model: 'm',
      branch: 'main', ctxPct: 0,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: true,
    })
    expect(out).toContain(']8;;http://localhost:5050/sessions/abc')
    expect(out).toContain(']8;;')
  })
})

describe('renderEssential', () => {
  it('outputs two lines with progress bar and link set', () => {
    const out = renderEssential({
      sessionId: 'sid', cwd: '/a/b/c', model: 'm', branch: 'main',
      ctxPct: 50, toolsCount: 7, subagentCount: 2,
      todosDone: 2, todosTotal: 5,
      dashboardUrl: 'http://l/s', stopUrl: 'http://l/stop', fileUrl: 'http://l/file',
      supportsOsc8: false,
    })
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('50%')
    expect(lines[0]).toContain('█████')   // 5 of 10 cells filled
    expect(lines[0]).toContain('░░░░░')   // 5 empty
    expect(lines[1]).toContain('7')
    expect(lines[1]).toContain('2/5')
    expect(lines[1]).toContain('[dash]')
    expect(lines[1]).toContain('[stop]')
    expect(lines[1]).toContain('[file]')
  })

  it('progress bar is empty at 0% and full at 100%', () => {
    const base = {
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      toolsCount: 0, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    } as const
    expect(renderEssential({ ...base, ctxPct: 0 })).toContain('░░░░░░░░░░')
    expect(renderEssential({ ...base, ctxPct: 100 })).toContain('██████████')
  })

  it('ctx bar uses RED ANSI at >=85% and GREEN at low', () => {
    const base = {
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      toolsCount: 0, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    } as const
    expect(renderEssential({ ...base, ctxPct: 90 })).toContain('\x1b[31m')  // red
    expect(renderEssential({ ...base, ctxPct: 20 })).toContain('\x1b[32m')  // green
    expect(renderEssential({ ...base, ctxPct: 75 })).toContain('\x1b[33m')  // yellow
  })

  it('usage segments include mini bar with quota colors', () => {
    const now = 1_000_000_000
    const out = renderEssential({
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      ctxPct: 30, toolsCount: 1, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
      usage5hPct: 92, usage5hResetAt: now + 60_000,
      usage7dPct: 30, usage7dResetAt: now + 60_000,
      now,
    })
    const line2 = out.split('\n')[1]!
    expect(line2).toContain('5h ')
    expect(line2).toContain('7d ')
    expect(line2).toContain('\x1b[31m')   // 92% triggers RED for 5h
    expect(line2).toContain('\x1b[94m')   // 30% triggers BRIGHT_BLUE for 7d
  })

  it('renders 5h + 7d usage segments with countdown when present', () => {
    const now = 1_000_000_000
    const in2h = now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000
    const in5d = now + 5 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000
    const out = renderEssential({
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      ctxPct: 30, toolsCount: 1, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
      usage5hPct: 25, usage5hResetAt: in2h,
      usage7dPct: 12, usage7dResetAt: in5d,
      now,
    })
    const line2 = out.split('\n')[1]!
    expect(line2).toContain('5h ')
    expect(line2).toContain('25%')
    expect(line2).toContain('(2h 30m)')
    expect(line2).toContain('7d ')
    expect(line2).toContain('12%')
    expect(line2).toContain('(5d 12h)')
  })

  it('omits usage segments when absent (degrades gracefully)', () => {
    const out = renderEssential({
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      ctxPct: 0, toolsCount: 1, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    })
    expect(out).not.toContain('5h ')
    expect(out).not.toContain('7d ')
  })
})

describe('formatCountdown', () => {
  const NOW = 1_000_000_000

  it('returns empty when undefined', () => {
    expect(formatCountdown(undefined, NOW)).toBe('')
  })

  it('returns empty when past', () => {
    expect(formatCountdown(NOW - 1000, NOW)).toBe('')
  })

  it('formats minutes only when < 1h', () => {
    expect(formatCountdown(NOW + 25 * 60_000, NOW)).toBe('25m')
  })

  it('formats hours+minutes when < 24h', () => {
    expect(formatCountdown(NOW + (2 * 60 + 30) * 60_000, NOW)).toBe('2h 30m')
  })

  it('formats hours only when whole hours', () => {
    expect(formatCountdown(NOW + 3 * 60 * 60_000, NOW)).toBe('3h')
  })

  it('formats days+hours when >= 24h', () => {
    expect(formatCountdown(NOW + (5 * 24 + 12) * 60 * 60_000, NOW)).toBe('5d 12h')
  })

  it('formats days only when whole days', () => {
    expect(formatCountdown(NOW + 3 * 24 * 60 * 60_000, NOW)).toBe('3d')
  })

  it('returns <1m when very close', () => {
    expect(formatCountdown(NOW + 30_000, NOW)).toBe('<1m')
  })
})
