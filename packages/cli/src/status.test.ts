import { describe, it, expect, vi } from 'vitest'
import { runStatus } from './status.js'

describe('runStatus', () => {
  it('returns exit code 0', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await runStatus()
    expect(code).toBe(0)
    logSpy.mockRestore()
  })

  it('prints version + Daemon + History + Statusline sections', async () => {
    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((s) => { logs.push(String(s)) })
    await runStatus()
    const joined = logs.join('\n')
    expect(joined).toContain('claude-cockpit v')
    expect(joined).toContain('Daemon')
    expect(joined).toContain('History (SQLite)')
    expect(joined).toContain('Statusline plugin')
    logSpy.mockRestore()
  })
})
