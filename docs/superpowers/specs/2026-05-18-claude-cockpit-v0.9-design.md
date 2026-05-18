# claude-cockpit v0.9 (Phase 3) · 设计 Spec

| 字段 | 值 |
|---|---|
| 项目 | `claude-cockpit` |
| 里程碑 | v0.9 (Phase 3 / RC) |
| 上一里程碑 | v0.5.x beta（Phase 2 完结） |
| 日期 | 2026-05-18 |
| 作者 | shuliuyang (shaun@dupoin.com) |
| 协作 | Claude Opus 4.7 |
| 关联 spec | [`2026-05-15-claude-cockpit-design.md`](./2026-05-15-claude-cockpit-design.md)（总体设计） · [`2026-05-15-claude-cockpit-v0.5-design.md`](./2026-05-15-claude-cockpit-v0.5-design.md)（Phase 2） |
| 状态 | 已批准（brainstorm 阶段） |

---

## 1 · 范围与不变量

v0.9 的目标：**让 cockpit 从"实时态"变成"实时态 + 历史态"**。

### 1.1 入选 / 不入选

| 类别 | v0.9 入选 | 推后或显式拒绝 |
|---|---|---|
| **后端** | `HistoryStore`（better-sqlite3 WAL）；4 表 schema；5s 批量 flush；graceful shutdown 前 sync flush；90 天滚动清理 cron | 全量 transcript 归档（总 spec v1 已拒绝） |
| **API** | `GET /api/history/*` 4 个聚合端点（trends / top / projects / sparkline / usage-snapshots / sessions） + `POST /api/history/clear` | RESTful CRUD（只读 + 一键清空） |
| **Dashboard** | 新增 `/history` 路由含 3 tab（Trends / Top / Projects）；Overview 的 mock Sparkline 接真数据；Sidebar 加 History 入口 | `/alerts/feed`（不顺路做，留 v1.0 或后续） |
| **告警引擎** | `cost-spike` 基线从内存 rolling 迁移到 SQLite 7-day 窗口；移除"session ≥ 30min 才参与"早期 noise gate | 新增告警规则 |
| **数据维度** | 覆盖 v0.5.x 新增的 `cacheCreation / taskCount / 5h-7d 历史 / MCP 调用统计` | TodoWrite 历史快照、tool_result 配对（status='error'）—— 推 v0.9.x patch |

### 1.2 不变量（验收门槛）

1. daemon 首次启动自动建库、建表、建索引；幂等（启动多次不重复 migrate）
2. 崩溃时数据丢失窗口 ≤ 5s（graceful shutdown 路径 sync flush 兜底）
3. `~/.claude-cockpit/cockpit.db` 占用 < 50MB / 90 天（典型用户）
4. 90 天清理任务每天 0:00（本地时间）跑一次；可通过 `config.json.retentionDays` 调
5. `/history` 三 tab 数据查询全部走 SQLite 聚合（不在客户端做 N+1）
6. v0.5.4 已有 209 单测 + typecheck 必须保持绿
7. **隐私默认不变**：只存元数据，零原文 transcript 入库

---

## 2 · 数据库 schema

`~/.claude-cockpit/cockpit.db`（better-sqlite3，开启 WAL）。4 张表 + `schema_meta` 版本表 + 配套索引：

