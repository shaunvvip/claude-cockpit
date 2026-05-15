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
})
