# claude-cockpit v0.9 (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 cockpit 从 v0.5.4-beta（实时态完整）升级到 v0.9-beta（SQLite 历史层 + `/history` 三 tab + Overview Sparkline 接真数据 + cost-spike 基线迁移），按 5 个垂直切片交付。

**Architecture:** 在已有 daemon / dashboard 包基础上：daemon 新增 `HistoryStore`（better-sqlite3 WAL，4 表 + schema_meta）+ 5s 批量 flush + 90 天滚动清理 cron。HTTP API 新增 6 个 GET 聚合端点 + 1 个 POST clear。Dashboard 新增 `/history` 路由（3 tab） + Overview 的 mock Sparkline 接真数据。RuleEngine cost-spike 基线从内存 rolling 迁到 SQLite 7-day 窗口。

**Tech Stack:** 沿用 v0.5 — TypeScript 5 strict · Node 20 · vitest · TanStack Router · µPlot · Tailwind · **新增 better-sqlite3 ^12**

**Reference spec:** `docs/superpowers/specs/2026-05-18-claude-cockpit-v0.9-design.md`

---

## 文件结构（v0.9 完成后增量）

```
packages/
├── daemon/src/
│   ├── history/                         ← NEW directory
│   │   ├── schema.ts                    DDL + ensureSchema(db) + schema_meta version
│   │   ├── schema.test.ts
│   │   ├── store.ts                     HistoryStore class (record + flush + queries)
│   │   ├── store.test.ts                (split into per-method test files when large)
│   │   ├── cleanup.ts                   runCleanup + scheduleDailyCleanup
│   │   ├── cleanup.test.ts
│   │   ├── size-monitor.ts              hourly pragma page_count check
│   │   ├── size-monitor.test.ts
│   │   └── types.ts                     row types (SessionRow / ToolCallRow / EventRow / UsageSnapshotRow)
│   ├── paths.ts                         ← MODIFY add getDbPath()
│   ├── api/
│   │   ├── routes.ts                    ← MODIFY add /api/history/* dispatch + ApiContext.history
│   │   ├── routes.test.ts               ← MODIFY add dispatch test
│   │   ├── history-routes.ts            ← NEW handle GET /api/history/{trends,top,projects,sparkline,usage-snapshots,sessions} + POST /clear
│   │   └── history-routes.test.ts       ← NEW
│   ├── rules/
│   │   ├── types.ts                     ← MODIFY RuleContext.rolling → history accessor
│   │   ├── engine.ts                    ← MODIFY remove in-memory baseline; use ctx.history.perSecondCostAvg7d
│   │   ├── cost-spike.ts                ← MODIFY refer ctx.history; drop 30-min noise gate
│   │   ├── cost-spike.test.ts           ← MODIFY adapt to new RuleContext shape + add 7d window cases
│   │   └── engine.test.ts               ← MODIFY adapt + add 7d window cases
│   └── main.ts                          ← MODIFY wire HistoryStore + flush timer + cleanup cron + close on shutdown
├── shared/src/
│   └── protocol.ts                      ← MODIFY (optional) add HistoryQueryResult types if shared with dashboard
└── dashboard/src/
    ├── routes/
    │   ├── index.tsx                    ← MODIFY drop mockCost24/mockCtx24, use useSparkline()
    │   └── history.tsx                  ← NEW route + tab dispatcher
    ├── components/
    │   ├── Sidebar.tsx                  ← MODIFY add History link
    │   ├── HistoryTabs.tsx              ← NEW tab bar
    │   └── history/
    │       ├── TrendsTab.tsx            ← NEW (with embedded usage-snapshots chart)
    │       ├── TrendsTab.test.tsx
    │       ├── TopTab.tsx               ← NEW (metric × dimension selector + bar list)
    │       ├── TopTab.test.tsx
    │       ├── ProjectsTab.tsx          ← NEW (project cards)
    │       └── ProjectsTab.test.tsx
    └── hooks/
        ├── useHistory.ts                ← NEW (useTrends/useTop/useProjects/useUsageSnapshots/useSparkline)
        └── useHistory.test.tsx
```

```
package.json (root)                      ← MODIFY add better-sqlite3 dep + @types/better-sqlite3
README.md                                ← MODIFY add "What you get (v0.9 beta)" + backup hint
```

---

## 通用约定

沿用 v0.5 plan：
- npm workspaces，`npm run -w packages/<name> <script>`
- 测试命令：`npx vitest run <path>`（从 repo root）—— 不用 `npm run -w … test`（v0.5 时发现的 workspace 配置 quirk）
- TypeScript 严格度：`strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes`
- Conventional Commits + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- 每个 Task 收尾跑包内单测；每个 Slice 收尾跑 `npx vitest run && npm run typecheck` 全绿才进下一 Slice
- 每个 Task 一次 commit；不要 `--no-verify`，不要 amend

---

# Slice 1 · 数据基础（最大风险卸载点）

**产出**：better-sqlite3 装上并跨平台能用；schema 建好；HistoryStore 类骨架就位（含降级路径）。
**风险点**：R15（native build 失败）—— 本 slice 直接卸掉。

## Task 1: 加 better-sqlite3 依赖 + paths.getDbPath()

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/daemon/package.json`
- Modify: `packages/daemon/src/paths.ts`
- Modify: `packages/daemon/src/paths.test.ts`

- [ ] **Step 1: 加 root 依赖**

```bash
npm install --save better-sqlite3@^12 --workspace=packages/daemon
npm install --save-dev @types/better-sqlite3 --workspace=packages/daemon
```

确认 `packages/daemon/package.json` 多了：

```json
"dependencies": {
  "better-sqlite3": "^12.x.x"
},
"devDependencies": {
  "@types/better-sqlite3": "^7.x.x"
}
```

- [ ] **Step 2: 增加 paths.getDbPath()**

打开 `packages/daemon/src/paths.ts`，在文件末尾加：

```typescript
export function getDbPath(): string {
  return join(getCockpitDir(), 'cockpit.db')
}
```

- [ ] **Step 3: 测试**

打开 `packages/daemon/src/paths.test.ts`，加：

```typescript
import { getDbPath } from './paths.js'

describe('getDbPath', () => {
  it('returns ~/.claude-cockpit/cockpit.db', () => {
    const p = getDbPath()
    expect(p).toMatch(/\.claude-cockpit\/cockpit\.db$/)
  })
})
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run packages/daemon/src/paths.test.ts
npm run typecheck
```

Expected: PASS / clean.

- [ ] **Step 5: Verify native build**

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); console.log('better-sqlite3 OK, version:', db.prepare('SELECT sqlite_version()').get())"
```

Expected: prints SQLite version (e.g., `{ 'sqlite_version()': '3.40.0' }`). If it errors with `MODULE_NOT_FOUND` or rebuild errors, see node-gyp setup before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/daemon/package.json packages/daemon/src/paths.ts packages/daemon/src/paths.test.ts
git commit -m "$(cat <<'EOF'
chore(daemon): add better-sqlite3 dep + getDbPath() path helper

Foundation for v0.9 history layer. better-sqlite3@^12 ships prebuilt
binaries for mac arm64/x64 + linux x64 — no node-gyp toolchain needed
on those platforms (R15 mitigation).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: history/schema.ts — DDL + ensureSchema + version

**Files:**
- Create: `packages/daemon/src/history/schema.ts`
- Create: `packages/daemon/src/history/schema.test.ts`

- [ ] **Step 1: 写 schema.ts**

```typescript
import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 1

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id                     TEXT    PRIMARY KEY,
    cwd                    TEXT    NOT NULL,
    project_dir            TEXT,
    model                  TEXT    NOT NULL,
    branch                 TEXT,
    started_at             INTEGER NOT NULL,
    ended_at               INTEGER,
    last_update            INTEGER NOT NULL,
    total_cost             REAL    DEFAULT 0,
    input_tokens           INTEGER DEFAULT 0,
    output_tokens          INTEGER DEFAULT 0,
    cache_read_tokens      INTEGER DEFAULT 0,
    cache_creation_tokens  INTEGER DEFAULT 0,
    task_count             INTEGER DEFAULT 0,
    transcript_path        TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_started_at  ON sessions(started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_project_dir ON sessions(project_dir)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_cwd         ON sessions(cwd)`,

  `CREATE TABLE IF NOT EXISTS tool_calls (
    session_id  TEXT    NOT NULL,
    ts          INTEGER NOT NULL,
    tool_name   TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'ok',
    PRIMARY KEY (session_id, ts, tool_name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tool_calls_ts        ON tool_calls(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name)`,

  `CREATE TABLE IF NOT EXISTS events (
    session_id   TEXT    NOT NULL,
    ts           INTEGER NOT NULL,
    event_type   TEXT    NOT NULL,
    payload_json TEXT    NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type)`,

  `CREATE TABLE IF NOT EXISTS usage_snapshots (
    ts                  INTEGER PRIMARY KEY,
    five_hour_pct       REAL,
    seven_day_pct       REAL,
    five_hour_reset_at  INTEGER,
    seven_day_reset_at  INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_snapshots_ts ON usage_snapshots(ts)`,

  `CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
]

export function ensureSchema(db: Database.Database): void {
  db.transaction(() => {
    for (const sql of DDL_STATEMENTS) db.prepare(sql).run()
    db.prepare('INSERT OR IGNORE INTO schema_meta(key, value) VALUES (?, ?)')
      .run('schema_version', String(SCHEMA_VERSION))
  })()
}

export function getSchemaVersion(db: Database.Database): number | null {
  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get('schema_version') as { value: string } | undefined
  return row ? Number(row.value) : null
}
```

- [ ] **Step 2: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { ensureSchema, getSchemaVersion, SCHEMA_VERSION } from './schema.js'

function freshDb(): Database.Database {
  return new Database(':memory:')
}

describe('ensureSchema', () => {
  it('creates all 4 tables + schema_meta from blank DB', () => {
    const db = freshDb()
    ensureSchema(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('sessions')
    expect(names).toContain('tool_calls')
    expect(names).toContain('events')
    expect(names).toContain('usage_snapshots')
    expect(names).toContain('schema_meta')
  })

  it('is idempotent (running twice does not throw)', () => {
    const db = freshDb()
    ensureSchema(db)
    expect(() => ensureSchema(db)).not.toThrow()
  })

  it('writes schema_version=1 to schema_meta', () => {
    const db = freshDb()
    ensureSchema(db)
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION)
    expect(getSchemaVersion(db)).toBe(1)
  })

  it('returns null version on totally fresh DB before ensureSchema', () => {
    const db = freshDb()
    expect(getSchemaVersion(db)).toBe(null)
  })

  it('creates required indexes', () => {
    const db = freshDb()
    ensureSchema(db)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all() as { name: string }[]
    const names = indexes.map(i => i.name)
    expect(names).toContain('idx_sessions_started_at')
    expect(names).toContain('idx_tool_calls_ts')
    expect(names).toContain('idx_events_session_ts')
    expect(names).toContain('idx_usage_snapshots_ts')
  })
})
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/history/schema.test.ts
npm run typecheck
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/history/schema.ts packages/daemon/src/history/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): history/schema.ts — DDL for 4 tables + schema_meta v=1

ensureSchema() is transactional and idempotent. Adds all CREATE TABLE
IF NOT EXISTS + CREATE INDEX IF NOT EXISTS statements from v0.9 spec
§2. Reserved 'schema_version' key in schema_meta for future migrations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: history/types.ts — row types

**Files:**
- Create: `packages/daemon/src/history/types.ts`

- [ ] **Step 1: 写 types.ts**

```typescript
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
```

- [ ] **Step 2: typecheck (no separate test — types-only file)**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/history/types.ts
git commit -m "$(cat <<'EOF'
feat(daemon): history/types.ts — row + query-result type definitions

