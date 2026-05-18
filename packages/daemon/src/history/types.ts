import type { AlertEvent } from '@claude-cockpit/shared'

export interface SessionRow {
  id: string
  cwd: string
  project_dir: string | null
  model: string
  branch: string | null
  started_at: number
  ended_at: number | null
  last_update: number
  total_cost: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  task_count: number
  transcript_path: string | null
}

export interface ToolCallRow {
  session_id: string
  ts: number
  tool_name: string
  status: 'ok' | 'error'
}

export interface EventRow {
  session_id: string
  ts: number
  event_type: string
  payload_json: string
}

export interface UsageSnapshotRow {
  ts: number
  five_hour_pct: number | null
  seven_day_pct: number | null
  five_hour_reset_at: number | null
  seven_day_reset_at: number | null
}

// Query result shapes (returned from HistoryStore.query* methods, also matched in /api/history/* responses)

export interface TrendsBucket {
  date: string                     // 'YYYY-MM-DD'
  cost: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  sessions: number
}

export interface TrendsResult {
  from: number
  to: number
  buckets: TrendsBucket[]
  totals: { cost: number; sessions: number; cacheHitRate: number }
}

export type TopMetric = 'cost' | 'tokens' | 'tools'
export type TopDimension = 'project' | 'tool' | 'session'

export interface TopItem {
  key: string
  cost?: number
  tokens?: number
  toolCalls?: number
  sessions?: number
}

export interface TopResult {
  items: TopItem[]
}

export interface ProjectsResult {
  projects: Array<{
    key: string                    // project_dir or cwd
    label: string                  // basename of key
    cost: number
    sessions: number
    totalTokens: number
    lastUpdate: number
  }>
}

export interface SparklineResult {
  buckets: Array<{ t: number; v: number }>
}

export interface UsageSnapshotsResult {
  snapshots: Array<{
    ts: number
    fiveHourPct: number | null
    sevenDayPct: number | null
  }>
}

// Re-export AlertEvent so events table writers can use it
export type { AlertEvent }
