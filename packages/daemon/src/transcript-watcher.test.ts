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
      message: { usage: { input_tokens: 6, output_tokens: 0, cache_read_input_tokens: 30000, cache_creation_input_tokens: 174 } },
    }) + '\n')
    await watcher.drain()
    const usage = events.find(e => e.type === 'USAGE') as Extract<TranscriptEvent, { type: 'USAGE' }> | undefined
    expect(usage).toBeDefined()
    expect(usage!.inputTokens).toBe(6)
    expect(usage!.cacheReadTokens).toBe(30000)
    expect(usage!.cacheCreationTokens).toBe(174)
  })

  it('streams a 2 MB transcript in chunks without OOM (perf gate)', async () => {
    const path = `${mkdtempSync(join(tmpdir(), 'tw-perf-'))}/big.jsonl`
    const line = JSON.stringify({
      message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x.ts' } }] },
    })
    // 2 MB of identical tool_use lines — should produce ~thousands of TOOL_USE events
    const lines = Array.from({ length: 10_000 }, () => line).join('\n') + '\n'
    writeFileSync(path, lines)
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    const t0 = Date.now()
    await watcher.start()
    const ms = Date.now() - t0
    expect(events.filter(e => e.type === 'TOOL_USE')).toHaveLength(10_000)
    expect(ms).toBeLessThan(2000)   // generous gate; should be well under 500ms
  })

  it('parses content existing in the file BEFORE start() (Bug A regression)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    // Pre-write 3 lines BEFORE watcher starts — simulating daemon spawning
    // mid-session with an existing transcript.
    const lines = [
      JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }] } }),
      JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/b.ts' } }] } }),
      JSON.stringify({ message: { usage: { input_tokens: 6, output_tokens: 10, cache_read_input_tokens: 30000, cache_creation_input_tokens: 100 } } }),
    ]
    writeFileSync(path, lines.join('\n') + '\n')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    expect(events.filter(e => e.type === 'TOOL_USE')).toHaveLength(2)
    expect(events.filter(e => e.type === 'FILE_EDIT')).toHaveLength(2)
    expect(events.filter(e => e.type === 'USAGE')).toHaveLength(1)
  })

  it('emits TODOS from TodoWrite tool_use input (Bug D)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, JSON.stringify({
      message: {
        content: [{
          type: 'tool_use', name: 'TodoWrite',
          input: { todos: [
            { content: 'one',   status: 'completed',  activeForm: '...' },
            { content: 'two',   status: 'in_progress', activeForm: '...' },
            { content: 'three', status: 'pending',    activeForm: '...' },
          ] },
        }],
      },
    }) + '\n')
    await watcher.drain()
    const todos = events.find(e => e.type === 'TODOS') as Extract<TranscriptEvent, { type: 'TODOS' }> | undefined
    expect(todos).toBeDefined()
    expect(todos!.items).toHaveLength(3)
    expect(todos!.items[0]).toEqual({ text: 'one', completed: true })
    expect(todos!.items[1]).toEqual({ text: 'two', completed: false })
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