```sql
-- One row per Claude Code session (upsert by id)
CREATE TABLE IF NOT EXISTS sessions (
  id                     TEXT    PRIMARY KEY,           -- claude session_id
  cwd                    TEXT    NOT NULL,
  project_dir            TEXT,                          -- stdin's workspace.project_dir (git root)
  model                  TEXT    NOT NULL,
  branch                 TEXT,
  started_at             INTEGER NOT NULL,              -- ms epoch
  ended_at               INTEGER,                       -- ms epoch (null = still live)
  last_update            INTEGER NOT NULL,              -- ms epoch, kept fresh while live
  total_cost             REAL    DEFAULT 0,
  input_tokens           INTEGER DEFAULT 0,
  output_tokens          INTEGER DEFAULT 0,
  cache_read_tokens      INTEGER DEFAULT 0,
  cache_creation_tokens  INTEGER DEFAULT 0,
  task_count             INTEGER DEFAULT 0,             -- subagent dispatches
  transcript_path        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at  ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project_dir ON sessions(project_dir);
CREATE INDEX IF NOT EXISTS idx_sessions_cwd         ON sessions(cwd);

-- One row per tool_use event from transcript (INSERT OR IGNORE on PK)
CREATE TABLE IF NOT EXISTS tool_calls (
  session_id  TEXT    NOT NULL,
  ts          INTEGER NOT NULL,                          -- ms epoch
  tool_name   TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'ok',
  PRIMARY KEY (session_id, ts, tool_name)                -- defends idempotent re-ingest
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_ts        ON tool_calls(ts);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name);

-- Generic event log (alerts in v0.9; future: file_edit / todos snapshots)
CREATE TABLE IF NOT EXISTS events (
  session_id   TEXT    NOT NULL,
  ts           INTEGER NOT NULL,
  event_type   TEXT    NOT NULL,                         -- 'alert' for v0.9
  payload_json TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);

-- Account-wide subscriber quota snapshots (NOT session-scoped)
CREATE TABLE IF NOT EXISTS usage_snapshots (
  ts                  INTEGER PRIMARY KEY,               -- ms epoch
  five_hour_pct       REAL,
  seven_day_pct       REAL,
  five_hour_reset_at  INTEGER,
  seven_day_reset_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_ts ON usage_snapshots(ts);

-- Schema migration version (single-row table)
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- on startup: INSERT OR IGNORE ('schema_version','1')
```

### 2.1 几个设计决定

| 决定 | 说明 |
|---|---|
| `sessions.id` = PK | session 是 upsert 模式（同 id 反复更新 total_cost、task_count），不是 append-only |
| `tool_calls` 三列联合 PK | 防止 daemon 重启后 transcript 重读时插入重复行（搭配 INSERT OR IGNORE） |
| `tool_calls` 没存 `duration_ms` | 需要配对 tool_result 才能算出；v0.9 不做，留 v0.9.x；后续加列是非破坏迁移 |
| `events.payload_json` | 装 alert 的 `{ruleId, title, body}`；将来其他事件类型沿用同一表 |
| `usage_snapshots` 独立表 | 5h/7d 不绑 session，是账号级 —— 不该塞 sessions 表 |
| `project_dir` 取自 stdin `workspace.project_dir` | git 根，比 cwd 稳定；Projects tab GROUP BY 这列；不可用时 fallback 到 cwd |
| `schema_meta` | 显式版本号，将来加列、改 schema 走 "version N → N+1" pattern |

### 2.2 写入幂等策略

| 表 | 策略 | 用途 |
|---|---|---|
| `sessions` | `INSERT OR REPLACE` (upsert by id) | 同 session_id 反复更新 |
| `tool_calls` | `INSERT OR IGNORE` (PK 阻止重复) | transcript 重读保险 |
| `events` | 无去重 | 每条事件 ts 不同，重复即使有也无害 |
| `usage_snapshots` | 仅当 `5h_pct / 7d_pct / *_reset_at` 任一**变了**时插入 | 否则每次 statusline ping 都插同一份会污染表 |

---

## 3 · 写入路径与批量 flush

```
TranscriptWatcher event ──┐
                          ├──→ in-memory queue ──[5s timer]──→ HistoryStore.flush() ──┐
SessionRegistry update ──┘                                                            │
                                                                                      ↓
                                                            BEGIN TRANSACTION
                                                              INSERT OR REPLACE sessions
                                                              INSERT OR IGNORE  tool_calls
                                                              INSERT             events
                                                              INSERT OR IGNORE   usage_snapshots
                                                            COMMIT
```

### 3.1 单一写入入口：`HistoryStore`

新增 `packages/daemon/src/history/store.ts`：

