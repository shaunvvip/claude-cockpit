import { describe, it, expect } from 'vitest'
import { renderMinimal, renderEssential } from './render.js'

describe('renderMinimal', () => {
  it('outputs one line with model, cwd, branch, ctx, cost', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/home/me/proj', model: 'claude-opus-4-7',
      branch: 'main', ctxPct: 47, cost: 0.42,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: false,
    })
    expect(out).toContain('claude-opus-4-7')
    expect(out).toContain('proj')
    expect(out).toContain('main')
    expect(out).toContain('47%')
    expect(out).toContain('$0.42')
    expect(out).toContain('[cockpit]')
  })

  it('emits OSC 8 escape sequences when supported', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/x', model: 'm',
      branch: 'main', ctxPct: 0, cost: 0,
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
      ctxPct: 50, cost: 1.23, toolsCount: 7, subagentCount: 2,
      todosDone: 2, todosTotal: 5,
      dashboardUrl: 'http://l/s', stopUrl: 'http://l/stop', fileUrl: 'http://l/file',
      supportsOsc8: false,
    })
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('50%')
    expect(lines[0]).toContain('[█████░░░░░]')
    expect(lines[1]).toContain('7')
    expect(lines[1]).toContain('2/5')
    expect(lines[1]).toContain('[dash]')
    expect(lines[1]).toContain('[stop]')
    expect(lines[1]).toContain('[file]')
  })

  it('progress bar is empty at 0% and full at 100%', () => {
    const base = {
      sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
      cost: 0, toolsCount: 0, subagentCount: 0, todosDone: 0, todosTotal: 0,
      dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
      supportsOsc8: false,
    } as const
    expect(renderEssential({ ...base, ctxPct: 0 })).toContain('[░░░░░░░░░░]')
    expect(renderEssential({ ...base, ctxPct: 100 })).toContain('[██████████]')
  })
})