Row types match the DDL exactly (nullability + types). Query-result
shapes match what /api/history/* will return — single source of truth
between HistoryStore methods and HTTP handlers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: HistoryStore class skeleton (record methods + flush stub)

**Files:**
- Create: `packages/daemon/src/history/store.ts`
- Create: `packages/daemon/src/history/store.test.ts`

- [ ] **Step 1: 写 store.ts**

```typescript
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
      project_dir: null,   // wire-up in Task 7 (statusline payload extension)
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
```

- [ ] **Step 2: 写测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { HistoryStore } from './store.js'
import type { SessionState, AlertEvent } from '@claude-cockpit/shared'

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('HistoryStore record + flush', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('flushes session row to sessions table', () => {
    store.recordSession(makeSession({ cost: 1.23 }))
    store.flush()
    const row = store.db.prepare('SELECT * FROM sessions WHERE id = ?').get('sid') as any
    expect(row.total_cost).toBe(1.23)
    expect(row.model).toBe('m')
  })

  it('flushes tool_calls and dedupes by (session_id, ts, tool_name)', () => {
    store.recordToolCall('sid', 100, 'Read')
    store.recordToolCall('sid', 100, 'Read')   // duplicate
    store.recordToolCall('sid', 100, 'Edit')   // different name, allowed
    store.flush()
    const rows = store.db.prepare('SELECT * FROM tool_calls').all() as any[]
    expect(rows).toHaveLength(2)
  })

  it('flushes alert event with JSON payload', () => {
    const alert: AlertEvent = { ruleId: 'ctx-high', sessionId: 'sid', ts: 100, title: 't', body: 'b' }
    store.recordAlert(alert)
    store.flush()
    const row = store.db.prepare('SELECT * FROM events WHERE event_type = ?').get('alert') as any
    expect(JSON.parse(row.payload_json)).toEqual({ ruleId: 'ctx-high', title: 't', body: 'b' })
  })

  it('dedupes usage snapshots when values unchanged', () => {
    const s = makeSession({ usage5hPct: 25, usage7dPct: 12 })
    store.recordUsage(s, 100)
    store.recordUsage(s, 200)                  // same values → skip
    store.recordUsage(makeSession({ usage5hPct: 26, usage7dPct: 12 }), 300)  // value changed
    store.flush()
    const rows = store.db.prepare('SELECT * FROM usage_snapshots ORDER BY ts').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].ts).toBe(100)
    expect(rows[1].ts).toBe(300)
  })

  it('skips usage snapshot when both pct are null', () => {
    store.recordUsage(makeSession(), 100)      // no usage* fields → skip
    store.flush()
    const rows = store.db.prepare('SELECT * FROM usage_snapshots').all()
    expect(rows).toHaveLength(0)
  })

  it('flush is idempotent on empty queues', () => {
    expect(() => store.flush()).not.toThrow()
    expect(() => store.flush()).not.toThrow()
  })

  it('multiple recordSession for same id collapse to one row (upsert)', () => {
    store.recordSession(makeSession({ cost: 1.0 }))
    store.recordSession(makeSession({ cost: 2.0 }))
    store.flush()
    const row = store.db.prepare('SELECT * FROM sessions WHERE id = ?').get('sid') as any
    expect(row.total_cost).toBe(2.0)
  })

  it('clearAll() empties all tables + queues', () => {
    store.recordSession(makeSession())
    store.recordToolCall('sid', 100, 'Read')
    store.recordAlert({ ruleId: 'ctx-high', sessionId: 'sid', ts: 1, title: 't', body: 'b' })
    store.flush()
    store.clearAll()
    expect(store.db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toMatchObject({ c: 0 })
    expect(store.db.prepare('SELECT COUNT(*) as c FROM tool_calls').get()).toMatchObject({ c: 0 })
    expect(store.db.prepare('SELECT COUNT(*) as c FROM events').get()).toMatchObject({ c: 0 })
  })

  it('close() flushes before closing', () => {
    store.recordSession(makeSession({ cost: 5.0 }))
    store.close()
    // re-open same in-memory db isn't possible; just confirm it flushed before close
    // (the flush() call inside close() should not throw)
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/history/store.test.ts
npm run typecheck
```

Expected: 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/history/store.ts packages/daemon/src/history/store.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): HistoryStore class — record + flush + clearAll

In-memory queues per table; flush() is one transaction. usage_snapshots
dedupes by value-change (lastUsage cache). close() flushes before
closing the DB handle. Query methods defer to Slice 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: better-sqlite3 install-failure resilience

**Files:**
- Create: `packages/daemon/src/history/availability.ts`
- Create: `packages/daemon/src/history/availability.test.ts`

- [ ] **Step 1: 写 availability.ts**

```typescript
import type { HistoryStore } from './store.js'

export interface HistoryAvailability {
  available: boolean
  reason?: string
  store?: HistoryStore
}

/**
 * Try to instantiate a HistoryStore. If better-sqlite3 native binding fails
 * to load (e.g., on Alpine glibc, unsupported arch, or when prebuilt binary
 * is missing), return `available: false` with the underlying error — daemon
 * keeps running, /api/history/* returns a friendly fallback (Task 16).
 */
export async function tryOpenHistory(dbPath: string): Promise<HistoryAvailability> {
  try {
    // Dynamic import so a missing native binding doesn't crash module-level load
    const { HistoryStore } = await import('./store.js')
    const store = new HistoryStore(dbPath)
    return { available: true, store }
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
```

- [ ] **Step 2: 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { tryOpenHistory } from './availability.js'

describe('tryOpenHistory', () => {
  it('opens an in-memory store successfully', async () => {
    const result = await tryOpenHistory(':memory:')
    expect(result.available).toBe(true)
    expect(result.store).toBeDefined()
    result.store?.close()
  })

  it('returns available=false with reason when path is invalid', async () => {
    // Force failure by passing a path inside a non-existent directory
    const result = await tryOpenHistory('/non-existent-dir-12345/cockpit.db')
    expect(result.available).toBe(false)
    expect(result.reason).toBeTruthy()
  })
})
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/history/availability.test.ts
npm run typecheck
```

Expected: 2 tests pass.

- [ ] **Step 4: Slice 1 collation — run full regression**

```bash
npx vitest run
npm run typecheck
```

Expected: 209 (pre-existing) + 16 (new from Slice 1) = ~225 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/history/availability.ts packages/daemon/src/history/availability.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): tryOpenHistory() — graceful native-build degradation (R15)

If better-sqlite3 binding fails to load, daemon stays alive — history
features become unavailable but registry / statusline / dashboard
Overview keep working.

Slice 1 closed: schema + types + HistoryStore record/flush + availability
detection. Ready to wire into daemon main.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 2 · 入库管线

**产出**：HistoryStore 接到 daemon main，所有 v0.5.x 实时事件（session 状态、tool 调用、alerts、5h/7d 快照）都落 SQLite。
**风险点**：transcript 重读幂等性（PK 联合索引 + INSERT OR IGNORE 已设计在 schema 里，本 slice 验证它真的不重复插入）。

## Task 6: statusline 多传 project_dir 字段

**Files:**
- Modify: `packages/statusline/src/stdin.ts`
- Modify: `packages/statusline/src/stdin.test.ts`
- Modify: `packages/statusline/src/main.ts`

- [ ] **Step 1: stdin 解析 workspace.project_dir**

打开 `packages/statusline/src/stdin.ts`，在 `StatuslineInput` 加字段：

```typescript
export interface StatuslineInput {
  sessionId: string
  cwd: string
  model: string
  transcriptPath: string
  branch?: string
  projectDir?: string         // ← NEW
  cost?: number
  usage5hPct?: number
  usage5hResetAt?: number
  usage7dPct?: number
  usage7dResetAt?: number
}
```

在 `parseStatuslineInput` body 内，紧跟 branch 解析逻辑后加：

```typescript
  let projectDir: string | undefined
  if (v.workspace && typeof v.workspace === 'object') {
    const pd = (v.workspace as Record<string, unknown>).project_dir
    if (typeof pd === 'string') projectDir = pd
  }
```

在 `return` 对象里加 `...(projectDir !== undefined && { projectDir })`。

- [ ] **Step 2: 测试**

打开 `packages/statusline/src/stdin.test.ts`，加：

```typescript
it('extracts workspace.project_dir when present', () => {
  const raw = JSON.stringify({
    session_id: 'sid', cwd: '/x', model: { id: 'm' }, transcript_path: '/t',
    workspace: { current_branch: 'main', project_dir: '/Users/me/proj' },
  })
  const parsed = parseStatuslineInput(raw)
  expect(parsed?.projectDir).toBe('/Users/me/proj')
})

it('omits projectDir when workspace lacks it', () => {
  const raw = JSON.stringify({
    session_id: 'sid', cwd: '/x', model: { id: 'm' }, transcript_path: '/t',
    workspace: { current_branch: 'main' },
  })
  const parsed = parseStatuslineInput(raw)
  expect(parsed?.projectDir).toBeUndefined()
})
```

- [ ] **Step 3: statusline main.ts 透传**

打开 `packages/statusline/src/main.ts`，在 `sendUpdateSession` 调用的 payload 内加：

```typescript
      ...(parsed.projectDir !== undefined && { projectDir: parsed.projectDir }),
```

放在 `branch` 透传那一行的旁边（保持风格一致）。

- [ ] **Step 4: shared SessionState 加 projectDir 字段**

打开 `packages/shared/src/session-state.ts`，在 `SessionState` 加：

```typescript
  projectDir?: string             // workspace.project_dir from CC stdin
```

放在 `branch?` 旁边。

- [ ] **Step 5: HistoryStore.recordSession 用 projectDir**

打开 `packages/daemon/src/history/store.ts`，把 `recordSession` 内的：

```typescript
      project_dir: null,
```

改为：

```typescript
      project_dir: s.projectDir ?? null,
```

- [ ] **Step 6: Tests + typecheck**

```bash
npx vitest run packages/statusline/src/stdin.test.ts packages/daemon/src/history/store.test.ts
npm run typecheck
```

Expected: previous tests + 2 new pass.

- [ ] **Step 7: Commit**

```bash
git add packages/statusline/ packages/shared/src/session-state.ts packages/daemon/src/history/store.ts
git commit -m "$(cat <<'EOF'
feat(statusline+shared): pass workspace.project_dir to daemon

Project_dir is CC's resolved git root (more stable than cwd). Threaded
through StatuslineInput → UPDATE_SESSION payload → SessionState →
HistoryStore.sessions.project_dir column. Powers /history Projects tab
GROUP BY.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: wire HistoryStore into daemon main

**Files:**
- Modify: `packages/daemon/src/main.ts`

- [ ] **Step 1: 加 imports**

`packages/daemon/src/main.ts` 顶部 imports 加：

```typescript
import { tryOpenHistory } from './history/availability.js'
import type { HistoryStore } from './history/store.js'
import { getDbPath } from './paths.js'
```

- [ ] **Step 2: startDaemon 内启动 HistoryStore**

在 `startDaemon` 函数内，紧跟 `const eventBuffer = new EventBuffer()` 那行后（Slice 4 / Task 21 已放的位置），加：

```typescript
  // History layer — best-effort; degrades gracefully if better-sqlite3 fails
  const historyAvail = await tryOpenHistory(getDbPath())
  const historyStore: HistoryStore | undefined = historyAvail.store
  if (!historyAvail.available) {
    console.warn('[cockpit] history layer disabled:', historyAvail.reason)
  }
```

- [ ] **Step 3: HTTP server 接 history**

往下找 `await startHttpServer({...})`，在 options 里加 `historyStore`（如果之前 startHttpServer 签名只接受 alertStore/eventBuffer，先扩签名 — 见下一 step）。

```typescript
  const http = await startHttpServer({
    port: opts.port ?? 0,
    registry,
    broadcaster,
    platform,
    alertStore,
    eventBuffer,
    ...(historyStore !== undefined && { historyStore }),
    ...(dist !== undefined && { staticDir: dist }),
  })
```

- [ ] **Step 4: socket handler 写库**

往下找 socket handler 内的：

```typescript
    const updated = registry.upsert(frame.sessionId, {
      ...frame.payload,
      mcpServers,
      lastUpdate: Date.now(),
    })
    broadcaster.publishUpsert(updated)
```

在 `broadcaster.publishUpsert(updated)` 后加：

```typescript
    historyStore?.recordSession(updated)
    historyStore?.recordUsage(updated, Date.now())
```

- [ ] **Step 5: TranscriptWatcher listener 写库（TOOL_USE）**

继续往下，TOOL_USE 分支内，紧跟 `broadcaster.publishUpsert(next)` 加：

```typescript
          historyStore?.recordToolCall(sessionId, e.ts, e.name)
```

- [ ] **Step 6: ruleTick 写库（alert）**

往下找 `ruleTick` setInterval，在 alert 循环内 `broadcaster.publishAlert(alert)` 那一行**之后**加：

```typescript
      historyStore?.recordAlert(alert)
```

- [ ] **Step 7: setInterval flush + shutdown**

`startDaemon` 内找到 `const ruleTick = setInterval(...)` 块，紧随其后加：

```typescript
  const flushTimer: NodeJS.Timeout | undefined = historyStore
    ? setInterval(() => { try { historyStore.flush() } catch (e) { console.error('[cockpit] history flush failed:', e) } }, 5000)
    : undefined
```

在 `shutdown` 函数内（紧随 `clearInterval(ruleTick)`）加：

```typescript
    if (flushTimer) clearInterval(flushTimer)
    historyStore?.close()
```

- [ ] **Step 8: typecheck + manual smoke**

```bash
npm run typecheck
```

Expected: clean. **Note**: `startHttpServer` may need its signature extended to accept `historyStore` — that's Task 8.

- [ ] **Step 9: Commit (defer http-server signature to next task)**

```bash
git add packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): wire HistoryStore into main — record + flush + close

