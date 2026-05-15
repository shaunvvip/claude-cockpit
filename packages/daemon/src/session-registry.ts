import type { SessionState } from '@claude-cockpit/shared'

export class SessionRegistry {
  private readonly map = new Map<string, SessionState>()

  upsert(sessionId: string, patch: Partial<SessionState> & { lastUpdate: number }): SessionState {
    const existing = this.map.get(sessionId)
    if (existing) {
      const merged: SessionState = { ...existing, ...patch, sessionId }
      this.map.set(sessionId, merged)
      return merged
    }
    const created: SessionState = {
      sessionId,
      pid: patch.pid ?? 0,
      ppid: patch.ppid ?? 0,
      cwd: patch.cwd ?? '',
      model: patch.model ?? '',
      ctxPct: patch.ctxPct ?? 0,
      cost: patch.cost ?? 0,
      tools: patch.tools ?? [],
      todos: patch.todos ?? [],
      mcpServers: patch.mcpServers ?? [],
      transcriptPath: patch.transcriptPath ?? '',
      status: patch.status ?? 'busy',
      lastUpdate: patch.lastUpdate,
      startedAt: patch.startedAt ?? patch.lastUpdate,
      ...(patch.branch !== undefined && { branch: patch.branch }),
      ...(patch.lastEditPath !== undefined && { lastEditPath: patch.lastEditPath }),
      ...(patch.lastEditTs !== undefined && { lastEditTs: patch.lastEditTs }),
    }
    this.map.set(sessionId, created)
    return created
  }

  get(sessionId: string): SessionState | undefined {
    return this.map.get(sessionId)
  }

  list(): SessionState[] {
    return Array.from(this.map.values())
  }

  lastSessionUpdate(): number | undefined {
    let max: number | undefined
    for (const s of this.map.values()) {
      if (max === undefined || s.lastUpdate > max) max = s.lastUpdate
    }
    return max
  }

  markIdle(opts: { now: number; idleMs: number }): void {
    for (const s of this.map.values()) {
      if (s.status !== 'busy') continue
      if (opts.now - s.lastUpdate > opts.idleMs) {
        s.status = 'idle'
      }
    }
  }
}