```typescript
export class HistoryStore {
  // queues (drained on flush)
  private readonly sessionsQueue = new Map<string, SessionRow>()    // dedupe by id
  private readonly toolCallsQueue: ToolCallRow[] = []
  private readonly eventsQueue: EventRow[] = []
  private readonly usageQueue: UsageSnapshotRow[] = []
  private readonly db: Database                                      // better-sqlite3

  constructor(dbPath: string) { /* opens + runs migrations */ }
  recordSession(s: SessionState): void                              // queue session upsert
  recordToolCall(sid: string, ts: number, name: string): void       // queue tool_call insert
  recordAlert(alert: AlertEvent): void                              // queue events insert (type=alert)
  recordUsage(s: SessionState, now: number): void                   // queue usage_snapshots (dedup by value-change)
  flush(): void                                                      // sync, idempotent, transactional
  close(): void                                                     // flush + close DB
  // query methods (used by /api/history/*):
  queryTrends(opts: { from: number; to: number }): TrendsResult
  queryTop(opts: { metric: 'cost'|'tokens'|'tools'; dimension: 'project'|'tool'|'session'; days: number; limit: number }): TopResult
  queryProjects(opts: { days: number }): ProjectsResult
  querySparkline(opts: { metric: 'cost'|'ctx'; days: number; bucket: 'hour'|'minute' }): SparklineResult
  queryUsageSnapshots(opts: { days: number }): UsageSnapshotsResult
  querySessions(opts: { from: number; to: number; limit: number }): SessionRow[]
  computeBaselinePerSecond(opts: { now: number; windowDays: number }): number
  clearAll(): void
}
```

### 3.2 主 daemon 接入点

| 现有信号 | 新增动作 |
|---|---|
| socket 收到 `UPDATE_SESSION` → `registry.upsert` | 末尾加 `historyStore.recordSession(updated)` + `historyStore.recordUsage(updated, now)` |
| TranscriptWatcher TOOL_USE | 末尾加 `historyStore.recordToolCall(sid, e.ts, e.name)` |
| RuleEngine alert 触发 | 在 ruleTick 内 `alertStore.push(alert)` 之后 `historyStore.recordAlert(alert)` |
| `startDaemon` | `const historyStore = new HistoryStore(path)`；`setInterval(() => historyStore.flush(), flushMs)` |
| `shutdown` | `clearInterval(flushTimer)` + `historyStore.close()`（内部 flush + close） |

### 3.3 启动顺序

```
daemon main:
  1. mkdirSync(getCockpitDir(), { recursive: true })           // already done
  2. const db = new Database(getDbPath())
     db.pragma('journal_mode = WAL')
     db.pragma('synchronous = NORMAL')                          // WAL + NORMAL = safe + fast
  3. ensureSchema(db)                                            // creates 4 tables + indexes if missing
     ensureSchemaVersion(db, 1)
  4. const historyStore = new HistoryStore(db)
  5. ...wire into registry / TranscriptWatcher listener / ruleTick
  6. runCleanup(historyStore, cockpitCfg.retentionDays ?? 90)   // startup catch-up
  7. const flushTimer = setInterval(() => historyStore.flush(), flushMs)
  8. const cleanupTimer = scheduleDailyCleanup(historyStore, retentionDays)
  9. shutdown handler appends: clearInterval(flushTimer); clearInterval(cleanupTimer); historyStore.close()
```

### 3.4 关键决定

| # | 决定 | 理由 |
|---|---|---|
| 1 | **flush 同步**（better-sqlite3 是同步 API） | 简单；5s 一次性写所有队列；典型 50-200 行几十 ms 内完成 |
| 2 | **不在 tick 之外动 SQLite** | record 调用只入内存队列；SQLite 文件 lock 只发生在 flush 时；避免争用 |
| 3 | **WAL 模式 + synchronous=NORMAL** | 写不阻塞读；崩溃后 WAL replay 不丢已 commit 数据；性能开销最小 |
| 4 | **flush 整体一个 transaction** | 失败时 rollback；不会留半套数据 |
| 5 | **崩溃丢失窗口最多 5s** | 接受；硬要 0 丢失需 per-event sync write，吞吐降一个量级 |
| 6 | **flush 频率可配** | `config.json.historyFlushMs?: number`，默认 5000 |
| 7 | **DB 大小监控** | 每小时 `pragma page_count * page_size`；超 500MB 触发 warn log + 写一条 events |

### 3.5 transcript 重读的 idempotency

daemon 重启时 `TranscriptWatcher.start()` 从 offset=0 重读整个 transcript（v0.5.1 Bug A 的修法）。意味着：
- 所有历史 TOOL_USE 会重新 record —— PK 联合索引 + `INSERT OR IGNORE` 保证一行不会插两次
- 所有历史 USAGE 会刷 registry → record session → `INSERT OR REPLACE`，最终值收敛
- 历史 alert 事件由 `recordAlert` 即时入队，下次 flush 落到 events 表 —— 重启**不**丢历史，但**可能**丢最后 5s 内 fire 过尚未 flush 的告警（≤5s 数据丢失窗口，跟其他表一致）

