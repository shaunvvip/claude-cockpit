import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { TranscriptWatcher, type TranscriptEvent } from './transcript-watcher.js'

let dir: string
let watcher: TranscriptWatcher | undefined

afterEach(async () => {
  await watcher?.stop()
  watcher = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('TranscriptWatcher', () => {
  it('emits TOOL_USE event when transcript file gets a tool_use line', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
    }) + '\n')
    await watcher.drain()
    const tu = events.find(e => e.type === 'TOOL_USE')
    expect(tu).toBeDefined()
    expect((tu as Extract<TranscriptEvent, { type: 'TOOL_USE' }>).name).toBe('Read')
  })

  it('skips malformed JSON lines', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, 'not json\n' + JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Write', input: {} }] },
    }) + '\n')
    await watcher.drain()
    expect(events.filter(e => e.type === 'TOOL_USE')).toHaveLength(1)
  })

  it('extracts USAGE from system message usage when present', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 } },
    }) + '\n')
    await watcher.drain()
    const usage = events.find(e => e.type === 'USAGE')
    expect(usage).toBeDefined()
    expect((usage as Extract<TranscriptEvent, { type: 'USAGE' }>).inputTokens).toBe(100_000)
  })
})
