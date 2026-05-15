import { describe, it, expect, vi } from 'vitest'
import { runStatusline } from './main.js'

describe('runStatusline', () => {
  it('outputs minimal line when daemon online and input parses', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined)
    const send   = vi.fn().mockResolvedValue(undefined)
    const ping   = vi.fn().mockResolvedValue(true)
    const out = await runStatusline({
      stdin: JSON.stringify({
        session_id: 'sid', cwd: '/x/y/z', model: { id: 'm' },
        transcript_path: '/t.jsonl', workspace: { current_branch: 'main' },
      }),
      sockPath: '/tmp/x.sock',
      detect: () => false,
      ensureDaemon: ensure,
      pingDaemon: ping,
      sendUpdateSession: send,
      readRuntimeInfo: () => ({ pid: 1, port: 5050, startedAt: 1 }),
    })
    expect(out).toContain('m')
    expect(out).toContain('z')
    expect(out).toContain('main')
    expect(out).toContain('[cockpit]')
    expect(send).toHaveBeenCalledWith('/tmp/x.sock', 'sid', expect.any(Object))
  })

  it('returns fallback text when stdin not parseable', async () => {
    const out = await runStatusline({
      stdin: 'not json',
      sockPath: '/tmp/x.sock',
      detect: () => false,
      ensureDaemon: vi.fn(),
      pingDaemon: vi.fn().mockResolvedValue(false),
      sendUpdateSession: vi.fn(),
      readRuntimeInfo: () => null,
    })
    expect(out).toContain('claude-cockpit')
  })
})
