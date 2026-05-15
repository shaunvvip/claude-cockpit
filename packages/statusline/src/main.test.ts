import { describe, it, expect, vi } from 'vitest'
import { runStatusline } from './main.js'

describe('runStatusline', () => {
  it('outputs essential 2-line output when daemon online and input parses', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined)
    const send   = vi.fn().mockResolvedValue(undefined)
    const ping   = vi.fn().mockResolvedValue(true)
    const fetchSession = vi.fn().mockResolvedValue({
      ctxPct: 47, cost: 0.42,
      tools: [{ ts: 1, name: 'Read', status: 'ok' }],
      todos: [{ text: 'done', completed: true }, { text: 'open', completed: false }],
    })
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
      fetchSession,
    })
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('m')
    expect(lines[0]).toContain('z')
    expect(lines[0]).toContain('main')
    expect(lines[0]).toContain('47%')
    expect(lines[1]).toContain('1/2')   // todos
    expect(lines[1]).toContain('[dash]')
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
      fetchSession: vi.fn(),
    })
    expect(out).toContain('claude-cockpit')
  })
})
