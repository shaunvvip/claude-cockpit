import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { parseMcpConfig } from './mcp-inspector.js'

let dir: string | undefined

afterEach(() => {
  if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined }
})

describe('parseMcpConfig', () => {
  it('returns empty list when settings.json missing', () => {
    expect(parseMcpConfig('/nonexistent')).toEqual([])
  })

  it('returns mcp server names from a settings file', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({
      mcpServers: {
        ctx7: { command: 'mcp-context7', args: [] },
        figma: { command: 'mcp-figma', args: [] },
      },
    }))
    const out = parseMcpConfig(path)
    expect(out).toEqual([
      { name: 'ctx7', health: 'healthy' },
      { name: 'figma', health: 'healthy' },
    ])
  })

  it('returns empty list on malformed JSON', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, '{bad')
    expect(parseMcpConfig(path)).toEqual([])
  })

  it('returns empty list when mcpServers field is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({ theme: 'dark' }))
    expect(parseMcpConfig(path)).toEqual([])
  })
})
