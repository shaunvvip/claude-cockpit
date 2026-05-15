import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { McpHealthBar } from './McpHealthBar.js'

describe('McpHealthBar', () => {
  it('shows "no MCP" when empty', () => {
    const { container } = render(<McpHealthBar servers={[]} />)
    expect(container.textContent).toContain('no MCP')
  })

  it('renders one dot per server with tooltip', () => {
    const { container } = render(<McpHealthBar servers={[
      { name: 'context7', health: 'healthy' },
      { name: 'figma',    health: 'down' },
    ]} />)
    const dots = container.querySelectorAll('[title]')
    expect(dots.length).toBe(2)
    expect(dots[0]!.getAttribute('title')).toContain('context7')
    expect(dots[0]!.getAttribute('title')).toContain('not used yet')
    expect(dots[1]!.getAttribute('title')).toContain('down')
  })

  it('shows "last used" + active glow for recently-called server', () => {
    const now = 1_000_000_000
    const { container } = render(<McpHealthBar
      servers={[{ name: 'a', health: 'healthy', lastCallTs: now - 60_000 }]}
      now={now}
    />)
    const dot = container.querySelector('[title]')!
    expect(dot.getAttribute('title')).toContain('1m ago')
    expect((dot as HTMLElement).style.textShadow).toContain('0 0 4px')
  })

  it('dims idle servers (>30min)', () => {
    const now = 1_000_000_000
    const { container } = render(<McpHealthBar
      servers={[{ name: 'a', health: 'healthy', lastCallTs: now - 45 * 60_000 }]}
      now={now}
    />)
    const dot = container.querySelector('[title]') as HTMLElement
    expect(dot.style.opacity).toBe('0.35')
  })
})
