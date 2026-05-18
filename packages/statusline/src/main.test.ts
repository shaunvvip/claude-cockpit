import { describe, it, expect, vi } from 'vitest'
import { runStatusline } from './main.js'

vi.mock('./config-reader.js', () => ({
  readStatuslineConfig: vi.fn().mockReturnValue({ preset: 'essential' }),
}))
import { readStatuslineConfig } from './config-reader.js'

describe('runStatusline', () => {
  it('outputs essential 2-line output when daemon online and input parses', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined)
    const send   = vi.fn().mockResolvedValue(undefined)
    const ping   = vi.fn().mockResolvedValue(true)
    const fetchSession = vi.fn().mockResolvedValue({
      ctxPct: 47,
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
    // Line 1: identity + work + links
    expect(lines[0]).toContain('m')
    expect(lines[0]).toContain('z')
    expect(lines[0]).toContain('main')
    expect(lines[0]).toContain('1/2')   // todos
    expect(lines[0]).toContain('[dash]')
    // Line 2: gauges
    expect(lines[1]).toContain('47%')
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

describe('runStatusline preset routing', () => {
  const baseDeps = (preset: 'minimal' | 'essential' | 'full') => {
    ;(readStatuslineConfig as ReturnType<typeof vi.fn>).mockReturnValue({ preset })
    return {
      stdin: JSON.stringify({
        session_id: 'sid', cwd: '/x/y/z', model: { id: 'm' },
        transcript_path: '/t.jsonl', workspace: { current_branch: 'main' },
      }),
      sockPath: '/tmp/x.sock',
      detect: () => false,
      ensureDaemon: vi.fn(),
      pingDaemon: vi.fn().mockResolvedValue(true),
      sendUpdateSession: vi.fn(),
      readRuntimeInfo: () => ({ pid: 1, port: 5050, startedAt: 1 }),
      fetchSession: vi.fn().mockResolvedValue({
        ctxPct: 47, tools: [{ ts: 1, name: 'Read', status: 'ok' }],
        todos: [], cacheReadTokens: 100_000, otherCount: 2,
      }),
    }
  }

  it('preset=minimal → single line', async () => {
    const out = await runStatusline(baseDeps('minimal'))
    expect(out.split('\n')).toHaveLength(1)
  })

  it('preset=essential → 2 lines, no cache/others extras', async () => {
    const out = await runStatusline(baseDeps('essential'))
    expect(out.split('\n')).toHaveLength(2)
    expect(out).not.toContain('cache ')
    expect(out).not.toContain('others ×')
  })

  it('preset=full → 2 lines + cache + others + tool', async () => {
    const out = await runStatusline(baseDeps('full'))
    expect(out.split('\n')).toHaveLength(2)
    expect(out).toContain('cache 100k')
    expect(out).toContain('others ×2')
    expect(out).toContain('tool: Read')
  })
})
