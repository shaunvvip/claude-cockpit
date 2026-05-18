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
      project_dir: s.projectDir ?? null,
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

  queryTrends(opts: { from: number; to: number }): import('./types.js').TrendsResult {
    const rows = this.db.prepare(`
      SELECT
        date(started_at/1000, 'unixepoch', 'localtime') as date,
        SUM(total_cost)            as cost,
        SUM(input_tokens)          as inputTokens,
        SUM(output_tokens)         as outputTokens,
        SUM(cache_read_tokens)     as cacheReadTokens,
        SUM(cache_creation_tokens) as cacheCreationTokens,
        COUNT(*)                   as sessions
      FROM sessions
      WHERE started_at >= ? AND started_at < ?
      GROUP BY 1
      ORDER BY 1 ASC
    `).all(opts.from, opts.to) as any[]

    const totals = this.db.prepare(`
      SELECT
        SUM(total_cost)             as cost,
        COUNT(*)                    as sessions,
        SUM(cache_read_tokens)      as cacheReads,
        SUM(input_tokens + cache_read_tokens + cache_creation_tokens) as totalIn
      FROM sessions
      WHERE started_at >= ? AND started_at < ?
    `).get(opts.from, opts.to) as any

    const hitRate = totals.totalIn > 0 ? totals.cacheReads / totals.totalIn : 0
    return {
      from: opts.from,
      to: opts.to,
      buckets: rows.map(r => ({
        date: r.date,
        cost: r.cost || 0,
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0,
        cacheReadTokens: r.cacheReadTokens || 0,
        cacheCreationTokens: r.cacheCreationTokens || 0,
        sessions: r.sessions || 0,
      })),
      totals: { cost: totals.cost || 0, sessions: totals.sessions || 0, cacheHitRate: hitRate },
    }
  }

  queryProjects(opts: { days: number }): import('./types.js').ProjectsResult {
    const from = Date.now() - opts.days * 86400_000
    const rows = this.db.prepare(`
      SELECT
        COALESCE(project_dir, cwd) as key,
        SUM(total_cost)            as cost,
        COUNT(*)                   as sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) as totalTokens,
        MAX(last_update)           as lastUpdate
      FROM sessions
      WHERE started_at >= ?
      GROUP BY 1
      ORDER BY cost DESC
    `).all(from) as any[]
    return {
      projects: rows.map(r => ({
        key: r.key,
        label: String(r.key).split('/').filter(Boolean).slice(-1)[0] ?? r.key,
        cost: r.cost || 0,
        sessions: r.sessions || 0,
        totalTokens: r.totalTokens || 0,
        lastUpdate: r.lastUpdate || 0,
      })),
    }
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
