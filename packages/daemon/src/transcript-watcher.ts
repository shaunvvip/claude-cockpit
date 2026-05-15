import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

export type TranscriptEvent =
  | { type: 'TOOL_USE'; name: string; ts: number }
  | { type: 'USAGE'; inputTokens: number; outputTokens: number; cacheReadTokens: number; ts: number }
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
    const stat = await this.fh.stat()
    this.offset = stat.size
    this.fsw = watch(this.path, () => { void this.drain() })
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
