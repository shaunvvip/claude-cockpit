import type { TranscriptEvent } from './transcript-watcher.js'

const DEFAULT_CAP = 200

export class EventBuffer {
  private readonly map = new Map<string, TranscriptEvent[]>()
  constructor(private readonly cap: number = DEFAULT_CAP) {}

  push(sessionId: string, event: TranscriptEvent): void {
    let arr = this.map.get(sessionId)
    if (!arr) {
      arr = []
      this.map.set(sessionId, arr)
    }
    arr.push(event)
    if (arr.length > this.cap) arr.shift()
  }

  get(sessionId: string): readonly TranscriptEvent[] {
    return this.map.get(sessionId) ?? []
  }

  /** 返回最近 windowMs ms 内的事件（用于规则上下文） */
  recent(sessionId: string, now: number, windowMs: number): readonly TranscriptEvent[] {
    const all = this.get(sessionId)
    const cutoff = now - windowMs
    let i = all.length - 1
    while (i >= 0 && all[i]!.ts >= cutoff) i--
    return all.slice(i + 1)
  }

  drop(sessionId: string): void {
    this.map.delete(sessionId)
  }
}