graceful shutdown 路径 `historyStore.close()` 内部先 flush 再 close —— SIGTERM / `process.on('exit')` 都能触发；SIGKILL / 断电不能。

---

## 4 · API 端点设计

新增前缀 `/api/history/*`，全部 **GET**（除 clear），全部返回聚合好的 JSON：

### 4.1 端点清单

| 端点 | 用途 | 关键参数 |
|---|---|---|
| `GET /api/history/trends?days=30` | Trends tab + Overview Sparkline 数据源之一 | `days` (default 30, max 90) |
| `GET /api/history/top?metric=…&dimension=…&days=30&limit=10` | Top tab | metric ∈ {cost,tokens,tools} × dimension ∈ {project,tool,session} |
| `GET /api/history/projects?days=30` | Projects tab | `days` |
| `GET /api/history/sessions?from=&to=&limit=100` | 通用 session 列表 | `from / to` ms epoch |
| `GET /api/history/usage-snapshots?days=30` | 5h/7d 历史 trend（Trends tab 第二屏） | `days` |
| `GET /api/history/sparkline?metric=cost\|ctx&days=1&bucket=hour\|minute` | Overview 底部双 Sparkline | metric + days + bucket |
| `POST /api/history/clear` | 一键清空所有历史表 | 需 Origin guard |

### 4.2 响应 shape 示例

**`GET /api/history/trends?days=30`**：
```json
{
  "from": 1776390000000,
  "to":   1779068400000,
  "buckets": [
    { "date": "2026-04-19", "cost": 12.34, "inputTokens": 1500000, "outputTokens": 80000,
      "cacheReadTokens": 12000000, "cacheCreationTokens": 200000, "sessions": 3 },
    { "date": "2026-04-20", "cost": 8.10, "inputTokens": 0, "outputTokens": 0,
      "cacheReadTokens": 0, "cacheCreationTokens": 0, "sessions": 0 }
  ],
  "totals": { "cost": 234.56, "sessions": 67, "cacheHitRate": 0.85 }
}
```

底层 SQL（伪）：
```sql
SELECT
  date(started_at/1000, 'unixepoch') as date,
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
```

**`GET /api/history/top?metric=cost&dimension=project&days=30&limit=10`**：
```json
{ "items": [
  { "key": "/Users/me/work/big-project", "cost": 89.12, "sessions": 12 },
  { "key": "/Users/me/oss/claude-cockpit", "cost": 45.67, "sessions": 23 }
] }
```

底层：
```sql
SELECT COALESCE(project_dir, cwd) as key,
       SUM(total_cost)            as cost,
       COUNT(*)                   as sessions
FROM sessions
WHERE started_at >= ?
GROUP BY 1
ORDER BY cost DESC
LIMIT ?
```

**`GET /api/history/sparkline?metric=cost&days=1&bucket=hour`**：
```json
{ "buckets": [
  { "t": 1779030000000, "v": 1.23 },
  { "t": 1779033600000, "v": 0.45 }
] }
```

**Sparkline 聚合规则**：
- `metric=cost`：每个 bucket 是 `SUM(total_cost)`，session 归属于 `started_at` 所在 bucket（不按时长在 bucket 间摊销 —— 视觉化近似，简化 SQL）
- `metric=ctx`：每个 bucket 是 `AVG(ctxPct)` over sessions whose `started_at` falls in that bucket。空 bucket 返回 `v=0`（前端可选渲染为间断）
- 空 buckets 仍然返回（连续时间轴），便于 µPlot 直接绘制
- bucket 时间用 SQLite `strftime('%Y-%m-%d %H', ...)` 切分，returns local-time bucket（避免 UTC 偏移）

**`GET /api/history/usage-snapshots?days=30`**：
```json
{ "snapshots": [
  { "ts": 1779001234567, "fiveHourPct": 23, "sevenDayPct": 12 }
] }
```

### 4.3 ApiContext 扩展

