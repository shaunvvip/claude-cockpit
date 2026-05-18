import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HistoryTabs } from './HistoryTabs.js'

describe('HistoryTabs', () => {
  it('renders all three tab buttons', () => {
    render(<HistoryTabs active="trends" onChange={() => {}} />)
    expect(screen.getByText(/trends/i)).toBeInTheDocument()
    expect(screen.getByText(/top/i)).toBeInTheDocument()
    expect(screen.getByText(/projects/i)).toBeInTheDocument()
  })

  it('calls onChange with the clicked tab', () => {
    const onChange = vi.fn()
    render(<HistoryTabs active="trends" onChange={onChange} />)
    fireEvent.click(screen.getByText(/top/i))
    expect(onChange).toHaveBeenCalledWith('top')
  })

  it('calls onChange with projects tab', () => {
    const onChange = vi.fn()
    render(<HistoryTabs active="trends" onChange={onChange} />)
    fireEvent.click(screen.getByText(/projects/i))
    expect(onChange).toHaveBeenCalledWith('projects')
  })

  it('active tab has border-b-2 class, inactive does not', () => {
    const { container } = render(<HistoryTabs active="top" onChange={() => {}} />)
    const buttons = container.querySelectorAll('button')
    const activeBtn = Array.from(buttons).find(b => b.textContent?.match(/top/i))
    const inactiveBtn = Array.from(buttons).find(b => b.textContent?.match(/trends/i))
    expect(activeBtn?.className).toContain('border-b-2')
    expect(inactiveBtn?.className).not.toContain('border-b-2')
  })
})
