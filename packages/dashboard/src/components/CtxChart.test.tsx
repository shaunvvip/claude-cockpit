import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CtxChart } from './CtxChart.js'

vi.mock('uplot', () => {
  return {
    default: class UPlot {
      constructor(_opts: unknown, _data: unknown, _el: HTMLElement) {}
      destroy() {}
    },
  }
})

describe('CtxChart', () => {
  it('renders panel after first non-zero value', () => {
    const { container, rerender } = render(<CtxChart ctxPct={30} />)
    rerender(<CtxChart ctxPct={50} />)
    expect(container.textContent).toContain('CTX %')
  })
})
