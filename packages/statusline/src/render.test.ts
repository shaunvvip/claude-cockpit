import { describe, it, expect } from 'vitest'
import { renderMinimal, renderEssential, formatCountdown } from './render.js'

describe('renderMinimal', () => {
  it('outputs one line with model, cwd, branch, ctx', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/home/me/proj', model: 'claude-opus-4-7',
      branch: 'main', ctxPct: 47,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: false,
    })
    expect(out).toContain('claude-opus-4-7')
    expect(out).toContain('proj')
    expect(out).toContain('main')
    expect(out).toContain('47%')
    expect(out).not.toContain('$')
    expect(out).toContain('[cockpit]')
    expect(out).toContain('\x1b[32m')
  })

  it('omits branch segment when undefined (no more "detached" placeholder)', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/x', model: 'm',
      ctxPct: 0,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: false,
    })
    expect(out).not.toContain('detached')
    // structure: ● m · x · ctx 0% · [cockpit]   (no branch slot)
    const parts = out.split(' · ')
    expect(parts).toHaveLength(4)
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
  it('line 1 carries identity + work + links; line 2 carries gauges', () => {
    const out = renderEssential({
      sessionId: 'sid', cwd: '/a/b/c', model: 'm', branch: 'main',
      ctxPct: 50, toolsCount: 7, subagentCount: 2,
      todosDone: 2, todosTotal: 5,
      dashboardUrl: 'http://l/s', stopUrl: 'http://l/stop', fileUrl: 'http://l/file',
      supportsOsc8: false,
    })
    const [line1, line2] = out.split('\n')
    // line 1: model · cwd · branch · tools · todos · [dash] [stop] [file]
    expect(line1).toContain('m')
    expect(line1).toContain('c')        // cwd basename
    expect(line1).toContain('main')
    expect(line1).toContain('tools 7↑')
    expect(line1).toContain('2/5')
    expect(line1).toContain('[dash]')
    expect(line1).toContain('[stop]')
    expect(line1).toContain('[file]')
    // line 2: ctx N% bar
    expect(line2).toContain('50%')
    expect(line2).toContain('█████')   // 5 of 10 cells filled
    expect(line2).toContain('░░░░░')
    // no leakage between lines
    expect(line1).not.toContain('ctx ')
    expect(line2).not.toContain('[dash]')
  })

  it('progress bar is empty at 0% and full at 100% (line 2)', () => {
    const base = {
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      toolsCount: 0, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    } as const
    const at0 = renderEssential({ ...base, ctxPct: 0 }).split('\n')[1]!
    const at100 = renderEssential({ ...base, ctxPct: 100 }).split('\n')[1]!
    expect(at0).toContain('░░░░░░░░░░')
    expect(at100).toContain('██████████')
  })

  it('ctx bar uses RED ANSI at >=85% and GREEN at low', () => {
    const base = {
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      toolsCount: 0, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    } as const
    expect(renderEssential({ ...base, ctxPct: 90 }).split('\n')[1]).toContain('\x1b[31m')
    expect(renderEssential({ ...base, ctxPct: 20 }).split('\n')[1]).toContain('\x1b[32m')
    expect(renderEssential({ ...base, ctxPct: 75 }).split('\n')[1]).toContain('\x1b[33m')
  })

  it('usage segments share line 2 with ctx, colored by quota thresholds', () => {
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
    expect(line2).toContain('ctx ')
    expect(line2).toContain('5h ')
    expect(line2).toContain('7d ')
    expect(line2).toContain('\x1b[31m')   // 92% → RED for 5h
    expect(line2).toContain('\x1b[94m')   // 30% → BRIGHT_BLUE for 7d
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
    expect(line2).toContain('25%')
    expect(line2).toContain('(2h 30m)')
    expect(line2).toContain('12%')
    expect(line2).toContain('(5d 12h)')
  })

  it('line 2 only has ctx when usage segments absent', () => {
    const out = renderEssential({
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      ctxPct: 30, toolsCount: 1, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    })
    const line2 = out.split('\n')[1]!
    expect(line2).toContain('ctx ')
    expect(line2).not.toContain('5h ')
    expect(line2).not.toContain('7d ')
  })

  it('line 1 omits branch segment when undefined', () => {
    const out = renderEssential({
      sessionId: 's', cwd: '/x', model: 'm',
      ctxPct: 30, toolsCount: 1, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    })
    const line1 = out.split('\n')[0]!
    expect(line1).not.toContain('detached')
    expect(line1).not.toContain('main')
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