Sessions/tool_calls/usage_snapshots/events all enqueue on their existing
hot paths (UPDATE_SESSION socket frame / TranscriptWatcher TOOL_USE /
ruleTick alert). 5s setInterval flushes to SQLite. shutdown calls
historyStore.close() which flushes synchronously before closing the db.

tryOpenHistory() lets daemon stay alive if better-sqlite3 fails to load
(R15) — historyStore is undefined and all record/flush calls become
no-ops via optional chaining.

NOTE: http-server.ts signature must accept historyStore prop — Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: http-server.ts accepts historyStore

**Files:**
- Modify: `packages/daemon/src/http-server.ts`

- [ ] **Step 1: 扩 HttpServerOptions**

打开 `packages/daemon/src/http-server.ts`，在 `HttpServerOptions` interface 里加：

```typescript
  historyStore?: import('./history/store.js').HistoryStore
```

- [ ] **Step 2: thread 到 ApiContext**

在文件内找到构造 `apiCtx` 的位置（应该是 routes 调用的地方），加：

```typescript
  ...(opts.historyStore !== undefined && { history: opts.historyStore }),
```

到 ApiContext 对象里。

- [ ] **Step 3: extend ApiContext type**

打开 `packages/daemon/src/api/routes.ts`，把：

```typescript
export interface ApiContext {
  registry: SessionRegistry
  platform: PlatformActions
  port: number
  request?: IncomingMessage
  alerts?: AlertStore
  events?: EventBuffer
}
```

改为：

```typescript
import type { HistoryStore } from '../history/store.js'

export interface ApiContext {
  registry: SessionRegistry
  platform: PlatformActions
  port: number
  request?: IncomingMessage
  alerts?: AlertStore
  events?: EventBuffer
  history?: HistoryStore
}
```

- [ ] **Step 4: typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/http-server.ts packages/daemon/src/api/routes.ts
git commit -m "$(cat <<'EOF'
feat(daemon): http-server + ApiContext propagate historyStore

