import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { patchSettingsJson } from './settings-json.js'

describe('patchSettingsJson', () => {
  let tmpFile: string
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cockpit-settings-'))
    tmpFile = join(tmpDir, 'settings.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates settings.json with statusLine when file missing', () => {
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(true)
    expect(r.previousCommand).toBeUndefined()
    expect(r.backupPath).toBeUndefined()
    const after = JSON.parse(readFileSync(tmpFile, 'utf8'))
    expect(after.statusLine.command).toBe('npx claude-cockpit statusline')
  })

  it('is no-op when already pointing at claude-cockpit', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statusLine: { type: 'command', command: 'npx claude-cockpit statusline' },
    }))
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(false)
  })

  it('backs up previous command + patches', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statusLine: { type: 'command', command: '/usr/local/bin/old-statusline' },
      otherKey: 'preserved',
    }))
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(true)
    expect(r.previousCommand).toBe('/usr/local/bin/old-statusline')
    expect(r.backupPath).toBeDefined()
    expect(existsSync(r.backupPath!)).toBe(true)

    const after = JSON.parse(readFileSync(tmpFile, 'utf8'))
    expect(after.statusLine.command).toBe('npx claude-cockpit statusline')
    expect(after.otherKey).toBe('preserved')
  })

  it('returns error and does not modify when settings.json is not valid JSON', () => {
    writeFileSync(tmpFile, '{ not valid json')
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(false)
    expect(r.error).toBeDefined()
    expect(readFileSync(tmpFile, 'utf8')).toBe('{ not valid json')   // unchanged
  })
})
