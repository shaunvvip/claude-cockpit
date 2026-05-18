import Database from 'better-sqlite3'
import type { SessionState, AlertEvent } from '@claude-cockpit/shared'
import { ensureSchema } from './schema.js'
import type { SessionRow, ToolCallRow, EventRow, UsageSnapshotRow } from './types.js'

export class HistoryStore {
  readonly db: Database.Database

  // queues drained on flush
  private readonly sessionsQueue = new Map<string, SessionRow>()
  private readonly toolCallsQueue: ToolCallRow[] = []
  private readonly eventsQueue: EventRow[] = []
  private readonly usageQueue: UsageSnapshotRow[] = []

  // dedup state for usage snapshots — only enqueue when values change
  private lastUsage: { five_hour_pct: number | null; seven_day_pct: number | null; five_hour_reset_at: number | null; seven_day_reset_at: number | null } | null = null

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    ensureSchema(this.db)
  }

  recordSession(s: SessionState): void {
    const row: SessionRow = {
      id: s.sessionId,
      cwd: s.cwd,
      project_dir: null,   // wire-up in Task 6 (statusline payload extension)
      model: s.model,
      branch: s.branch ?? null,
      started_at: s.startedAt,
      ended_at: s.status === 'closed' ? s.lastUpdate : null,
      last_update: s.lastUpdate,
      total_cost: s.cost,
      input_tokens: s.inputTokens ?? 0,
      output_tokens: s.outputTokens ?? 0,
      cache_read_tokens: s.cacheReadTokens ?? 0,
      cache_creation_tokens: s.cacheCreationTokens ?? 0,
      task_count: s.taskCount ?? 0,
      transcript_path: s.transcriptPath || null,
    }
    this.sessionsQueue.set(row.id, row)
  }

  recordToolCall(sessionId: string, ts: number, toolName: string): void {
    this.toolCallsQueue.push({ session_id: sessionId, ts, tool_name: toolName, status: 'ok' })
  }

  recordAlert(alert: AlertEvent): void {
    this.eventsQueue.push({
      session_id: alert.sessionId,
      ts: alert.ts,
      event_type: 'alert',
      payload_json: JSON.stringify({ ruleId: alert.ruleId, title: alert.title, body: alert.body }),
    })
  }

  recordUsage(s: SessionState, now: number): void {
    const fivePct = s.usage5hPct ?? null
    const sevenPct = s.usage7dPct ?? null
    const fiveReset = s.usage5hResetAt ?? null
    const sevenReset = s.usage7dResetAt ?? null
    if (fivePct === null && sevenPct === null) return    // nothing to record
    if (
      this.lastUsage &&
      this.lastUsage.five_hour_pct === fivePct &&
      this.lastUsage.seven_day_pct === sevenPct &&
      this.lastUsage.five_hour_reset_at === fiveReset &&
      this.lastUsage.seven_day_reset_at === sevenReset
    ) return                                              // dedup: no change → skip
    this.lastUsage = { five_hour_pct: fivePct, seven_day_pct: sevenPct, five_hour_reset_at: fiveReset, seven_day_reset_at: sevenReset }
    this.usageQueue.push({
      ts: now,
      five_hour_pct: fivePct,
      seven_day_pct: sevenPct,
      five_hour_reset_at: fiveReset,
      seven_day_reset_at: sevenReset,
    })
  }

  flush(): void {
    if (this.sessionsQueue.size === 0 && this.toolCallsQueue.length === 0 && this.eventsQueue.length === 0 && this.usageQueue.length === 0) {
      return                          // nothing to do
    }
    const sessions = Array.from(this.sessionsQueue.values())
    const tools = this.toolCallsQueue.splice(0)
    const events = this.eventsQueue.splice(0)
    const usage = this.usageQueue.splice(0)
    this.sessionsQueue.clear()

    const insertSession = this.db.prepare(`
      INSERT OR REPLACE INTO sessions
      (id, cwd, project_dir, model, branch, started_at, ended_at, last_update,
       total_cost, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
       task_count, transcript_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertTool = this.db.prepare(`
      INSERT OR IGNORE INTO tool_calls (session_id, ts, tool_name, status)
      VALUES (?, ?, ?, ?)
    `)
    const insertEvent = this.db.prepare(`
      INSERT INTO events (session_id, ts, event_type, payload_json) VALUES (?, ?, ?, ?)
    `)
    const insertUsage = this.db.prepare(`
      INSERT OR IGNORE INTO usage_snapshots (ts, five_hour_pct, seven_day_pct, five_hour_reset_at, seven_day_reset_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    this.db.transaction(() => {
      for (const r of sessions) insertSession.run(
        r.id, r.cwd, r.project_dir, r.model, r.branch, r.started_at, r.ended_at, r.last_update,
        r.total_cost, r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens,
        r.task_count, r.transcript_path,
      )
      for (const r of tools)  insertTool.run(r.session_id, r.ts, r.tool_name, r.status)
      for (const r of events) insertEvent.run(r.session_id, r.ts, r.event_type, r.payload_json)
      for (const r of usage)  insertUsage.run(r.ts, r.five_hour_pct, r.seven_day_pct, r.five_hour_reset_at, r.seven_day_reset_at)
    })()
  }

  clearAll(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM sessions').run()
      this.db.prepare('DELETE FROM tool_calls').run()
      this.db.prepare('DELETE FROM events').run()
      this.db.prepare('DELETE FROM usage_snapshots').run()
    })()
    this.sessionsQueue.clear()
    this.toolCallsQueue.length = 0
    this.eventsQueue.length = 0
    this.usageQueue.length = 0
    this.lastUsage = null
  }

  close(): void {
    this.flush()
    this.db.close()
  }
}
