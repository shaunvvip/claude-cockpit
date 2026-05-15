import { describe, it, expect } from 'vitest'
import { parseStatuslineInput } from './stdin.js'

describe('parseStatuslineInput', () => {
  it('parses a typical Claude Code stdin payload', () => {
    const raw = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/home/me/proj',
      model: { id: 'claude-opus-4-7' },
      transcript_path: '/Users/x/.claude/projects/abc/transcript.jsonl',
      workspace: { current_branch: 'main' },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed).toEqual({
      sessionId: 'abc-123',
      cwd: '/home/me/proj',
      model: 'claude-opus-4-7',
      transcriptPath: '/Users/x/.claude/projects/abc/transcript.jsonl',
      branch: 'main',
    })
  })

  it('returns null for invalid JSON', () => {
    expect(parseStatuslineInput('not json')).toBeNull()
  })

  it('returns null when required fields missing', () => {
    expect(parseStatuslineInput('{}')).toBeNull()
  })

  it('extracts cost.total_cost_usd when present (Bug C)', () => {
    const raw = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/x',
      model: { id: 'claude-opus-4-7' },
      transcript_path: '/x/t.jsonl',
      cost: { total_cost_usd: 1.234, total_duration_ms: 5000 },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed?.cost).toBe(1.234)
  })

  it('omits cost when missing or malformed', () => {
    const raw = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/x',
      model: { id: 'claude-opus-4-7' },
      transcript_path: '/x/t.jsonl',
      cost: { total_cost_usd: 'not a number' },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed?.cost).toBeUndefined()
  })

  it('extracts 5h + 7d rate_limits with ISO resets_at', () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const raw = JSON.stringify({
      session_id: 'sid', cwd: '/x', model: { id: 'm' }, transcript_path: '/t',
      rate_limits: {
        five_hour: { used_percentage: 25, resets_at: future },
        seven_day: { used_percentage: 12, resets_at: future },
      },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed?.usage5hPct).toBe(25)
    expect(parsed?.usage7dPct).toBe(12)
    expect(parsed?.usage5hResetAt).toBeDefined()
    expect(parsed?.usage5hResetAt! > Date.now()).toBe(true)
  })

  it('clamps usage percentages to [0, 100]', () => {
    const raw = JSON.stringify({
      session_id: 'sid', cwd: '/x', model: { id: 'm' }, transcript_path: '/t',
      rate_limits: { five_hour: { used_percentage: 150 }, seven_day: { used_percentage: -5 } },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed?.usage5hPct).toBe(100)
    expect(parsed?.usage7dPct).toBe(0)
  })

  it('handles seconds-epoch resets_at (older CC versions)', () => {
    const futureSec = Math.floor(Date.now() / 1000) + 3600
    const raw = JSON.stringify({
      session_id: 'sid', cwd: '/x', model: { id: 'm' }, transcript_path: '/t',
      rate_limits: { five_hour: { used_percentage: 50, resets_at: futureSec } },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed?.usage5hResetAt).toBeDefined()
    // Should be normalized to ms epoch
    expect(parsed?.usage5hResetAt! > 1e12).toBe(true)
  })

  it('omits usage fields when rate_limits is missing', () => {
    const raw = JSON.stringify({
      session_id: 'sid', cwd: '/x', model: { id: 'm' }, transcript_path: '/t',
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed?.usage5hPct).toBeUndefined()
    expect(parsed?.usage7dPct).toBeUndefined()
  })
})
