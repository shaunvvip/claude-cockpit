import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

export type TranscriptEvent =
  | { type: 'TOOL_USE'; name: string; ts: number }
  | { type: 'USAGE'; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; ts: number }
  | { type: 'TODOS'; items: { text: string; completed: boolean }[]; ts: number }
  | { type: 'FILE_EDIT'; path: string; tool: 'Edit' | 'Write' | 'Read'; ts: number }

export type TranscriptListener = (event: TranscriptEvent) => void

export class TranscriptWatcher {
  private fh: FileHandle | undefined
  private offset = 0
  private fsw: FSWatcher | undefined
  private stopped = false

  constructor(
    private readonly path: string,
    private readonly listener: TranscriptListener,
  ) {}

  async start(): Promise<void> {
    this.fh = await open(this.path, 'r')
    // Start at byte 0 — drain() will parse all existing content, then watch for
    // future appends. Previously this started at EOF which caused tools/ctx/etc.
    // to stay at 0 for any session whose transcript existed before daemon spawn.
    this.offset = 0
    this.fsw = watch(this.path, () => { void this.drain() })
    await this.drain()
  }

  async drain(): Promise<void> {
    if (this.stopped || !this.fh) return
    const stat = await this.fh.stat()
    if (stat.size <= this.offset) return
    const buf = Buffer.alloc(stat.size - this.offset)
    await this.fh.read(buf, 0, buf.length, this.offset)
    this.offset = stat.size
    const text = buf.toString('utf8')
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        this.handleLine(obj)
      } catch { /* skip malformed */ }
    }
  }

  private handleLine(obj: Record<string, unknown>): void {
    const ts = Date.now()
    const message = obj.message as Record<string, unknown> | undefined
    if (!message) return

    // tool_use detection
    const content = message.content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item && typeof item === 'object') {
          const i = item as Record<string, unknown>
          if (i.type === 'tool_use' && typeof i.name === 'string') {
            this.listener({ type: 'TOOL_USE', name: i.name, ts })

            // FILE_EDIT extraction for Edit / Write / Read
            if (i.name === 'Edit' || i.name === 'Write' || i.name === 'Read') {
              const input = i.input as Record<string, unknown> | undefined
              const filePath = input?.file_path
              if (typeof filePath === 'string' && filePath.length > 0) {
                this.listener({
                  type: 'FILE_EDIT',
                  path: filePath,
                  tool: i.name as 'Edit' | 'Write' | 'Read',
                  ts,
                })
              }
            }

            // TODOS extraction from TodoWrite tool_use input
            if (i.name === 'TodoWrite') {
              const input = i.input as Record<string, unknown> | undefined
              const todos = input?.todos
              if (Array.isArray(todos)) {
                const items: { text: string; completed: boolean }[] = []
                for (const t of todos) {
                  if (t && typeof t === 'object') {
                    const tt = t as Record<string, unknown>
                    // Claude Code TodoWrite shape: { content: string, status: 'pending'|'in_progress'|'completed', activeForm: string }
                    const text = typeof tt.content === 'string' ? tt.content : (typeof tt.text === 'string' ? tt.text : '')
                    const completed = tt.status === 'completed' || tt.completed === true
                    if (text) items.push({ text, completed })
                  }
                }
                this.listener({ type: 'TODOS', items, ts })
              }
            }
          }
        }
      }
    }

    // usage detection
    const usage = message.usage as Record<string, unknown> | undefined
    if (usage) {
      this.listener({
        type: 'USAGE',
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
        cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
        cacheCreationTokens: Number(usage.cache_creation_input_tokens) || 0,
        ts,
      })
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.fsw?.close()
    await this.fh?.close()
    this.fh = undefined
  }
}
