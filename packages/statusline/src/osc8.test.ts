import { describe, it, expect, beforeEach } from 'vitest'
import { detectOsc8Support, osc8 } from './osc8.js'

describe('detectOsc8Support', () => {
  beforeEach(() => {
    delete process.env.TERM_PROGRAM
    delete process.env.WEZTERM_EXECUTABLE
    delete process.env.KITTY_WINDOW_ID
    delete process.env.GHOSTTY_RESOURCES_DIR
    delete process.env.WT_SESSION
    delete process.env.VSCODE_INJECTION
    delete process.env.ALACRITTY_LOG
  })

  it('detects iTerm2', () => {
    process.env.TERM_PROGRAM = 'iTerm.app'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects WezTerm via env', () => {
    process.env.WEZTERM_EXECUTABLE = '/usr/local/bin/wezterm'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects Kitty', () => {
    process.env.KITTY_WINDOW_ID = '1'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects Ghostty', () => {
    process.env.GHOSTTY_RESOURCES_DIR = '/app/share/ghostty'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects VS Code integrated terminal', () => {
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectOsc8Support()).toBe(true)
  })

  it('treats Apple_Terminal as unsupported', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal'
    expect(detectOsc8Support()).toBe(false)
  })

  it('defaults to false when unknown', () => {
    expect(detectOsc8Support()).toBe(false)
  })
})

describe('osc8', () => {
  it('wraps text with escape sequences when supported', () => {
    const out = osc8('http://x', 'hi', true)
    expect(out).toContain(']8;;http://x')
    expect(out).toContain('hi')
    expect(out).toMatch(/\]8;;\x07?$/)
  })

  it('returns raw text when not supported', () => {
    expect(osc8('http://x', 'hi', false)).toBe('hi')
  })
})
