import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ToolBarChart } from './ToolBarChart.js'

describe('ToolBarChart', () => {
  it('renders sorted tool counts in the 5min window', () => {
    const now = Date.now()
    const events = [
      { type: 'TOOL_USE' as const, name: 'Edit', ts: now - 1000 },
      { type: 'TOOL_USE' as const, name: 'Edit', ts: now - 2000 },
      { type: 'TOOL_USE' as const, name: 'Read', ts: now - 3000 },
    ]
    const { container } = render(<ToolBarChart events={events} />)
    expect(container.textContent).toContain('Edit')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('Read')
  })

  it('ignores events outside the 5min window', () => {
    const now = Date.now()
    const events = [{ type: 'TOOL_USE' as const, name: 'Old', ts: now - 6 * 60 * 1000 }]
    const { container } = render(<ToolBarChart events={events} />)
    expect(container.textContent).not.toContain('Old')
  })
})
