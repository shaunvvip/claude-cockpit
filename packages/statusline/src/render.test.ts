import { describe, it, expect } from 'vitest'
import { renderMinimal } from './render.js'

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
