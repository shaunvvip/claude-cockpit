import { describe, it, expect, vi } from 'vitest'
import { main } from './main.js'

vi.mock('./configure.js', () => ({
  runConfigure: vi.fn().mockResolvedValue(0),
}))

describe('cli main', () => {
  it('returns non-zero exit code on unknown subcommand', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await main(['node', 'cli', 'nonsense'])
    expect(code).toBe(1)
    errSpy.mockRestore()
  })

  it('dispatches configure subcommand to runConfigure', async () => {
    const { runConfigure } = await import('./configure.js')
    const code = await main(['node', 'cli', 'configure'])
    expect(runConfigure).toHaveBeenCalled()
    expect(code).toBe(0)
  })
})