`packages/daemon/src/api/routes.ts`：

```ts
export interface ApiContext {
  registry: SessionRegistry
  platform: PlatformActions
  port: number
  request?: IncomingMessage
  alerts?: AlertStore
  events?: EventBuffer
  history?: HistoryStore     // ← v0.9 新增
}
```

路由实现拆出到 `packages/daemon/src/api/history-routes.ts`（避免 routes.ts 继续膨胀）：

```ts
// In routes.ts handleApiRequest():
if (url.startsWith('/api/history/')) {
  return handleHistoryRequest(method, url, ctx)
}
```

### 4.4 关键决定

| # | 决定 | 理由 |
|---|---|---|
| 1 | 全部 GET，clear 用 POST | 历史是只读视图；唯一变更操作单独 POST |
| 2 | 查询参数 default + 上限（`days <= 90`） | 防 SQL 失控；前端不必传齐 |
| 3 | 时间桶用 `date(...)` / `strftime` 在 SQLite 端做 | 让数据库利索；前端拿到的就是显示态 |
| 4 | `top` 的 `metric × dimension` 矩阵在一个端点 | 6 种组合（cost / tokens / tools × project / tool / session）共用 SQL |
| 5 | Sparkline 单独端点 | Overview 高频刷新；保持 payload 最小 |
| 6 | `clear` 需 Origin guard | 跟 `*-redirect` 一样防 CSRF；UI 加 confirm modal 兜底（v0.9 不在端点层做） |
| 7 | 错误返回 `{error: string}` + 400/500 | 跟现有 routes 一致 |

---

## 5 · Dashboard 改动

### 5.1 路由树

```
dashboard/
├── /                         Overview （现有；Sparkline 改真数据）
├── /sessions/$sessionId      详情页（现有）
└── /history                  ← NEW
        ├── ?tab=trends         (default)
        ├── ?tab=top
        └── ?tab=projects
```

3 tab 共享一个 route，state 走 `?tab=` query param（TanStack `validateSearch` 验枚举）。后退按钮、分享链接都直达指定 tab。

### 5.2 新组件清单

| 文件 | 责任 |
|---|---|
| `packages/dashboard/src/routes/history.tsx` | Route 定义 + tab 切换布局 |
| `packages/dashboard/src/components/HistoryTabs.tsx` | 三段式 tab bar |
| `packages/dashboard/src/components/history/TrendsTab.tsx` | 30 天 daily cost 柱图 + cache rate 折线 + 5h/7d 趋势 |
| `packages/dashboard/src/components/history/TopTab.tsx` | metric × dimension 选择器 + 横向 bar 列表 |
| `packages/dashboard/src/components/history/ProjectsTab.tsx` | 项目卡片（cost / sessions / tokens 列） |
| `packages/dashboard/src/hooks/useHistory.ts` | fetch helpers: `useTrends(days)` / `useTop(...)` / `useProjects(days)` / `useUsageSnapshots(days)` / `useSparkline(metric, days, bucket)` |
| `packages/dashboard/src/components/Sparkline.tsx` | 不动，只换 data 来源 |
| `packages/dashboard/src/routes/index.tsx` | ← MODIFY，移除 `mockCost24` / `mockCtx24`，改用 `useSparkline` |
| `packages/dashboard/src/components/Sidebar.tsx` | ← MODIFY，新增 History 链接 |

### 5.3 视觉骨架

**Trends（默认）**：
```
┌────────────────────────────────────────────────────────────┐
│ Last 30 days · totals  $234.56 · 67 sessions · 85% cache  │
├────────────────────────────────────────────────────────────┤
│ Daily cost                                                 │
│ ▆▂▄▅▃▇▆▂▄▇▆▃▅▇▆▂▄▅▃▇▆▂▄▇▆▃▅▇▆▂                            │
├────────────────────────────────────────────────────────────┤
│ Cache hit rate                                             │
│ ─╱╲─╲╱─╱╲╲╱─╱╲╱─╱╲─╲╱─╱╲╲╱─╱╲╱─╱╲                          │
├────────────────────────────────────────────────────────────┤
│ Subscriber usage (snapshots every change)                  │
│ 5h ─╱╲─...                                                 │
│ 7d ╱──╲╱──...                                              │
└────────────────────────────────────────────────────────────┘
```

