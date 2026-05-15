import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeRuntimeInfo, readRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'cockpit-rt-'))
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('runtime-info', () => {
  it('writes and reads back', () => {
    const path = join(testDir, 'daemon.json')
    writeRuntimeInfo(path, { pid: 1234, port: 5678, startedAt: 100 })
    expect(readRuntimeInfo(path)).toEqual({ pid: 1234, port: 5678, startedAt: 100 })
  })

  it('readRuntimeInfo returns null when missing', () => {
    expect(readRuntimeInfo(join(testDir, 'nope.json'))).toBeNull()
  })

  it('readRuntimeInfo returns null on malformed JSON', () => {
    const path = join(testDir, 'bad.json')
    writeFileSync(path, '{not json')
    expect(readRuntimeInfo(path)).toBeNull()
  })

  it('deleteRuntimeInfo is idempotent', () => {
    const path = join(testDir, 'x.json')
    expect(() => deleteRuntimeInfo(path)).not.toThrow()
    writeRuntimeInfo(path, { pid: 1, port: 1, startedAt: 1 })
    deleteRuntimeInfo(path)
    expect(readRuntimeInfo(path)).toBeNull()
  })
})
