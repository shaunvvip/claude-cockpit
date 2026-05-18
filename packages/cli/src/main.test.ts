import { describe, it, expect, vi } from 'vitest'
import { main } from './main.js'

describe('cli main', () => {
  it('returns non-zero exit code on unknown subcommand', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await main(['node', 'cli', 'nonsense'])
    expect(code).toBe(1)
    errSpy.mockRestore()
  })

  it('returns non-zero (skeleton) for configure subcommand pre-implementation', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await main(['node', 'cli', 'configure'])
    expect(code).toBe(1)
    errSpy.mockRestore()
  })
})