**Top**：
```
Metric: ( cost ) ( tokens ) ( tools )     Dimension: ( project ) ( tool ) ( session )

big-project        ████████████████  $89.12   12 sessions
claude-cockpit     ██████████        $45.67   23 sessions
followme-qa        ██████            $24.10   8 sessions
```

**Projects**：
```
big-project
/Users/me/work/big-project
$89.12  ·  12 sessions  ·  6.2M tokens  ·  last 2h ago

claude-cockpit
/Users/me/oss/claude-cockpit
$45.67  ·  23 sessions  ·  4.1M tokens  ·  last 12m ago
```

### 5.4 Overview Sparkline 改动（极小）

`routes/index.tsx` 末尾两个面板：
- 前: `<Sparkline data={[xs24, mockCost24]} color="#73bf69" />`
- 后: `const { buckets } = useSparkline('cost', 1, 'hour'); <Sparkline data={[buckets.map(b=>b.t), buckets.map(b=>b.v)]} color="#73bf69" />`

mock 数据生成代码 (`mockCost24` / `mockCtx24`) 删掉。

### 5.5 风格一致

跟现有 Overview / 详情页同 Tailwind tokens（`bg-cockpit-panel`、`border-cockpit-line`、`text-cockpit-muted`、`palette.info/ok/warning/crit` 阈值），µPlot 继续 Grafana 风。

---

## 6 · 保留 / 清理 / cost-spike 基线迁移

### 6.1 90 天滚动清理

新增 `packages/daemon/src/history/cleanup.ts`：

```typescript
export function runCleanup(store: HistoryStore, retentionDays: number): { deleted: Record<string, number> } {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const deleted: Record<string, number> = {}
  store.db.transaction(() => {
    deleted.sessions        = store.db.prepare('DELETE FROM sessions        WHERE started_at < ?').run(cutoff).changes
    deleted.tool_calls      = store.db.prepare('DELETE FROM tool_calls      WHERE ts         < ?').run(cutoff).changes
    deleted.events          = store.db.prepare('DELETE FROM events          WHERE ts         < ?').run(cutoff).changes
    deleted.usage_snapshots = store.db.prepare('DELETE FROM usage_snapshots WHERE ts         < ?').run(cutoff).changes
  })()
  return { deleted }
}
```

调度走简单"算到下个本地 00:00 的毫秒数"模式（不引入 cron 依赖）：

```typescript
function msUntilNextLocalMidnight(now: number): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)              // 跳到下一日 00:00
  return d.getTime() - now
}

let cleanupTimer = setTimeout(function tick() {
  const result = runCleanup(historyStore, cockpitCfg.retentionDays ?? 90)
  console.log('[cockpit] cleanup:', result.deleted)
  cleanupTimer = setTimeout(tick, msUntilNextLocalMidnight(Date.now()))
}, msUntilNextLocalMidnight(Date.now()))
```

| 决定 | 说明 |
|---|---|
| 本地时间 00:00 | 比 UTC 直观；跟 Anthropic 7d 周配额自然对齐用户作息 |
| Default 90 天 | 主 spec 指定；`config.json.retentionDays?: number` 可调 |
| 不做 `VACUUM` | WAL + `auto_vacuum=INCREMENTAL` 已够；强制 VACUUM 持锁，没必要 |
| 清理日志走 console | 不需要额外端点；daemon stdout 已被外层捕获 |
| 错误不 bubble | cleanup 失败只 log，下次重试 |

### 6.2 启动期"补 cleanup"

daemon 启动时立即跑一次 `runCleanup(...)`，处理 daemon 长时间未启动导致跨日错过 00:00 tick 的情况。

### 6.3 cost-spike 基线迁移

**现状（v0.5.x）**：`RuleEngine` 内存维护 `totalCost / totalActiveSec`；daemon 重启清零；session ≥ 30min 才参与；spec §5 R11 显式标记简化版。

**v0.9 改成**：

```typescript
// In RuleEngine.tick(), replace updateBaseline()'s in-memory roll with:
const baseline = ctx.historyStore.computeBaselinePerSecond({
  now,
  windowDays: 7,
})
```

