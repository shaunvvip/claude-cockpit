import { describe, it, expect } from 'vitest'
import { AlertStore } from './alert-store.js'

describe('AlertStore', () => {
  it('caps at 50', () => {
    const s = new AlertStore()
    for (let i = 0; i < 60; i++) s.push({ ruleId: 'ctx-high', sessionId: 'a', ts: i, title: '', body: '' })
    expect(s.list()).toHaveLength(50)
    expect(s.list()[0]!.ts).toBe(10)
  })

  it('filters by sessionId', () => {
    const s = new AlertStore()
    s.push({ ruleId: 'ctx-high', sessionId: 'a', ts: 1, title: '', body: '' })
    s.push({ ruleId: 'ctx-high', sessionId: 'b', ts: 2, title: '', body: '' })
    s.push({ ruleId: 'ctx-high', sessionId: 'a', ts: 3, title: '', body: '' })
    expect(s.bySession('a')).toHaveLength(2)
  })
})
