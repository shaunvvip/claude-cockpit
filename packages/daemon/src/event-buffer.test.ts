import { describe, it, expect } from 'vitest'
import { EventBuffer } from './event-buffer.js'

describe('EventBuffer', () => {
  it('appends events per session', () => {
    const b = new EventBuffer()
    b.push('a', { type: 'TOOL_USE', name: 'X', ts: 1 })
    b.push('a', { type: 'TOOL_USE', name: 'Y', ts: 2 })
    b.push('b', { type: 'TOOL_USE', name: 'Z', ts: 3 })
    expect(b.get('a')).toHaveLength(2)
    expect(b.get('b')).toHaveLength(1)
  })

  it('evicts oldest when over capacity', () => {
    const b = new EventBuffer(3)
    for (let i = 0; i < 5; i++) b.push('s', { type: 'TOOL_USE', name: String(i), ts: i })
    const arr = b.get('s')
    expect(arr).toHaveLength(3)
    expect(arr.map((e: any) => e.name)).toEqual(['2', '3', '4'])
  })

  it('recent() slices by time window', () => {
    const b = new EventBuffer()
    b.push('s', { type: 'TOOL_USE', name: 'old', ts: 1000 })
    b.push('s', { type: 'TOOL_USE', name: 'mid', ts: 2000 })
    b.push('s', { type: 'TOOL_USE', name: 'new', ts: 3000 })
    const r = b.recent('s', 3500, 1500)  // [2000, 3500]
    expect(r.map((e: any) => e.name)).toEqual(['mid', 'new'])
  })

  it('recent() returns empty when nothing in window', () => {
    const b = new EventBuffer()
    b.push('s', { type: 'TOOL_USE', name: 'old', ts: 1000 })
    expect(b.recent('s', 10000, 500)).toEqual([])
  })

  it('drop() removes a session', () => {
    const b = new EventBuffer()
    b.push('s', { type: 'TOOL_USE', name: 'x', ts: 1 })
    b.drop('s')
    expect(b.get('s')).toEqual([])
  })
})