SQL：
```sql
SELECT
  SUM(total_cost) /
  SUM(CASE
        WHEN ended_at IS NOT NULL THEN (ended_at - started_at) / 1000.0
        ELSE (last_update - started_at) / 1000.0
      END) AS per_second
FROM sessions
WHERE started_at >= ? AND total_cost > 0
```

| 决定 | 说明 |
|---|---|
| 窗口 7 天 | 周配额一个 cycle；避免被单日异常拉偏 |
| live session 用 `last_update` 替代 `ended_at` | 不丢正在跑的 session 成本 |
| `total_cost > 0` 过滤 | 排除还没有 cost 数据的 session 噪声 |
| baseline 每次 tick 重查 | 7 天数据规模小（<1000 行），<5ms；不缓存避免一致性问题 |
| 移除"session ≥ 30min 才算"早期 noise gate | SQLite 历史足够稳定后不再需要 |
| `baseline = 0` 仍短路（首次启动 + 空库） | 不误报 |

**RuleContext 改造**：

```typescript
// types.ts — replace rolling with history accessor
export interface RuleContext {
  now: number
  recentEvents: readonly TranscriptEvent[]
  history: { perSecondCostAvg7d: number }    // ← was: rolling: { perSecondCostAvg: number }
  config: RuleConfig
}
```

`cost-spike.ts` 改一行用 `ctx.history.perSecondCostAvg7d`；`engine.ts` 不再维护 `totalCost / totalActiveSec` 状态（删 25 行）。

### 6.4 隐私 + 删除按钮

**`POST /api/history/clear`** —— 一键清空所有历史表，dashboard 设置区放一个按钮：

```typescript
const clear = url.match(/^\/api\/history\/clear$/)
if (method === 'POST' && clear) {
  if (!checkOriginOk(ctx.request, ctx.port)) return json(403, { error: 'origin denied' })
  ctx.history?.clearAll()
  return json(200, { ok: true })
}
```

| 决定 | 说明 |
|---|---|
| 需要 Origin guard | 跟 `*-redirect` 一样防 CSRF |
| 不分表删 | 用户视角是"清空历史"，原子操作 |
| 无 body 二次确认（v0.9） | dashboard 端加 confirm modal；端点保持简单 |

### 6.5 文件路径 + 备份建议

`~/.claude-cockpit/cockpit.db`、`cockpit.db-wal`、`cockpit.db-shm` 三个文件。README 加一句："Want to back up your history? `cp ~/.claude-cockpit/cockpit.db* /your/backup/`" —— 简单文件级备份就够，daemon 不主动做。

---

## 7 · 风险与应对（v0.9 增量）

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| **R15** | better-sqlite3 native build 在某些环境（Windows / 老 Node / Alpine glibc）失败 | 中 — 装不上等于 v0.9 全跑不起来 | (a) 锁版本到当前 LTS 兼容范围（`better-sqlite3@^12`）；(b) daemon 启动检测 SQLite 可用性，失败时 console.error 并**禁用 HistoryStore**（registry 仍正常工作，仅历史不可用），dashboard 的 `/history` 显示 friendly fallback "History unavailable — install failed". |
| **R16** | 长期累积导致 DB 巨型化（重度用户超 1GB） | 中 | (a) cleanup 90 天滚动是主防线；(b) 每小时检查 `page_count * page_size`，超 500MB 时 `console.warn` 并写一条 events row 让用户感知；(c) `POST /api/history/clear` 一键清空兜底 |
| **R17** | 5s 批量 flush 期间 daemon 崩溃丢数据 | 低 | 接受（§1 不变量已写明 ≤5s 丢失窗口）；graceful shutdown 通过 SIGTERM 钩子能正常 flush；SIGKILL 不能 —— 用户体感影响极小 |
| **R18** | transcript 重读时大量 `INSERT OR IGNORE` 性能 | 低 | PK 联合索引让冲突检测 O(log n)；批量 transaction 内 1000 行 <50ms。实测如有问题就 chunk insert |
| **R19** | tz 边界导致 daily cleanup 跑 25h / 23h（夏令时） | 低 | `setHours(24,0,0,0)` 本身处理本地时间正确切日；DST 切换日 cleanup 仍每日跑一次（间隔变 23h/25h）。可接受 |
| **R20** | cost-spike 用 7d 窗口后 noise 增加 | 中 | (a) 7d 数据点比单 session rolling 稳定；(b) 默认 multiplier 仍 2.0；(c) `config.json.costSpikeMultiplier` 可调；(d) 单测覆盖 7d window 边界（空库 / 1 session / 满库） |
| **R21** | `POST /api/history/clear` 误点清空一切 | 低 | Origin guard 防 CSRF；dashboard 按钮加 confirm modal；用户可文件备份 `cp cockpit.db*` 兜底 |

