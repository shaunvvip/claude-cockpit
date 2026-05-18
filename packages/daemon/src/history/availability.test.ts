import { describe, it, expect } from 'vitest'
import { tryOpenHistory } from './availability.js'

describe('tryOpenHistory', () => {
  it('opens an in-memory store successfully', async () => {
    const result = await tryOpenHistory(':memory:')
    expect(result.available).toBe(true)
    expect(result.store).toBeDefined()
    result.store?.close()
  })

  it('returns available=false with reason when path is invalid', async () => {
    // Force failure by passing a path inside a non-existent directory
    const result = await tryOpenHistory('/non-existent-dir-12345/cockpit.db')
    expect(result.available).toBe(false)
    expect(result.reason).toBeTruthy()
  })
})
