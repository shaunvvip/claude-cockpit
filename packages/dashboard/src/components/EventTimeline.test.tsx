import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EventTimeline } from './EventTimeline.js'

describe('EventTimeline', () => {
  it('sorts events newest first', () => {
    const events = [
      { type: 'TOOL_USE' as const, name: 'Old', ts: 1000 },
      { type: 'TOOL_USE' as const, name: 'New', ts: 9000 },
    ]
    const { container } = render(<EventTimeline events={events} />)
    const newIdx = container.textContent!.indexOf('New')
    const oldIdx = container.textContent!.indexOf('Old')
    expect(newIdx).toBeLessThan(oldIdx)
  })

  it('describes FILE_EDIT with basename', () => {
    const events = [{ type: 'FILE_EDIT' as const, path: '/a/b/c.ts', tool: 'Edit', ts: 1 }]
    const { container } = render(<EventTimeline events={events} />)
    expect(container.textContent).toContain('c.ts')
    expect(container.textContent).not.toContain('/a/b/')
  })
})