---

## 8 · 测试策略

| 层级 | 范围 | 用例数 |
|---|---|---|
| 单测 | `HistoryStore` 各 record / flush / clear / computeBaseline + migration 启动幂等 | ≈ 16 |
| 单测 | 6 个查询方法（trends / top / projects / sparkline / usage-snapshots / sessions）—— 用内存 SQLite 装 fixture + 断言聚合结果 | ≈ 12 |
| 单测 | `runCleanup` 边界（空表 / 全过期 / 部分过期 / 跨表事务） | ≈ 4 |
| 单测 | cost-spike 新版 7d 窗口（空库 / live session / 跨 retention 边界） | ≈ 5 |
| 单测 | `/api/history/*` 端点（query 参数校验 / 错误码 / origin guard） | ≈ 12 |
| 单测 | dashboard 3 个 tab 组件 + `useHistory` hook（vitest + RTL + fetch mock） | ≈ 8 |
| 集成 | 端到端：daemon 启动 → 注入合成事件 → flush → query trends → 断言 buckets | 1 |
| 集成 | daemon 重启幂等：跑一遍 → kill → 重启 → 重读 transcript → 断言 tool_calls 行数不翻倍 | 1 |
| 回归 | 现有 209 + N 新测全过 | 必须 |

新增大约 **58 个测试**。

---

## 9 · 验收清单

- [ ] daemon 首次启动建库 + 4 表 + 索引 + `schema_version=1`（fresh install + 已有 db 各测一次）
- [ ] 5s flush 后查 `SELECT COUNT(*)` 4 张表都有数据
- [ ] graceful shutdown 后立刻重启，未 flush 数据可恢复（WAL 体现）
- [ ] `/history` 三 tab 都能渲染真数据，查询 < 200ms（30 天典型用户）
- [ ] Overview Sparkline 不再是 mock —— `useSparkline` 拿真数据
- [ ] cost-spike 用 7d 窗口正确触发；空库时不误报
- [ ] cleanup 跑一次后过期数据消失；DB 文件大小回落
- [ ] `POST /api/history/clear` 真清空所有表
- [ ] better-sqlite3 装不上场景：daemon 不崩；`/history` 返回 fallback；Overview / 详情页正常工作
- [ ] 209 + 58 单测 + e2e 全绿
- [ ] typecheck 跨 4 个 workspace 干净
- [ ] CI 矩阵（mac + ubuntu）通过 prebuilt binary 验证
- [ ] README 加 `## What you get (v0.9 beta)` 段 + `Backup history` 一行
- [ ] 截图：`/history` 三 tab + 真 Sparkline Overview

---

## 附录 · 已锁定决策快照

1. 数据层 = SQLite (better-sqlite3 WAL)，跟随主 spec §5.3；不走 JSONL append-only；不开全量 transcript 归档
2. v0.9 范围 = Top + Trends + Projects + Sparkline 接真数据（用户明确要求 4 块并行）
3. Schema = 4 表（sessions / tool_calls / events / usage_snapshots）+ schema_meta 版本表；扩字段 cacheCreation / taskCount / project_dir
4. 写入模式 = in-memory queue + 5s 批量 flush + transactional commit + graceful shutdown sync flush
5. 保留期 = 90 天滚动，本地 00:00 daily cleanup；可配 `retentionDays`
6. cost-spike 基线 = 迁移到 SQLite 7-day 窗口；删 in-memory rolling；移除 30min noise gate
7. tool_calls.duration_ms 不入 v0.9（需 tool_result 配对，留 v0.9.x）
8. `/alerts/feed` 不入 v0.9（不顺路做）
9. `POST /api/history/clear` 用 Origin guard；dashboard 端加 confirm modal；端点本身不要求 body
10. better-sqlite3 装失败时 daemon 不崩，历史功能 degrade
