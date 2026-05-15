export type SessionStatus = 'busy' | 'idle' | 'waiting' | 'closed'

const KNOWN_STATUSES: ReadonlySet<string> = new Set(['busy', 'idle', 'waiting', 'closed'])

export function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && KNOWN_STATUSES.has(value)
}

export interface ToolCall {
  ts: number
  name: string
  durationMs?: number
  status: 'ok' | 'error'
}

export interface TodoItem {
  text: string
  completed: boolean
}

export interface McpServerInfo {
  name: string
  health: 'healthy' | 'degraded' | 'down'
  lastCallTs?: number
}

export interface SessionState {
  sessionId: string
  pid: number              // statusline subprocess pid (used as fallback)
  ppid: number             // its parent — usually Claude Code main process
  cwd: string
  model: string
  ctxPct: number           // 0–100
  cost: number             // USD
  cacheReadTokens?: number
  cacheCreationTokens?: number
  inputTokens?: number
  outputTokens?: number
  tools: ToolCall[]        // most-recent first, capped at 50
  todos: TodoItem[]
  mcpServers: McpServerInfo[]
  transcriptPath: string
  status: SessionStatus
  lastUpdate: number       // ms epoch
  startedAt: number
  branch?: string
  lastEditPath?: string
  lastEditTs?: number
}
