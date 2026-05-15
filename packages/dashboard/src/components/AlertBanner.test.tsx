import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlertBanner } from './AlertBanner.js'

describe('AlertBanner', () => {
  it('renders nothing when ruleId is undefined', () => {
    const { container } = render(<AlertBanner ruleId={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders rule label when ruleId is known', () => {
    render(<AlertBanner ruleId="ctx-high" />)
    expect(screen.getByRole('alert')).toHaveAttribute('data-rule-id', 'ctx-high')
    expect(screen.getByRole('alert').textContent).toContain('Context near limit')
  })

  it('falls back to raw ruleId for unknown rules', () => {
    render(<AlertBanner ruleId="custom-rule" />)
    expect(screen.getByRole('alert').textContent).toContain('custom-rule')
  })
})
