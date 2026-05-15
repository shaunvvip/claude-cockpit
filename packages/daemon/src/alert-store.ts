import type { AlertEvent } from '@claude-cockpit/shared'

const CAP = 50

export class AlertStore {
  private readonly arr: AlertEvent[] = []
  push(a: AlertEvent): void {
    this.arr.push(a)
    if (this.arr.length > CAP) this.arr.shift()
  }
  list(): readonly AlertEvent[] { return this.arr }
  bySession(sid: string): AlertEvent[] {
    return this.arr.filter((a) => a.sessionId === sid)
  }
}
