import { describe, it, expect } from 'vitest'
import { getCockpitDir, getSocketPath, getRuntimeInfoPath } from './paths.js'

describe('paths', () => {
  it('socket path lives in TMPDIR', () => {
    expect(getSocketPath()).toMatch(/claude-cockpit\.sock$/)
  })
  it('cockpit dir is under HOME', () => {
    expect(getCockpitDir()).toMatch(/\.claude-cockpit$/)
  })
  it('runtime info lives inside cockpit dir', () => {
    expect(getRuntimeInfoPath()).toBe(`${getCockpitDir()}/daemon.json`)
  })
})
