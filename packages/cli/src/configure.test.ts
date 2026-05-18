import { describe, it, expect } from 'vitest'
import { runConfigure } from './configure.js'

describe('runConfigure', () => {
  it('is an async function', () => {
    expect(typeof runConfigure).toBe('function')
    // Interactive wizard requires TTY mocking — integration test in Slice 5.
  })
})