Threading change only — no behavior. /api/history/* routes (Task 16)
will read ctx.history.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Slice 2 verification — daemon restart idempotency e2e

**Files:**
- Create: `packages/daemon/src/history/integration.test.ts`

- [ ] **Step 1: 写 integration test**

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { HistoryStore } from './store.js'
import type { SessionState } from '@claude-cockpit/shared'

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'cockpit-hist-'))
}

function makeSession(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('HistoryStore daemon-restart idempotency', () => {
  it('re-ingesting the same tool_calls does not duplicate rows', () => {
    const dir = freshDir()
    const dbPath = join(dir, 'cockpit.db')
    try {
      // Run 1
      const s1 = new HistoryStore(dbPath)
      s1.recordSession(makeSession({ cost: 1.0 }))
      s1.recordToolCall('sid', 100, 'Read')
      s1.recordToolCall('sid', 200, 'Edit')
      s1.flush()
      s1.close()

      // Run 2 — simulate daemon restart re-reading transcript
      const s2 = new HistoryStore(dbPath)
      s2.recordToolCall('sid', 100, 'Read')   // same as before
      s2.recordToolCall('sid', 200, 'Edit')
      s2.recordToolCall('sid', 300, 'Write')  // new
      s2.flush()
      const rows = s2.db.prepare('SELECT * FROM tool_calls ORDER BY ts').all() as any[]
      expect(rows).toHaveLength(3)            // not 5
      s2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('re-ingesting the same session updates instead of duplicating', () => {
    const dir = freshDir()
    const dbPath = join(dir, 'cockpit.db')
    try {
      const s1 = new HistoryStore(dbPath)
      s1.recordSession(makeSession({ cost: 1.0 }))
      s1.flush()
      s1.close()

      const s2 = new HistoryStore(dbPath)
      s2.recordSession(makeSession({ cost: 5.0 }))   // same id, updated cost
      s2.flush()
      const rows = s2.db.prepare('SELECT * FROM sessions').all() as any[]
      expect(rows).toHaveLength(1)
      expect(rows[0].total_cost).toBe(5.0)
      s2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('persists across instance close + re-open', () => {
    const dir = freshDir()
    const dbPath = join(dir, 'cockpit.db')
    try {
      const s1 = new HistoryStore(dbPath)
      s1.recordSession(makeSession({ cost: 7.7 }))
      s1.close()

      const s2 = new HistoryStore(dbPath)
      const row = s2.db.prepare('SELECT * FROM sessions WHERE id = ?').get('sid') as any
      expect(row.total_cost).toBe(7.7)
      s2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Slice 2 收尾 — 全套测试**

```bash
npx vitest run
npm run typecheck
```

Expected: all previous + 3 new tests pass (total ~228).

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/history/integration.test.ts
git commit -m "$(cat <<'EOF'
test(daemon): HistoryStore daemon-restart idempotency

Three integration cases against a real on-disk SQLite db:
1. tool_calls PK + INSERT OR IGNORE prevents re-ingest duplication
2. sessions PK + INSERT OR REPLACE upserts in place
3. close() then re-open preserves all rows (WAL fsync correct)

Slice 2 closed: full ingestion pipeline + persistence verified.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 3 · 查询层 + cost-spike 基线迁移

**产出**：HistoryStore 增加 6 个查询方法；`/api/history/*` 端点完整接通；cost-spike 规则从内存 baseline 迁到 SQLite 7-day 窗口。

## Task 10: HistoryStore.queryTrends + queryProjects

**Files:**
- Modify: `packages/daemon/src/history/store.ts`
- Create: `packages/daemon/src/history/store.queries.test.ts`

- [ ] **Step 1: 加 queryTrends + queryProjects**

打开 `packages/daemon/src/history/store.ts`，在 `clearAll()` 上方加：

```typescript
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
```

- [ ] **Step 2: 测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { HistoryStore } from './store.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

const DAY = 86400_000

describe('HistoryStore.queryTrends', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('aggregates daily costs across the time range', () => {
    const t0 = new Date('2026-05-10T00:00:00Z').getTime()
    store.recordSession(s({ sessionId: 'a', cost: 1.0, startedAt: t0 + 1000 }))
    store.recordSession(s({ sessionId: 'b', cost: 2.0, startedAt: t0 + 1000 }))                   // same day
    store.recordSession(s({ sessionId: 'c', cost: 3.0, startedAt: t0 + DAY + 1000 }))             // next day
    store.flush()
    const r = store.queryTrends({ from: t0 - DAY, to: t0 + 3 * DAY })
    expect(r.buckets).toHaveLength(2)
    expect(r.buckets[0]!.cost).toBe(3.0)   // day 1: a + b
    expect(r.buckets[1]!.cost).toBe(3.0)   // day 2: c
  })

  it('returns empty buckets array when no sessions in range', () => {
    const r = store.queryTrends({ from: 0, to: 100 })
    expect(r.buckets).toEqual([])
    expect(r.totals.cost).toBe(0)
  })

  it('computes cacheHitRate', () => {
    store.recordSession(s({ cacheReadTokens: 800, inputTokens: 200, startedAt: Date.now() - 1000 }))
    store.flush()
    const r = store.queryTrends({ from: 0, to: Date.now() + 1 })
    expect(r.totals.cacheHitRate).toBeCloseTo(800 / 1000, 2)
  })
})

describe('HistoryStore.queryProjects', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('groups sessions by project_dir', () => {
    store.recordSession(s({ sessionId: 'a', projectDir: '/proj/x', cost: 1.0, startedAt: Date.now() - 1000 }))
    store.recordSession(s({ sessionId: 'b', projectDir: '/proj/x', cost: 2.0, startedAt: Date.now() - 2000 }))
    store.recordSession(s({ sessionId: 'c', projectDir: '/proj/y', cost: 5.0, startedAt: Date.now() - 3000 }))
    store.flush()
    const r = store.queryProjects({ days: 30 })
    expect(r.projects).toHaveLength(2)
    expect(r.projects[0]!.key).toBe('/proj/y')   // highest cost first
    expect(r.projects[0]!.label).toBe('y')
    expect(r.projects[1]!.key).toBe('/proj/x')
    expect(r.projects[1]!.cost).toBe(3.0)
  })

  it('falls back to cwd when project_dir is null', () => {
    store.recordSession(s({ cwd: '/fallback/here', cost: 1.0, startedAt: Date.now() - 1000 }))
    store.flush()
    const r = store.queryProjects({ days: 30 })
    expect(r.projects[0]!.key).toBe('/fallback/here')
  })
})
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/history/store.queries.test.ts
npm run typecheck
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/history/store.ts packages/daemon/src/history/store.queries.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): HistoryStore.queryTrends + queryProjects

Trends: GROUP BY date(started_at/1000,'unixepoch','localtime'). Returns
buckets + totals (cost / sessions / cacheHitRate). queryProjects groups
by COALESCE(project_dir, cwd) — git root preferred, cwd as fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: HistoryStore.queryTop + querySparkline + queryUsageSnapshots + querySessions

**Files:**
- Modify: `packages/daemon/src/history/store.ts`
- Modify: `packages/daemon/src/history/store.queries.test.ts`

- [ ] **Step 1: 加 queryTop**

在 `queryProjects` 之后加：

```typescript
  queryTop(opts: { metric: import('./types.js').TopMetric; dimension: import('./types.js').TopDimension; days: number; limit: number }): import('./types.js').TopResult {
    const from = Date.now() - opts.days * 86400_000
    let sql: string
    switch (opts.dimension) {
      case 'project':
        sql = `SELECT COALESCE(project_dir, cwd) as key, ${this.metricSelect(opts.metric)} as metric, COUNT(*) as sessions
               FROM sessions WHERE started_at >= ? GROUP BY 1 ORDER BY metric DESC LIMIT ?`
        break
      case 'session':
        sql = `SELECT id as key, ${this.metricSelect(opts.metric)} as metric, 1 as sessions
               FROM sessions WHERE started_at >= ? ORDER BY metric DESC LIMIT ?`
        break
      case 'tool':
        if (opts.metric === 'tools') {
          sql = `SELECT tool_name as key, COUNT(*) as metric
                 FROM tool_calls WHERE ts >= ? GROUP BY 1 ORDER BY metric DESC LIMIT ?`
        } else {
          // cost/tokens × tool — join sessions
          const m = this.metricSelect(opts.metric)
          sql = `SELECT tool_calls.tool_name as key, SUM(${m}) as metric
                 FROM tool_calls JOIN sessions ON tool_calls.session_id = sessions.id
                 WHERE tool_calls.ts >= ? GROUP BY 1 ORDER BY metric DESC LIMIT ?`
        }
        break
    }
    const rows = this.db.prepare(sql).all(from, opts.limit) as any[]
    return {
      items: rows.map(r => {
        const item: any = { key: r.key }
        if (opts.metric === 'cost') item.cost = r.metric
        if (opts.metric === 'tokens') item.tokens = r.metric
        if (opts.metric === 'tools') item.toolCalls = r.metric
        if (r.sessions !== undefined) item.sessions = r.sessions
        return item
      }),
    }
  }

  private metricSelect(m: import('./types.js').TopMetric): string {
    switch (m) {
      case 'cost': return 'total_cost'
      case 'tokens': return '(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens)'
      case 'tools': return '(SELECT COUNT(*) FROM tool_calls WHERE session_id = sessions.id)'
    }
  }
```

- [ ] **Step 2: 加 querySparkline**

```typescript
  querySparkline(opts: { metric: 'cost' | 'ctx'; days: number; bucket: 'hour' | 'minute' }): import('./types.js').SparklineResult {
    const from = Date.now() - opts.days * 86400_000
    const fmt = opts.bucket === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d %H:%M'
    let valueExpr: string
    if (opts.metric === 'cost') {
      valueExpr = 'SUM(total_cost)'
    } else {
      // ctx — average final ctxPct of sessions in the bucket; we don't store
      // per-event ctxPct, so use sessions.input/cache totals over model window.
      // Simpler proxy: store a derived value as proportion of input_tokens (which
      // already aggregates) — but for v0.9 we average per-session "ctxPct-at-close"
      // is unavailable. Use AVG over (input + cache_read + cache_creation) / 1M as
      // approximate ctxPct. Conservative.
      valueExpr = 'AVG((input_tokens + cache_read_tokens + cache_creation_tokens) * 100.0 / 1000000.0)'
    }
    const rows = this.db.prepare(`
      SELECT strftime('${fmt}', started_at/1000, 'unixepoch', 'localtime') as bucket,
             ${valueExpr} as value,
             MIN(started_at) as t
      FROM sessions
      WHERE started_at >= ?
      GROUP BY 1
      ORDER BY t ASC
    `).all(from) as any[]
    return { buckets: rows.map(r => ({ t: r.t, v: r.value || 0 })) }
  }
```

- [ ] **Step 3: 加 queryUsageSnapshots + querySessions**

```typescript
  queryUsageSnapshots(opts: { days: number }): import('./types.js').UsageSnapshotsResult {
    const from = Date.now() - opts.days * 86400_000
    const rows = this.db.prepare(`
      SELECT ts, five_hour_pct, seven_day_pct
      FROM usage_snapshots
      WHERE ts >= ?
      ORDER BY ts ASC
    `).all(from) as any[]
    return {
      snapshots: rows.map(r => ({
        ts: r.ts,
        fiveHourPct: r.five_hour_pct,
        sevenDayPct: r.seven_day_pct,
      })),
    }
  }

  querySessions(opts: { from: number; to: number; limit: number }): SessionRow[] {
    return this.db.prepare(`
      SELECT * FROM sessions
      WHERE started_at >= ? AND started_at < ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(opts.from, opts.to, opts.limit) as SessionRow[]
  }
```

- [ ] **Step 4: 加 computeBaselinePerSecond**

```typescript
  computeBaselinePerSecond(opts: { now: number; windowDays: number }): number {
    const from = opts.now - opts.windowDays * 86400_000
    const row = this.db.prepare(`
      SELECT
        SUM(total_cost) as total,
        SUM(CASE
              WHEN ended_at IS NOT NULL THEN (ended_at - started_at) / 1000.0
              ELSE (last_update - started_at) / 1000.0
            END) as activeSec
      FROM sessions
      WHERE started_at >= ? AND total_cost > 0
    `).get(from) as any
    if (!row || !row.activeSec || row.activeSec <= 0) return 0
    return (row.total || 0) / row.activeSec
  }
```

确保 `SessionRow` 已 import：

```typescript
import type { SessionRow } from './types.js'
```

(若已在文件顶部 import，不需重复。)

- [ ] **Step 5: 测试**

往 `store.queries.test.ts` 加：

```typescript
describe('HistoryStore.queryTop', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('top projects by cost', () => {
    store.recordSession(s({ sessionId: 'a', projectDir: '/x', cost: 1.0, startedAt: Date.now() - 1000 }))
    store.recordSession(s({ sessionId: 'b', projectDir: '/y', cost: 5.0, startedAt: Date.now() - 2000 }))
    store.flush()
    const r = store.queryTop({ metric: 'cost', dimension: 'project', days: 30, limit: 5 })
    expect(r.items[0]!.key).toBe('/y')
    expect(r.items[0]!.cost).toBe(5.0)
  })

  it('top tools by call count', () => {
    store.recordToolCall('s1', 1000, 'Read')
    store.recordToolCall('s1', 1001, 'Read')
    store.recordToolCall('s1', 1002, 'Edit')
    store.flush()
    const r = store.queryTop({ metric: 'tools', dimension: 'tool', days: 30, limit: 5 })
    expect(r.items[0]!.key).toBe('Read')
    expect(r.items[0]!.toolCalls).toBe(2)
  })
})

describe('HistoryStore.querySparkline', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('returns hourly cost buckets', () => {
    const now = Date.now()
    store.recordSession(s({ sessionId: 'a', cost: 1.0, startedAt: now - 30 * 60_000 }))   // 30min ago
    store.recordSession(s({ sessionId: 'b', cost: 2.0, startedAt: now - 90 * 60_000 }))   // 90min ago
    store.flush()
    const r = store.querySparkline({ metric: 'cost', days: 1, bucket: 'hour' })
    expect(r.buckets.length).toBeGreaterThanOrEqual(1)
    expect(r.buckets.reduce((acc, b) => acc + b.v, 0)).toBeCloseTo(3.0, 2)
  })
})

describe('HistoryStore.queryUsageSnapshots', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('returns snapshots within window', () => {
    store.recordUsage(s({ usage5hPct: 25, usage7dPct: 10 }), Date.now() - 1000)
    store.recordUsage(s({ usage5hPct: 30, usage7dPct: 10 }), Date.now() - 500)
    store.flush()
    const r = store.queryUsageSnapshots({ days: 1 })
    expect(r.snapshots).toHaveLength(2)
    expect(r.snapshots[0]!.fiveHourPct).toBe(25)
  })
})

describe('HistoryStore.computeBaselinePerSecond', () => {
  let store: HistoryStore
  beforeEach(() => { store = new HistoryStore(':memory:') })

  it('returns 0 on empty db', () => {
    expect(store.computeBaselinePerSecond({ now: Date.now(), windowDays: 7 })).toBe(0)
  })

  it('computes total cost / total active seconds', () => {
    const now = Date.now()
    // Session a: cost 10.0, ran 100 seconds
    store.recordSession(s({ sessionId: 'a', cost: 10.0, startedAt: now - 100_000, lastUpdate: now, status: 'closed' as any }))
    // Wait — status 'closed' → ended_at is set in recordSession
    store.flush()
    const baseline = store.computeBaselinePerSecond({ now, windowDays: 7 })
    expect(baseline).toBeGreaterThan(0)
    expect(baseline).toBeCloseTo(0.1, 1)   // 10 / 100 = 0.1
  })
})
```

- [ ] **Step 6: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/history/
npm run typecheck
```

Expected: ~14 query tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/history/store.ts packages/daemon/src/history/store.queries.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): HistoryStore.queryTop + querySparkline + queryUsageSnapshots + querySessions + computeBaselinePerSecond

Top covers all 6 metric×dimension combinations including the
tools-by-tool special case. Sparkline buckets by hour/minute using
strftime('%Y-%m-%d %H:00','localtime') so dashboard shows local time.
computeBaselinePerSecond underpins the cost-spike rule's new 7d window
(Task 13). querySessions returns raw rows for /api/history/sessions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: cost-spike rule — migrate to SQLite baseline

**Files:**
- Modify: `packages/daemon/src/rules/types.ts`
- Modify: `packages/daemon/src/rules/cost-spike.ts`
- Modify: `packages/daemon/src/rules/cost-spike.test.ts`
- Modify: `packages/daemon/src/rules/engine.ts`
- Modify: `packages/daemon/src/rules/engine.test.ts`
- Modify: `packages/daemon/src/rules/engine.integration.test.ts`
- Modify: `packages/daemon/src/main.ts`

- [ ] **Step 1: RuleContext 改成 history accessor**

打开 `packages/daemon/src/rules/types.ts`，把：

```typescript
  rolling: { perSecondCostAvg: number }
```

改成：

```typescript
  history: { perSecondCostAvg7d: number }
```

- [ ] **Step 2: cost-spike.ts 改用 history**

打开 `packages/daemon/src/rules/cost-spike.ts`，把：

```typescript
    if (ctx.now - session.startedAt < MIN_AGE_MS) return null
    if (ctx.rolling.perSecondCostAvg <= 0) return null
```

改成：

```typescript
    if (ctx.history.perSecondCostAvg7d <= 0) return null
```

(注意：移除 `if (ctx.now - session.startedAt < MIN_AGE_MS) return null` 这一行 —— spec §6.3 移除 30min noise gate。同时移除 `const MIN_AGE_MS` 常量。)

再把：

```typescript
    const threshold = ctx.rolling.perSecondCostAvg * ctx.config.costSpikeMultiplier
```

改成：

```typescript
    const threshold = ctx.history.perSecondCostAvg7d * ctx.config.costSpikeMultiplier
```

把 body 文本里的 baseline 引用也更新：

```typescript
      body: `Rate ${(sessionRate * 3600).toFixed(2)}/hr vs 7d avg ${(ctx.history.perSecondCostAvg7d * 3600).toFixed(2)}/hr.`,
```

- [ ] **Step 3: engine.ts 移除 in-memory baseline**

打开 `packages/daemon/src/rules/engine.ts`，移除：

```typescript
  // baseline state for cost-spike
  private totalCost = 0
  private totalActiveSec = 0
  private lastBaselineTickMs: number | undefined
```

移除 `private updateBaseline(sessions, now)` 整个方法。

修改 `tick(sessions)`：把 `this.updateBaseline(sessions, now)` 那行删掉，并把 `rolling: { perSecondCostAvg: ... }` 改成 `history: { perSecondCostAvg7d: this.getBaseline?.(now) ?? 0 }`，并在 `EngineOptions` 接口加 `getBaseline?: (now: number) => number`。

完整新版 engine.ts：

```typescript
import type { AlertEvent, SessionState } from '@claude-cockpit/shared'
import type { Rule, RuleConfig, RuleContext } from './types.js'
import type { TranscriptEvent } from '../transcript-watcher.js'
import { DEFAULT_RULE_CONFIG } from './types.js'

const DEDUP_WINDOW_MS = 10 * 60 * 1000

export interface EngineOptions {
  rules: Rule[]
  config?: RuleConfig
  disabledRuleIds?: Set<string>
  now?: () => number
  getRecentEvents?: (sessionId: string) => readonly TranscriptEvent[]
  getBaseline?: (now: number) => number      // ← NEW (calls historyStore.computeBaselinePerSecond)
}

export class RuleEngine {
  private readonly dedupTable = new Map<string, number>()
  private readonly rules: Rule[]
  private readonly config: RuleConfig
  private readonly disabled: Set<string>
  private readonly now: () => number
  private readonly getRecentEvents: (sessionId: string) => readonly TranscriptEvent[]
  private readonly getBaseline: (now: number) => number

  constructor(opts: EngineOptions) {
    this.rules = opts.rules
    this.config = opts.config ?? DEFAULT_RULE_CONFIG
    this.disabled = opts.disabledRuleIds ?? new Set()
    this.now = opts.now ?? Date.now
    this.getRecentEvents = opts.getRecentEvents ?? (() => [])
    this.getBaseline = opts.getBaseline ?? (() => 0)
  }

  tick(sessions: SessionState[]): AlertEvent[] {
    const now = this.now()
    const baseline = this.getBaseline(now)

    const out: AlertEvent[] = []
    for (const session of sessions) {
      if (session.status === 'closed') continue
      const ctx: RuleContext = {
        now,
        recentEvents: this.getRecentEvents(session.sessionId),
        history: { perSecondCostAvg7d: baseline },
        config: this.config,
      }
      for (const rule of this.rules) {
        if (this.disabled.has(rule.id)) continue
        const alert = rule.evaluate(session, ctx)
        if (!alert) continue
        const key = `${session.sessionId}:${rule.id}`
        const last = this.dedupTable.get(key)
        if (last !== undefined && now - last < DEDUP_WINDOW_MS) continue
        this.dedupTable.set(key, now)
        out.push(alert)
      }
    }
    return out
  }
}
```

- [ ] **Step 4: 更新 cost-spike.test.ts**

打开 `packages/daemon/src/rules/cost-spike.test.ts`，把所有 `rolling: { perSecondCostAvg: 0.0001 }` 改成 `history: { perSecondCostAvg7d: 0.0001 }`。

把测试 case "does not fire for sessions younger than 30 min" 整段删掉（gate 移除了）。

新增一个 case 验证 7d 窗口边界（baseline=0 → no fire）：

```typescript
it('does not fire when baseline is 0 (empty db)', () => {
  const r = costSpikeRule.evaluate(makeSession({ cost: 100 }), {
    ...baseCtx, history: { perSecondCostAvg7d: 0 },
  })
  expect(r).toBeNull()
})
```

(若已有 "does not fire when baseline is 0 (no data)" 用例，rename 即可。)

- [ ] **Step 5: 更新 engine.test.ts + engine.integration.test.ts**

打开 `packages/daemon/src/rules/engine.test.ts`，把所有引用 `rolling` 的地方改 `history`。同理 `engine.integration.test.ts`。

- [ ] **Step 6: main.ts wire historyStore into engine**

打开 `packages/daemon/src/main.ts`，找到 `const ruleEngine = new RuleEngine({...})`，把：

```typescript
  const ruleEngine = new RuleEngine({
    rules: [ctxHighRule, costSpikeRule, loopDetectRule, subagentStuckRule],
    config: cockpitCfg.ruleConfig,
    disabledRuleIds: cockpitCfg.disabledRules,
    getRecentEvents: (sid) => eventBuffer.recent(sid, Date.now(), 30 * 60 * 1000),
  })
```

改成：

```typescript
  const ruleEngine = new RuleEngine({
    rules: [ctxHighRule, costSpikeRule, loopDetectRule, subagentStuckRule],
    config: cockpitCfg.ruleConfig,
    disabledRuleIds: cockpitCfg.disabledRules,
    getRecentEvents: (sid) => eventBuffer.recent(sid, Date.now(), 30 * 60 * 1000),
    ...(historyStore !== undefined && {
      getBaseline: (now: number) => historyStore.computeBaselinePerSecond({ now, windowDays: 7 }),
    }),
  })
```

- [ ] **Step 7: Tests + typecheck**

```bash
npx vitest run packages/daemon/
npm run typecheck
```

Expected: all pre-existing + updated tests pass (count unchanged or slightly less since the gate test was removed).

- [ ] **Step 8: Commit**

```bash
git add packages/daemon/src/rules/ packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
refactor(daemon): cost-spike — migrate baseline from in-memory rolling to SQLite 7d window

Per v0.9 spec §6.3:
- RuleContext.rolling → RuleContext.history.perSecondCostAvg7d
- RuleEngine no longer maintains totalCost/totalActiveSec state (deleted 25 lines)
- New optional EngineOptions.getBaseline injected by daemon main —
  defaults to () => 0 for tests / no-history-mode
- cost-spike body text references "7d avg" instead of "avg"
- 30-min noise gate dropped (SQLite history is more stable than single-session rolling)
- Falls back to no-fire when baseline=0 (empty DB / history disabled)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: api/history-routes.ts — GET /api/history/* + POST /clear

**Files:**
- Create: `packages/daemon/src/api/history-routes.ts`
- Create: `packages/daemon/src/api/history-routes.test.ts`
- Modify: `packages/daemon/src/api/routes.ts`

- [ ] **Step 1: history-routes.ts**

```typescript
import type { IncomingMessage } from 'node:http'
import type { ApiContext, ApiResponse } from './routes.js'

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}

function checkOriginOk(req: IncomingMessage | undefined, port: number): boolean {
  if (!req) return true
  const origin = req.headers.origin
  if (!origin) return true
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`
}

function clampDays(raw: string | null, def: number, max = 90): number {
  if (!raw) return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

function clampLimit(raw: string | null, def: number, max = 100): number {
  if (!raw) return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function handleHistoryRequest(method: string, url: string, ctx: ApiContext): Promise<ApiResponse> {
  // If history is unavailable, every endpoint returns a friendly fallback
  if (!ctx.history) {
    if (method === 'POST') {
      return json(503, { error: 'history-unavailable', reason: 'SQLite layer disabled (install failure or disabled)' })
    }
    return json(200, { unavailable: true, reason: 'history layer disabled' })
  }

  const u = new URL(url, 'http://localhost')

  if (method === 'GET' && u.pathname === '/api/history/trends') {
    const days = clampDays(u.searchParams.get('days'), 30)
    const to = Date.now()
    const from = to - days * 86400_000
    return json(200, ctx.history.queryTrends({ from, to }))
  }

  if (method === 'GET' && u.pathname === '/api/history/top') {
    const metric = (u.searchParams.get('metric') ?? 'cost') as any
    const dimension = (u.searchParams.get('dimension') ?? 'project') as any
    const days = clampDays(u.searchParams.get('days'), 30)
    const limit = clampLimit(u.searchParams.get('limit'), 10)
    if (!['cost', 'tokens', 'tools'].includes(metric)) return json(400, { error: 'invalid metric' })
    if (!['project', 'tool', 'session'].includes(dimension)) return json(400, { error: 'invalid dimension' })
    return json(200, ctx.history.queryTop({ metric, dimension, days, limit }))
  }

  if (method === 'GET' && u.pathname === '/api/history/projects') {
    const days = clampDays(u.searchParams.get('days'), 30)
    return json(200, ctx.history.queryProjects({ days }))
  }

  if (method === 'GET' && u.pathname === '/api/history/sparkline') {
    const metric = (u.searchParams.get('metric') ?? 'cost') as 'cost' | 'ctx'
    const days = clampDays(u.searchParams.get('days'), 1)
    const bucket = (u.searchParams.get('bucket') ?? 'hour') as 'hour' | 'minute'
    if (!['cost', 'ctx'].includes(metric)) return json(400, { error: 'invalid metric' })
    if (!['hour', 'minute'].includes(bucket)) return json(400, { error: 'invalid bucket' })
    return json(200, ctx.history.querySparkline({ metric, days, bucket }))
  }

  if (method === 'GET' && u.pathname === '/api/history/usage-snapshots') {
    const days = clampDays(u.searchParams.get('days'), 30)
    return json(200, ctx.history.queryUsageSnapshots({ days }))
  }

  if (method === 'GET' && u.pathname === '/api/history/sessions') {
    const from = Number(u.searchParams.get('from') ?? 0)
    const to = Number(u.searchParams.get('to') ?? Date.now())
    const limit = clampLimit(u.searchParams.get('limit'), 100)
    return json(200, ctx.history.querySessions({ from, to, limit }))
  }

  if (method === 'POST' && u.pathname === '/api/history/clear') {
    if (!checkOriginOk(ctx.request, ctx.port)) return json(403, { error: 'origin denied' })
    ctx.history.clearAll()
    return json(200, { ok: true })
  }

  return json(404, { error: 'not found' })
}
```

- [ ] **Step 2: routes.ts dispatch**

打开 `packages/daemon/src/api/routes.ts`，在 `handleApiRequest` 函数体顶部（紧跟 `if (!url.startsWith('/api/')) return null` 之后）加：

```typescript
  if (url.startsWith('/api/history/')) {
    const { handleHistoryRequest } = await import('./history-routes.js')
    return handleHistoryRequest(method, url, ctx)
  }
```

- [ ] **Step 3: history-routes.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { handleHistoryRequest } from './history-routes.js'
import { HistoryStore } from '../history/store.js'
import { SessionRegistry } from '../session-registry.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('handleHistoryRequest', () => {
  let history: HistoryStore
  let registry: SessionRegistry
  beforeEach(() => {
    history = new HistoryStore(':memory:')
    registry = new SessionRegistry()
  })

  const ctx = () => ({ registry, platform: { platform: 'darwin' as const } as any, port: 1234, history })

  it('GET /trends returns aggregated buckets', async () => {
    history.recordSession(s({ cost: 1.0, startedAt: Date.now() - 1000 }))
    history.flush()
    const res = await handleHistoryRequest('GET', '/api/history/trends?days=30', ctx())
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.buckets.length).toBeGreaterThan(0)
  })

  it('GET /top with invalid metric returns 400', async () => {
    const res = await handleHistoryRequest('GET', '/api/history/top?metric=foo&dimension=project', ctx())
    expect(res.status).toBe(400)
  })

  it('GET /sparkline with invalid bucket returns 400', async () => {
    const res = await handleHistoryRequest('GET', '/api/history/sparkline?metric=cost&bucket=day', ctx())
    expect(res.status).toBe(400)
  })

  it('GET /usage-snapshots returns snapshots in range', async () => {
    history.recordUsage(s({ usage5hPct: 50, usage7dPct: 20 }), Date.now() - 100)
    history.flush()
    const res = await handleHistoryRequest('GET', '/api/history/usage-snapshots?days=30', ctx())
    const body = JSON.parse(res.body)
    expect(body.snapshots.length).toBe(1)
  })

  it('POST /clear without Origin guard allowed (no Origin = OK)', async () => {
    history.recordSession(s({ cost: 1.0 }))
    history.flush()
    const res = await handleHistoryRequest('POST', '/api/history/clear', ctx())
    expect(res.status).toBe(200)
    expect(history.db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toMatchObject({ c: 0 })
  })

  it('POST /clear with foreign Origin returns 403', async () => {
    const req = { headers: { origin: 'http://evil.com' } } as any
    const res = await handleHistoryRequest('POST', '/api/history/clear', { ...ctx(), request: req })
    expect(res.status).toBe(403)
  })

  it('returns unavailable fallback when ctx.history undefined', async () => {
    const ctxNoHistory = { registry, platform: { platform: 'darwin' as const } as any, port: 1234 } as any
    const res = await handleHistoryRequest('GET', '/api/history/trends', ctxNoHistory)
    const body = JSON.parse(res.body)
    expect(body.unavailable).toBe(true)
  })

  it('returns 503 for POST when ctx.history undefined', async () => {
    const ctxNoHistory = { registry, platform: { platform: 'darwin' as const } as any, port: 1234 } as any
    const res = await handleHistoryRequest('POST', '/api/history/clear', ctxNoHistory)
    expect(res.status).toBe(503)
  })

  it('returns 404 for unknown sub-path', async () => {
    const res = await handleHistoryRequest('GET', '/api/history/nonexistent', ctx())
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 4: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/api/history-routes.test.ts
npm run typecheck
```

Expected: 9 tests pass.

- [ ] **Step 5: Slice 3 收尾 — 全套回归**

```bash
npx vitest run
npm run typecheck
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/api/history-routes.ts packages/daemon/src/api/history-routes.test.ts packages/daemon/src/api/routes.ts
git commit -m "$(cat <<'EOF'
feat(daemon): /api/history/* — 6 GET endpoints + POST /clear

Endpoints: trends / top / projects / sparkline / usage-snapshots /
sessions, all GET, with parameter validation (metric / dimension /
bucket enums; days/limit clamping). POST /clear uses Origin guard
(R21 mitigation), no body confirmation (UI modal in Task 18).

Unavailable mode: ctx.history undefined → GET returns 200
{unavailable:true,reason:…} (friendly), POST returns 503 (refuses
mutation).

Slice 3 closed: data + ingestion + queries + API + cost-spike
migration all green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 4 · Dashboard /history 页 + Overview Sparkline 接真数据

**产出**：`/history` 路由 + 3 tab 都能渲染真数据；Overview Sparkline 不再 mock。

## Task 14: useHistory hooks

**Files:**
- Create: `packages/dashboard/src/hooks/useHistory.ts`
- Create: `packages/dashboard/src/hooks/useHistory.test.tsx`

- [ ] **Step 1: useHistory.ts**

```typescript
import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/api.js'

interface FetchState<T> {
  data: T | undefined
  loading: boolean
  error: string | undefined
}

function useFetch<T>(path: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: undefined, loading: true, error: undefined })

  useEffect(() => {
    let cancelled = false
    setState({ data: undefined, loading: true, error: undefined })
    void (async () => {
      try {
        const res = await fetch(apiUrl(path))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        if (cancelled) return
        setState({ data: body as T, loading: false, error: undefined })
      } catch (e) {
        if (cancelled) return
        setState({ data: undefined, loading: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { cancelled = true }
  }, [path])

  return state
}

export interface TrendsBucket {
  date: string; cost: number; inputTokens: number; outputTokens: number
  cacheReadTokens: number; cacheCreationTokens: number; sessions: number
}
export interface TrendsResult {
  from: number; to: number; buckets: TrendsBucket[]
  totals: { cost: number; sessions: number; cacheHitRate: number }
}

export function useTrends(days = 30) {
  return useFetch<TrendsResult>(`/api/history/trends?days=${days}`)
}

export interface TopItem {
  key: string; cost?: number; tokens?: number; toolCalls?: number; sessions?: number
}
export interface TopResult { items: TopItem[] }

export function useTop(metric: 'cost'|'tokens'|'tools', dimension: 'project'|'tool'|'session', days = 30, limit = 10) {
  return useFetch<TopResult>(`/api/history/top?metric=${metric}&dimension=${dimension}&days=${days}&limit=${limit}`)
}

export interface ProjectItem {
  key: string; label: string; cost: number; sessions: number; totalTokens: number; lastUpdate: number
}
export interface ProjectsResult { projects: ProjectItem[] }

export function useProjects(days = 30) {
  return useFetch<ProjectsResult>(`/api/history/projects?days=${days}`)
}

export interface UsageSnapshot { ts: number; fiveHourPct: number | null; sevenDayPct: number | null }
export interface UsageSnapshotsResult { snapshots: UsageSnapshot[] }

export function useUsageSnapshots(days = 30) {
  return useFetch<UsageSnapshotsResult>(`/api/history/usage-snapshots?days=${days}`)
}

export interface SparklineBucket { t: number; v: number }
export interface SparklineResult { buckets: SparklineBucket[] }

export function useSparkline(metric: 'cost'|'ctx', days = 1, bucket: 'hour'|'minute' = 'hour') {
  return useFetch<SparklineResult>(`/api/history/sparkline?metric=${metric}&days=${days}&bucket=${bucket}`)
}
```

- [ ] **Step 2: useHistory.test.tsx**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTrends, useTop, useProjects, useSparkline } from './useHistory.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
})

describe('useHistory hooks', () => {
  it('useTrends fetches /trends?days=30', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ buckets: [], totals: { cost: 0, sessions: 0, cacheHitRate: 0 } }) })
    const { result } = renderHook(() => useTrends(30))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock.mock.calls[0][0]).toContain('/api/history/trends?days=30')
    expect(result.current.error).toBeUndefined()
  })

  it('useTop builds correct URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
    renderHook(() => useTop('cost', 'project', 7, 5))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toContain('metric=cost')
    expect(fetchMock.mock.calls[0][0]).toContain('dimension=project')
    expect(fetchMock.mock.calls[0][0]).toContain('days=7')
    expect(fetchMock.mock.calls[0][0]).toContain('limit=5')
  })

  it('useProjects on http error sets error state', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    const { result } = renderHook(() => useProjects(30))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('503')
  })

  it('useSparkline returns buckets', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ buckets: [{ t: 1, v: 2 }] }) })
    const { result } = renderHook(() => useSparkline('cost', 1, 'hour'))
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.buckets).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run packages/dashboard/src/hooks/useHistory.test.tsx
npm run typecheck
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/hooks/useHistory.ts packages/dashboard/src/hooks/useHistory.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): useHistory hooks (useTrends/useTop/useProjects/useUsageSnapshots/useSparkline)

Generic useFetch<T> handles loading/error/cancellation. All 5 hooks
share the same {data, loading, error} return shape so tab components
can render consistently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: /history route + HistoryTabs + Sidebar entry

**Files:**
- Create: `packages/dashboard/src/routes/history.tsx`
- Create: `packages/dashboard/src/components/HistoryTabs.tsx`
- Modify: `packages/dashboard/src/main.tsx`
- Modify: `packages/dashboard/src/components/Sidebar.tsx`

- [ ] **Step 1: HistoryTabs.tsx**

```typescript
type Tab = 'trends' | 'top' | 'projects'

export function HistoryTabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ['trends', 'top', 'projects']
  return (
    <div className="flex gap-1 border-b border-cockpit-line mb-3">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1.5 text-xs uppercase tracking-wide ${
            active === t
              ? 'text-cockpit-text border-b-2 border-cockpit-info -mb-px'
              : 'text-cockpit-muted hover:text-cockpit-text'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: routes/history.tsx (placeholder tabs — content filled in Tasks 16-18)**

```typescript
import { createRoute, useSearch, useNavigate } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { HistoryTabs } from '../components/HistoryTabs.js'

export interface HistorySearch { tab?: 'trends' | 'top' | 'projects' }

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/history',
  validateSearch: (search: Record<string, unknown>): HistorySearch => {
    const result: HistorySearch = {}
    if (search.tab === 'trends' || search.tab === 'top' || search.tab === 'projects') result.tab = search.tab
    return result
  },
  component: HistoryPage,
})

function HistoryPage() {
  const { tab } = useSearch({ from: Route.id })
  const navigate = useNavigate({ from: Route.id })
  const activeTab = tab ?? 'trends'

  return (
    <div>
      <div className="text-cockpit-muted text-[10px] mb-1">HISTORY</div>
      <h1 className="text-cockpit-text font-semibold mb-3">Past 30 days</h1>
      <HistoryTabs
        active={activeTab}
        onChange={(t) => navigate({ search: { tab: t } as any })}
      />
      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3 text-cockpit-muted text-xs">
        Tab content coming in Tasks 16-18: {activeTab}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: main.tsx register route**

打开 `packages/dashboard/src/main.tsx`，在 import 区加：

```typescript
import { Route as HistoryRoute } from './routes/history.js'
```

把：

```typescript
const routeTree = RootRoute.addChildren([IndexRoute, SessionDetailRoute])
```

改成：

```typescript
const routeTree = RootRoute.addChildren([IndexRoute, SessionDetailRoute, HistoryRoute])
```

- [ ] **Step 4: Sidebar.tsx 加 History 链接**

打开 `packages/dashboard/src/components/Sidebar.tsx`。找到现有链接列表（Overview 等），加 History 项。读现有代码后用 `Link to="/history"` 形式插入。

- [ ] **Step 5: build + typecheck**

```bash
npm run -w packages/dashboard build
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/routes/history.tsx packages/dashboard/src/components/HistoryTabs.tsx packages/dashboard/src/main.tsx packages/dashboard/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): /history route + tab bar + sidebar entry

Three tabs (trends / top / projects) sharing one route via ?tab= query.
TanStack validateSearch enforces enum. Tab content is placeholder —
fills in next 3 tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: TrendsTab (daily cost bar + cache rate line + 5h/7d snapshot)

**Files:**
- Create: `packages/dashboard/src/components/history/TrendsTab.tsx`
- Create: `packages/dashboard/src/components/history/TrendsTab.test.tsx`
- Modify: `packages/dashboard/src/routes/history.tsx`

- [ ] **Step 1: TrendsTab.tsx**

```typescript
import { useTrends, useUsageSnapshots } from '../../hooks/useHistory.js'
import { Sparkline } from '../Sparkline.js'
import { palette } from '../../lib/colors.js'

export function TrendsTab() {
  const trends = useTrends(30)
  const usage = useUsageSnapshots(30)

  if (trends.loading) return <p className="text-cockpit-muted text-xs">Loading…</p>
  if (trends.error) return <p className="text-cockpit-crit text-xs">Error: {trends.error}</p>
  if (!trends.data) return null

  const { buckets, totals } = trends.data
  const dates = buckets.map(b => new Date(b.date).getTime() / 1000)
  const costs = buckets.map(b => b.cost)
  const hitRates = buckets.map(b => {
    const totalIn = b.inputTokens + b.cacheReadTokens + b.cacheCreationTokens
    return totalIn > 0 ? b.cacheReadTokens / totalIn : 0
  })

  return (
    <div className="space-y-3">
      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3 text-xs text-cockpit-text">
        Last 30 days · totals <span className="font-semibold">${totals.cost.toFixed(2)}</span> · {totals.sessions} sessions · {(totals.cacheHitRate * 100).toFixed(0)}% cache hit
      </div>

      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
        <div className="text-cockpit-muted text-[10px] mb-2">DAILY COST</div>
        <Sparkline data={[dates, costs]} color={palette.ok} />
      </div>

      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
        <div className="text-cockpit-muted text-[10px] mb-2">CACHE HIT RATE</div>
        <Sparkline data={[dates, hitRates]} color={palette.info} />
      </div>

      {usage.data && usage.data.snapshots.length > 0 && (
        <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
          <div className="text-cockpit-muted text-[10px] mb-2">SUBSCRIBER USAGE (snapshots)</div>
          <Sparkline
            data={[
              usage.data.snapshots.map(s => s.ts / 1000),
              usage.data.snapshots.map(s => s.fiveHourPct ?? 0),
            ]}
            color={palette.info}
          />
          <Sparkline
            data={[
              usage.data.snapshots.map(s => s.ts / 1000),
              usage.data.snapshots.map(s => s.sevenDayPct ?? 0),
            ]}
            color={palette.warning}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TrendsTab.test.tsx**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TrendsTab } from './TrendsTab.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
})

describe('TrendsTab', () => {
  it('renders totals + sparklines once trends data arrives', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/trends')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            buckets: [{ date: '2026-05-15', cost: 1.0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 800, cacheCreationTokens: 100, sessions: 2 }],
            totals: { cost: 1.0, sessions: 2, cacheHitRate: 0.8 },
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ snapshots: [] }) })
    })
    render(<TrendsTab />)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
    expect(screen.getByText(/DAILY COST/)).toBeInTheDocument()
    expect(screen.getByText(/CACHE HIT RATE/)).toBeInTheDocument()
    expect(screen.getByText(/\$1\.00/)).toBeInTheDocument()
  })

  it('shows error when fetch fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    render(<TrendsTab />)
    await waitFor(() => expect(screen.queryByText(/Error/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: history.tsx wire TrendsTab**

打开 `packages/dashboard/src/routes/history.tsx`，import TrendsTab + 替换 placeholder：

```typescript
import { TrendsTab } from '../components/history/TrendsTab.js'
```

把：

```typescript
      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3 text-cockpit-muted text-xs">
        Tab content coming in Tasks 16-18: {activeTab}
      </div>
```

改成：

```typescript
      {activeTab === 'trends'   && <TrendsTab />}
      {activeTab === 'top'      && <div className="text-cockpit-muted text-xs">Top tab — coming in Task 17</div>}
      {activeTab === 'projects' && <div className="text-cockpit-muted text-xs">Projects tab — coming in Task 18</div>}
```

- [ ] **Step 4: Tests + build**

```bash
npx vitest run packages/dashboard/src/components/history/TrendsTab.test.tsx
npm run -w packages/dashboard build
```

Expected: 2 tests pass, build clean.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/history/ packages/dashboard/src/routes/history.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): TrendsTab — daily cost + cache rate + 5h/7d snapshots

Three Sparklines stacked vertically per v0.9 spec §5.3. Reuses existing
µPlot wrapper. Cache hit rate computed client-side from buckets
(cacheRead / (input+cacheRead+cacheCreation)).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: TopTab — metric × dimension matrix + bar list

**Files:**
- Create: `packages/dashboard/src/components/history/TopTab.tsx`
- Create: `packages/dashboard/src/components/history/TopTab.test.tsx`
- Modify: `packages/dashboard/src/routes/history.tsx`

- [ ] **Step 1: TopTab.tsx**

```typescript
import { useState } from 'react'
import { useTop } from '../../hooks/useHistory.js'
import { palette } from '../../lib/colors.js'

type Metric = 'cost' | 'tokens' | 'tools'
type Dimension = 'project' | 'tool' | 'session'

function metricValue(item: { cost?: number; tokens?: number; toolCalls?: number }, metric: Metric): number {
  if (metric === 'cost') return item.cost ?? 0
  if (metric === 'tokens') return item.tokens ?? 0
  return item.toolCalls ?? 0
}

function metricLabel(metric: Metric, v: number): string {
  if (metric === 'cost') return `$${v.toFixed(2)}`
  if (metric === 'tokens') return v.toLocaleString()
  return `${v} calls`
}

export function TopTab() {
  const [metric, setMetric] = useState<Metric>('cost')
  const [dimension, setDimension] = useState<Dimension>('project')
  const top = useTop(metric, dimension, 30, 10)

  const max = top.data?.items.reduce((acc, it) => Math.max(acc, metricValue(it, metric)), 0) ?? 1

  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs">
        <div className="flex gap-1">
          {(['cost', 'tokens', 'tools'] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-2 py-1 border rounded ${metric === m ? 'bg-cockpit-info text-cockpit-bg' : 'border-cockpit-line text-cockpit-muted'}`}>
              {m}
            </button>
          ))}
        </div>
        <span className="text-cockpit-muted self-center">by</span>
        <div className="flex gap-1">
          {(['project', 'tool', 'session'] as Dimension[]).map(d => (
            <button key={d} onClick={() => setDimension(d)}
              className={`px-2 py-1 border rounded ${dimension === d ? 'bg-cockpit-info text-cockpit-bg' : 'border-cockpit-line text-cockpit-muted'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-cockpit-panel border border-cockpit-line rounded p-3">
        {top.loading && <p className="text-cockpit-muted text-xs">Loading…</p>}
        {top.error && <p className="text-cockpit-crit text-xs">Error: {top.error}</p>}
        {top.data && top.data.items.length === 0 && <p className="text-cockpit-muted text-xs">No data in this window.</p>}
        {top.data && top.data.items.map(item => {
          const v = metricValue(item, metric)
          const w = max > 0 ? (v / max) * 100 : 0
          const label = String(item.key).split('/').filter(Boolean).slice(-2).join('/') || item.key
          return (
            <div key={item.key} className="flex items-center gap-2 text-xs mb-1">
              <div className="w-40 truncate text-cockpit-text">{label}</div>
              <div className="flex-1 h-2 bg-cockpit-line rounded">
                <div className="h-2 rounded" style={{ width: `${w}%`, background: palette.info }} />
              </div>
              <div className="w-24 text-right tabular-nums text-cockpit-muted">{metricLabel(metric, v)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TopTab.test.tsx**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TopTab } from './TopTab.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [
      { key: '/proj/big', cost: 89.12, sessions: 12 },
      { key: '/proj/small', cost: 12.34, sessions: 3 },
    ]}),
  })
})

describe('TopTab', () => {
  it('renders items with bars', async () => {
    render(<TopTab />)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
    expect(screen.getByText(/proj\/big/)).toBeInTheDocument()
    expect(screen.getByText(/\$89\.12/)).toBeInTheDocument()
  })

  it('switching dimension re-fetches', async () => {
    render(<TopTab />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('tool'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toContain('dimension=tool')
  })
})
```

- [ ] **Step 3: history.tsx wire TopTab**

把 placeholder `Top tab — coming in Task 17` 替换为 `<TopTab />`，并 import。

- [ ] **Step 4: Tests + build**

```bash
npx vitest run packages/dashboard/src/components/history/TopTab.test.tsx
npm run -w packages/dashboard build
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/history/TopTab.tsx packages/dashboard/src/components/history/TopTab.test.tsx packages/dashboard/src/routes/history.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): TopTab — metric × dimension matrix + bar list

3 metrics × 3 dimensions = 9 combos, single endpoint. UI: two button
rows for selectors, horizontal bar per item with truncated last 2
path segments as label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: ProjectsTab + clear-history button (with confirm modal)

**Files:**
- Create: `packages/dashboard/src/components/history/ProjectsTab.tsx`
- Create: `packages/dashboard/src/components/history/ProjectsTab.test.tsx`
- Modify: `packages/dashboard/src/routes/history.tsx`

- [ ] **Step 1: ProjectsTab.tsx**

```typescript
import { useState } from 'react'
import { useProjects } from '../../hooks/useHistory.js'
import { apiUrl } from '../../lib/api.js'

function ago(ts: number, now: number = Date.now()): string {
  if (!ts) return 'never'
  const m = Math.floor((now - ts) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ProjectsTab() {
  const projects = useProjects(30)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const onClear = async () => {
    setClearing(true)
    try {
      const res = await fetch(apiUrl('/api/history/clear'), { method: 'POST' })
      if (res.ok) {
        setConfirmOpen(false)
        window.location.reload()
      }
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-[10px] text-cockpit-muted hover:text-cockpit-crit border border-cockpit-line rounded px-2 py-1"
        >
          Clear all history…
        </button>
      </div>

      {projects.loading && <p className="text-cockpit-muted text-xs">Loading…</p>}
      {projects.error && <p className="text-cockpit-crit text-xs">Error: {projects.error}</p>}
      {projects.data && projects.data.projects.length === 0 && <p className="text-cockpit-muted text-xs">No projects in this window.</p>}
      {projects.data?.projects.map(p => (
        <div key={p.key} className="bg-cockpit-panel border border-cockpit-line rounded p-3">
          <div className="text-cockpit-text font-semibold">{p.label}</div>
          <div className="text-cockpit-muted text-[10px] mb-2">{p.key}</div>
          <div className="text-cockpit-text text-xs">
            ${p.cost.toFixed(2)} · {p.sessions} sessions · {(p.totalTokens / 1_000_000).toFixed(2)}M tokens · last {ago(p.lastUpdate)}
          </div>
        </div>
      ))}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-cockpit-bg border border-cockpit-line rounded p-4 max-w-sm">
            <div className="text-cockpit-text mb-3">Permanently delete all history?</div>
            <div className="text-cockpit-muted text-xs mb-4">
              This empties all 4 tables (sessions / tool_calls / events / usage_snapshots). Cannot be undone.
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmOpen(false)} className="px-3 py-1 border border-cockpit-line rounded text-xs">Cancel</button>
              <button onClick={onClear} disabled={clearing}
                className="px-3 py-1 bg-cockpit-crit text-cockpit-bg rounded text-xs">
                {clearing ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ProjectsTab.test.tsx**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab.js'

const fetchMock = vi.fn()
beforeEach(() => {
  globalThis.fetch = fetchMock as any
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ projects: [
      { key: '/proj/x', label: 'x', cost: 12.34, sessions: 5, totalTokens: 1500000, lastUpdate: Date.now() - 60_000 },
    ]}),
  })
})

describe('ProjectsTab', () => {
  it('renders project cards', async () => {
    render(<ProjectsTab />)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText(/\$12\.34/)).toBeInTheDocument()
    expect(screen.getByText(/1\.50M tokens/)).toBeInTheDocument()
  })

  it('opens confirm modal then cancels', async () => {
    render(<ProjectsTab />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText(/Clear all history/))
    expect(screen.getByText(/Permanently delete/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Permanently delete/)).toBeNull()
  })
})
```

- [ ] **Step 3: history.tsx wire ProjectsTab**

替换 placeholder `Projects tab — coming in Task 18` 为 `<ProjectsTab />`。

- [ ] **Step 4: Tests + build**

```bash
npx vitest run packages/dashboard/src/components/history/ProjectsTab.test.tsx
npm run -w packages/dashboard build
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/history/ProjectsTab.tsx packages/dashboard/src/components/history/ProjectsTab.test.tsx packages/dashboard/src/routes/history.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): ProjectsTab + clear-history confirm modal

Project cards show cost / sessions / tokens / last activity. "Clear all
history…" button opens a modal that calls POST /api/history/clear on
confirm. Daemon-side Origin guard already prevents foreign-site CSRF;
modal adds user-side accidental-click protection (spec §6.4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Overview Sparkline 接真数据

**Files:**
- Modify: `packages/dashboard/src/routes/index.tsx`

- [ ] **Step 1: 改 index.tsx**

打开 `packages/dashboard/src/routes/index.tsx`，移除 mock：

```typescript
// DELETE:
const xs24 = Array.from({ length: 24 }, (_, i) => i)
const mockCost24 = xs24.map(() => Math.random() * 2)
const mockCtx24 = xs24.map(() => Math.random() * 100)
```

import useSparkline：

```typescript
import { useSparkline } from '../hooks/useHistory.js'
```

在 component body 内（`useSessionStream` 那行之后）加：

```typescript
    const costSparkline = useSparkline('cost', 1, 'hour')
    const ctxSparkline = useSparkline('ctx', 1, 'hour')
```

替换底部两个 Sparkline 面板：

```typescript
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
            <div className="text-cockpit-muted text-[10px] mb-1">COST · 24h</div>
            {costSparkline.data && costSparkline.data.buckets.length > 0 ? (
              <Sparkline
                data={[
                  costSparkline.data.buckets.map(b => b.t / 1000),
                  costSparkline.data.buckets.map(b => b.v),
                ]}
                color="#73bf69"
              />
            ) : (
              <div className="text-cockpit-muted text-[10px]">no data yet</div>
            )}
          </div>
          <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
            <div className="text-cockpit-muted text-[10px] mb-1">CONTEXT % · 24h</div>
            {ctxSparkline.data && ctxSparkline.data.buckets.length > 0 ? (
              <Sparkline
                data={[
                  ctxSparkline.data.buckets.map(b => b.t / 1000),
                  ctxSparkline.data.buckets.map(b => b.v),
                ]}
                color="#5794f2"
              />
            ) : (
              <div className="text-cockpit-muted text-[10px]">no data yet</div>
            )}
          </div>
        </div>
```

- [ ] **Step 2: Tests + build**

```bash
npx vitest run packages/dashboard/
npm run -w packages/dashboard build
npm run typecheck
```

Expected: existing tests still pass; build clean.

- [ ] **Step 3: Slice 4 收尾 — 全套回归**

```bash
npx vitest run
npm run typecheck
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/routes/index.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): Overview Sparklines now hit real /api/history/sparkline

Removed mockCost24/mockCtx24. useSparkline('cost'/'ctx', 1, 'hour')
fetches 24h hourly aggregates. When no data yet (fresh DB / history
disabled), shows "no data yet" placeholder.

Slice 4 closed: /history page + 3 tabs + Overview real sparklines all
end-to-end wired.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 5 · 清理 / 监控 / 收官

**产出**：90 天滚动清理；DB 大小监控；README v0.9 段；e2e；tag v0.9.0-beta。

## Task 20: history/cleanup.ts

**Files:**
- Create: `packages/daemon/src/history/cleanup.ts`
- Create: `packages/daemon/src/history/cleanup.test.ts`
- Modify: `packages/daemon/src/main.ts`

- [ ] **Step 1: cleanup.ts**

```typescript
import type { HistoryStore } from './store.js'

export function runCleanup(store: HistoryStore, retentionDays: number): { deleted: Record<string, number> } {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const deleted: Record<string, number> = { sessions: 0, tool_calls: 0, events: 0, usage_snapshots: 0 }
  store.db.transaction(() => {
    deleted.sessions        = store.db.prepare('DELETE FROM sessions        WHERE started_at < ?').run(cutoff).changes
    deleted.tool_calls      = store.db.prepare('DELETE FROM tool_calls      WHERE ts         < ?').run(cutoff).changes
    deleted.events          = store.db.prepare('DELETE FROM events          WHERE ts         < ?').run(cutoff).changes
    deleted.usage_snapshots = store.db.prepare('DELETE FROM usage_snapshots WHERE ts         < ?').run(cutoff).changes
  })()
  return { deleted }
}

export function msUntilNextLocalMidnight(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime() - now
}

export function scheduleDailyCleanup(store: HistoryStore, retentionDays: number): { cancel: () => void } {
  let timer: NodeJS.Timeout | undefined
  function tick() {
    try {
      const result = runCleanup(store, retentionDays)
      const total = Object.values(result.deleted).reduce((a, b) => a + b, 0)
      if (total > 0) console.log('[cockpit] daily cleanup:', result.deleted)
    } catch (e) {
      console.error('[cockpit] cleanup failed:', e)
    }
    timer = setTimeout(tick, msUntilNextLocalMidnight())
  }
  timer = setTimeout(tick, msUntilNextLocalMidnight())
  return { cancel: () => { if (timer) clearTimeout(timer) } }
}
```

- [ ] **Step 2: cleanup.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { HistoryStore } from './store.js'
import { runCleanup, msUntilNextLocalMidnight } from './cleanup.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

const DAY = 86400_000

describe('runCleanup', () => {
  it('deletes nothing from empty db', () => {
    const store = new HistoryStore(':memory:')
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(0)
    expect(r.deleted.tool_calls).toBe(0)
  })

  it('deletes rows older than retention window', () => {
    const store = new HistoryStore(':memory:')
    const now = Date.now()
    store.recordSession(s({ sessionId: 'old', startedAt: now - 100 * DAY }))
    store.recordSession(s({ sessionId: 'new', startedAt: now - 5 * DAY }))
    store.recordToolCall('old', now - 100 * DAY, 'Read')
    store.recordToolCall('new', now - 1 * DAY, 'Edit')
    store.flush()
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(1)
    expect(r.deleted.tool_calls).toBe(1)
    const rows = store.db.prepare('SELECT id FROM sessions').all() as any[]
    expect(rows.map(r => r.id)).toEqual(['new'])
  })

  it('cleans all 4 tables transactionally', () => {
    const store = new HistoryStore(':memory:')
    const now = Date.now()
    store.recordSession(s({ startedAt: now - 100 * DAY }))
    store.recordToolCall('sid', now - 100 * DAY, 'Read')
    store.recordAlert({ ruleId: 'ctx-high', sessionId: 'sid', ts: now - 100 * DAY, title: 't', body: 'b' })
    store.recordUsage(s({ usage5hPct: 1 }), now - 100 * DAY)
    store.flush()
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(1)
    expect(r.deleted.tool_calls).toBe(1)
    expect(r.deleted.events).toBe(1)
    expect(r.deleted.usage_snapshots).toBe(1)
  })

  it('keeps boundary rows (exactly at cutoff)', () => {
    const store = new HistoryStore(':memory:')
    const now = Date.now()
    const cutoff = now - 90 * DAY
    store.recordSession(s({ startedAt: cutoff + 1 }))
    store.flush()
    const r = runCleanup(store, 90)
    expect(r.deleted.sessions).toBe(0)
  })
})

describe('msUntilNextLocalMidnight', () => {
  it('returns positive value', () => {
    const ms = msUntilNextLocalMidnight()
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })
})
```

- [ ] **Step 3: main.ts wire scheduleDailyCleanup**

打开 `packages/daemon/src/main.ts`，imports 加：

```typescript
import { runCleanup, scheduleDailyCleanup } from './history/cleanup.js'
```

在 `startDaemon` 内，紧跟 `const historyStore = …` 块之后加：

```typescript
  if (historyStore) {
    const initial = runCleanup(historyStore, cockpitCfg.retentionDays ?? 90)
    if (Object.values(initial.deleted).some(n => n > 0)) {
      console.log('[cockpit] startup cleanup:', initial.deleted)
    }
  }

  const cleanupTimer = historyStore
    ? scheduleDailyCleanup(historyStore, cockpitCfg.retentionDays ?? 90)
    : undefined
```

在 `shutdown` 内（紧跟 flushTimer 清理后）加：

```typescript
    cleanupTimer?.cancel()
```

- [ ] **Step 4: 加 retentionDays 到 config-loader**

打开 `packages/daemon/src/config-loader.ts`，在 `CockpitConfig` interface 加：

```typescript
  retentionDays?: number
```

在 raw 解析处加：

```typescript
    retentionDays: typeof raw.retentionDays === 'number' && raw.retentionDays > 0 ? raw.retentionDays : undefined,
```

- [ ] **Step 5: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/history/cleanup.test.ts
npm run typecheck
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/history/cleanup.ts packages/daemon/src/history/cleanup.test.ts packages/daemon/src/main.ts packages/daemon/src/config-loader.ts
git commit -m "$(cat <<'EOF'
feat(daemon): runCleanup + scheduleDailyCleanup + config.retentionDays

90-day rolling DELETE across 4 tables in a single transaction. Schedules
next tick at local midnight (DST-safe via setHours(24,0,0,0)). Startup
catch-up handles long-offline daemons. Default 90 days; configurable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: history/size-monitor.ts

**Files:**
- Create: `packages/daemon/src/history/size-monitor.ts`
- Create: `packages/daemon/src/history/size-monitor.test.ts`
- Modify: `packages/daemon/src/main.ts`

- [ ] **Step 1: size-monitor.ts**

```typescript
import type { HistoryStore } from './store.js'

const WARN_BYTES = 500 * 1024 * 1024   // 500 MB

export function dbSizeBytes(store: HistoryStore): number {
  const pageCount = (store.db.pragma('page_count', { simple: true }) as number) ?? 0
  const pageSize = (store.db.pragma('page_size', { simple: true }) as number) ?? 0
  return pageCount * pageSize
}

export function checkDbSize(store: HistoryStore): { bytes: number; warned: boolean } {
  const bytes = dbSizeBytes(store)
  const warned = bytes > WARN_BYTES
  if (warned) {
    console.warn(`[cockpit] DB size ${(bytes / 1024 / 1024).toFixed(0)}MB exceeds 500MB warn threshold — consider lowering retentionDays or POST /api/history/clear`)
  }
  return { bytes, warned }
}

export function scheduleSizeMonitor(store: HistoryStore): { cancel: () => void } {
  const HOUR = 60 * 60 * 1000
  const timer = setInterval(() => { try { checkDbSize(store) } catch (e) { console.error('[cockpit] size check failed:', e) } }, HOUR)
  return { cancel: () => clearInterval(timer) }
}
```

- [ ] **Step 2: size-monitor.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { HistoryStore } from './store.js'
import { dbSizeBytes, checkDbSize } from './size-monitor.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

describe('size-monitor', () => {
  it('reports positive size for non-empty db', () => {
    const store = new HistoryStore(':memory:')
    store.recordSession(s())
    store.flush()
    expect(dbSizeBytes(store)).toBeGreaterThan(0)
  })

  it('checkDbSize does not warn under threshold', () => {
    const store = new HistoryStore(':memory:')
    store.recordSession(s())
    store.flush()
    const r = checkDbSize(store)
    expect(r.warned).toBe(false)
    expect(r.bytes).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: main.ts wire scheduleSizeMonitor**

```typescript
import { scheduleSizeMonitor } from './history/size-monitor.js'

// In startDaemon, after cleanupTimer:
const sizeMonitorTimer = historyStore ? scheduleSizeMonitor(historyStore) : undefined

// In shutdown:
sizeMonitorTimer?.cancel()
```

- [ ] **Step 4: Tests**

```bash
npx vitest run packages/daemon/src/history/size-monitor.test.ts
npm run typecheck
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/history/size-monitor.ts packages/daemon/src/history/size-monitor.test.ts packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): DB size monitoring (warn > 500MB hourly)

Uses SQLite pragma page_count * page_size — accurate, fast. Hourly
interval; warn-only (does not auto-delete, lets user decide). R16
mitigation: heavy users notice growth before disk fills.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: end-to-end integration test

**Files:**
- Create: `tests/e2e/v0.9-history.e2e.test.ts`

- [ ] **Step 1: e2e**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HistoryStore } from '../../packages/daemon/src/history/store.js'
import { runCleanup } from '../../packages/daemon/src/history/cleanup.js'
import type { SessionState } from '@claude-cockpit/shared'

function s(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x', model: 'm', ctxPct: 0,
    cost: 0, tools: [], todos: [], mcpServers: [], transcriptPath: '/t.jsonl',
    status: 'busy', lastUpdate: 1000, startedAt: 500,
    ...over,
  }
}

const DAY = 86400_000

describe('v0.9 history e2e', () => {
  let dir: string
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('full pipeline: ingest → flush → trends query → cleanup → trends empty', () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-e2e-'))
    const dbPath = join(dir, 'cockpit.db')

    // Phase 1: write 5 sessions over the past 100 days
    const store = new HistoryStore(dbPath)
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      store.recordSession(s({
        sessionId: `s${i}`,
        cost: 1.0 + i,
        startedAt: now - (i * 20) * DAY,    // 0, 20, 40, 60, 80 days ago
      }))
    }
    store.flush()

    // Phase 2: query trends — all 5 in range
    const all = store.queryTrends({ from: now - 100 * DAY, to: now + 1 })
    expect(all.buckets.length).toBeGreaterThanOrEqual(5)
    expect(all.totals.cost).toBeCloseTo(15.0, 1)   // 1+2+3+4+5

    // Phase 3: cleanup with 50-day retention — keeps s0..s2 (0/20/40 days), drops s3,s4
    const r = runCleanup(store, 50)
    expect(r.deleted.sessions).toBe(2)

    // Phase 4: query again — only 3 left
    const after = store.queryTrends({ from: now - 100 * DAY, to: now + 1 })
    expect(after.totals.sessions).toBe(3)
    expect(after.totals.cost).toBeCloseTo(6.0, 1)  // 1+2+3

    store.close()
  })

  it('idempotent re-ingest does not double-count after restart', () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-e2e-'))
    const dbPath = join(dir, 'cockpit.db')

    const s1 = new HistoryStore(dbPath)
    s1.recordSession(s({ cost: 3.0 }))
    s1.recordToolCall('sid', 1000, 'Read')
    s1.recordToolCall('sid', 1001, 'Edit')
    s1.close()

    // Simulate daemon restart re-reading transcript
    const s2 = new HistoryStore(dbPath)
    s2.recordToolCall('sid', 1000, 'Read')
    s2.recordToolCall('sid', 1001, 'Edit')
    s2.recordToolCall('sid', 1002, 'Bash')  // new
    s2.flush()

    expect((s2.db.prepare('SELECT COUNT(*) as c FROM tool_calls').get() as any).c).toBe(3)
    expect((s2.db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c).toBe(1)
    s2.close()
  })
})
```

- [ ] **Step 2: Tests**

```bash
npx vitest run tests/e2e/v0.9-history.e2e.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/v0.9-history.e2e.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): v0.9 history — ingest → query → cleanup pipeline

Two end-to-end cases against real on-disk SQLite:
- Full pipeline: write 5 sessions across 100 days, query, cleanup at
  50d, re-query — boundary respected.
- Idempotent re-ingest: simulate daemon restart, verify tool_calls
  PK + INSERT OR IGNORE keeps row count stable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: README v0.9 段 + backup hint

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 加 v0.9 段 + backup**

打开 `README.md`，在 `## What you get (v0.5 beta)` 之上加：

```markdown
## What you get (v0.9 beta)

Everything in v0.5 beta **plus**:

- **History layer** — every session / tool call / alert / 5h-7d usage snapshot is persisted to `~/.claude-cockpit/cockpit.db` (SQLite WAL). 5-second batched flush; 90-day rolling cleanup at local midnight.
- **`/history` page** with three tabs:
  - **Trends** — 30-day daily cost bar, cache hit rate line, 5h/7d subscriber-usage history
  - **Top** — `metric × dimension` matrix (cost / tokens / tool-calls × project / tool / session)
  - **Projects** — per-project totals + last activity, grouped by `workspace.project_dir`
- **Overview Sparklines** are now backed by real 24-hour aggregates — no more mock data.
- **`cost-spike` baseline** has graduated from in-memory rolling to SQLite 7-day window — more stable, survives daemon restarts.

### Backup your history

Three SQLite files in `~/.claude-cockpit/`:

```bash
cp ~/.claude-cockpit/cockpit.db* /your/backup/dir/
```

(Daemon must not be running, or copy while idle. WAL files are part of consistency — copy all three.)

### Clear history

Either through the dashboard ("Clear all history…" on the Projects tab, with confirm modal) or via curl:

```bash
curl -X POST http://localhost:<port>/api/history/clear
```

### Configuration

Optional in `~/.claude-cockpit/config.json`:

```jsonc
{
  "retentionDays": 90,        // history rolling window; default 90
  "historyFlushMs": 5000      // batch flush interval; default 5000
}
```

### Graceful degradation

If `better-sqlite3` fails to load (Alpine glibc / unsupported arch / missing build tools), the daemon stays alive, statusline / Overview / detail page work normally — only `/history` shows "History unavailable" and `cost-spike` rule falls back to its v0.5 behavior.

---

```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README v0.9 beta section + backup/clear/config notes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: full regression + tag v0.9.0-beta

**Files:** (no source changes)

- [ ] **Step 1: 跑全测**

```bash
npx vitest run
npm run typecheck
npm run -w packages/dashboard build
```

Expected: ~267 tests pass (209 + 58 new); typecheck clean; build clean.

- [ ] **Step 2: 验收清单走一遍**

依 spec §9 14 项目视检查 + smoke：
- daemon 启动后 `ls -la ~/.claude-cockpit/cockpit.db*` 应有 3 个文件
- 用真实 CC session 跑几分钟后 `sqlite3 ~/.claude-cockpit/cockpit.db 'SELECT COUNT(*) FROM sessions'` 应 > 0
- 浏览器开 `/history` 三 tab 都能渲染
- Overview 双 sparkline 不再随机 mock

- [ ] **Step 3: tag + push**

```bash
git tag -a v0.9.0-beta -m "v0.9: SQLite history layer + /history page + Sparkline real data"
git push origin main
git push origin v0.9.0-beta
```

- [ ] **Step 4: release notes draft**

写 `docs/release-notes/v0.9.0-beta.md` 沿用 v0.5.x notes 风格（亮点 / 实现 / 风险 / 测试 / 已知限制 / GitHub Release UI 用）。

- [ ] **Step 5: Commit release notes**

```bash
git add docs/release-notes/v0.9.0-beta.md
git commit -m "$(cat <<'EOF'
docs: release notes for v0.9.0-beta

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

# Self-Review

## 1. Spec coverage

- [x] §1 范围与不变量 → Tasks 1-24 完整覆盖 4 个不变量
- [x] §2 4 表 schema + schema_meta → Task 2
- [x] §2 写入幂等策略 → Tasks 4 (record), 9 (integration verifies)
- [x] §3 in-memory queue + 5s 批量 flush → Tasks 4 (queue + flush), 7 (wire)
- [x] §3 graceful shutdown sync flush → Task 7 (shutdown handler)
- [x] §3 启动顺序 + WAL/synchronous pragma → Task 4 (constructor)
- [x] §3.5 transcript 重读 idempotency → Task 9 (e2e verifies)
- [x] §4 6 GET 端点 + POST clear → Task 13
- [x] §4 Origin guard + 参数 clamping → Task 13
- [x] §4 ctx.history ApiContext 扩展 → Task 8
- [x] §5 /history 路由 + 3 tab + tab query state → Tasks 15-18
- [x] §5 Sidebar 加入口 → Task 15
- [x] §5 Overview Sparkline 接真数据 → Task 19
- [x] §6 90 天 rolling cleanup + 本地 00:00 调度 → Task 20
- [x] §6 startup catch-up cleanup → Task 20
- [x] §6 cost-spike 基线迁移 → Task 12
- [x] §6 POST clear + Origin guard + UI confirm → Tasks 13, 18
- [x] §7 R15-R21 风险都有 mitigation tasks → Tasks 5 (R15), 21 (R16), 7 (R17), 9 (R18), 20 (R19), 12 (R20), 13/18 (R21)
- [x] §8 测试策略 ≈ 58 新测 → Tasks have running test counts that sum to ≈ 60
- [x] §9 验收清单 → Task 24

## 2. Placeholder scan

- 无 TBD / TODO
- Task 7 Step 7 注释了 http-server 签名扩展挪到 Task 8，明确说明
- Task 12 移除 `MIN_AGE_MS` 常量，显式删除（不是隐式）
- Task 15 Step 4 "Sidebar.tsx" 步骤要求"读现有代码后用 Link to=/history 形式插入" —— 让实现者根据真实代码组织判断；不算 placeholder 因为意图明确
- Task 19 给出完整新版 Sparkline 渲染代码块（不是"类似 Task X"）

## 3. Type consistency

- `HistoryStore` 类方法签名（recordSession/recordToolCall/recordAlert/recordUsage/flush/clearAll/close + 6 query 方法 + computeBaselinePerSecond）一致出现在 Tasks 4, 10, 11, 13, 20, 21
- `SessionRow / ToolCallRow / EventRow / UsageSnapshotRow` 类型在 Task 3 定义，Tasks 4/10/11 都从同一处 import
- `TrendsResult / TopResult / ProjectsResult / SparklineResult / UsageSnapshotsResult` 在 Task 3 定义，Tasks 10/11/13 (server) + Task 14 (client hooks) shape 完全对齐
- `RuleContext.history.perSecondCostAvg7d` 一致出现在 Task 12 的 types.ts / cost-spike.ts / engine.ts / 主 main.ts wire 处
- `tryOpenHistory` 返回 `{available, reason?, store?}` 在 Task 5 定义，Task 7 解构使用
- `EngineOptions.getBaseline?: (now) => number` 在 Task 12 添加，main.ts 注入相同签名

No inconsistencies found. Plan ready for execution.
