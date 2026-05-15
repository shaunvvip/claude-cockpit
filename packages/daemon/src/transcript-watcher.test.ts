import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { writeFile, unlink, appendFile, mkdtemp } from 'node:fs/promises'
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

describe('TranscriptWatcher FILE_EDIT extraction', () => {
  let tmpFile: string

  beforeEach(async () => {
    const d = await mkdtemp(join(tmpdir(), 'cockpit-tw-'))
    tmpFile = join(d, 'transcript.jsonl')
    await writeFile(tmpFile, '')
  })

  afterEach(async () => { try { await unlink(tmpFile) } catch { /* */ } })

  it('emits FILE_EDIT for Edit tool with file_path', async () => {
    const events: TranscriptEvent[] = []
    const w = new TranscriptWatcher(tmpFile, (e) => events.push(e))
    await w.start()
    const line = JSON.stringify({
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/x/y.ts' } }] },
    })
    await appendFile(tmpFile, line + '\n')
    await new Promise((r) => setTimeout(r, 100))
    await w.drain()
    await w.stop()
    const fe = events.find((e) => e.type === 'FILE_EDIT')
    expect(fe).toBeDefined()
    expect(fe).toMatchObject({ type: 'FILE_EDIT', path: '/x/y.ts', tool: 'Edit' })
  })

  it('emits FILE_EDIT for Write and Read tools', async () => {
    const events: TranscriptEvent[] = []
    const w = new TranscriptWatcher(tmpFile, (e) => events.push(e))
    await w.start()
    for (const tool of ['Write', 'Read']) {
      const line = JSON.stringify({
        message: { content: [{ type: 'tool_use', name: tool, input: { file_path: `/a/${tool}.ts` } }] },
      })
      await appendFile(tmpFile, line + '\n')
    }
    await new Promise((r) => setTimeout(r, 100))
    await w.drain()
    await w.stop()
    const fes = events.filter((e) => e.type === 'FILE_EDIT')
    expect(fes).toHaveLength(2)
  })

  it('does not emit FILE_EDIT when file_path is missing', async () => {
    const events: TranscriptEvent[] = []
    const w = new TranscriptWatcher(tmpFile, (e) => events.push(e))
    await w.start()
    const line = JSON.stringify({
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { content: 'x' } }] },
    })
    await appendFile(tmpFile, line + '\n')
    await new Promise((r) => setTimeout(r, 100))
    await w.drain()
    await w.stop()
    expect(events.some((e) => e.type === 'FILE_EDIT')).toBe(false)
  })
})
