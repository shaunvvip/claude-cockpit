# claude-cockpit v0.5 (Phase 2) · 设计 Spec

| 字段 | 值 |
|---|---|
| 项目 | `claude-cockpit` |
| 里程碑 | v0.5 (Phase 2 / Beta) |
| 上一里程碑 | v0.1 alpha（Phase 0+1） |
| 日期 | 2026-05-15 |
| 作者 | shuliuyang (shaun@dupoin.com) |
| 协作 | Claude Opus 4.7 |
| 关联 spec | [`2026-05-15-claude-cockpit-design.md`](./2026-05-15-claude-cockpit-design.md)（总体设计） |
| 状态 | ✅ 已实现并发版（v0.5.0-beta → v0.5.4-beta，2026-05-15 ~ 2026-05-18） |

---

## 1 · 范围与不变量

v0.5 的核心目标：**把 cockpit 从"只读看板"变成"能动手 + 会提醒"**。

### 1.1 入选 / 不入选

| 类别 | v0.5 入选 | 推后 |
|---|---|---|
| **后端模块** | `RuleEngine` + 4 内置规则；`ActionDispatcher` 5 个动作收完；`TranscriptWatcher` 扩展 FILE_EDIT 事件；platform 通知 / openFile / clipboard / focusTerminal 实现 | SQLite 历史（Phase 3）；MCP/Tool 详细统计（Phase 3） |
| **Dashboard 页面** | 新增 `/sessions/:id` 详情页（Header + CTX 曲线 + Tool 5min 柱图 + Todos + Event timeline + 控制按钮） | `/history` `/mcp` `/alerts/*` `/settings` |
| **告警 UI** | 仅系统通知，点击 deep-link 跳 `/sessions/:id?alert=<ruleId>`；详情页 `AlertBanner` 高亮 | `/alerts/feed` `/alerts/rules` |
| **告警可配性** | 4 条**默认全开**；`~/.claude-cockpit/config.json` 手写 `disabledRules: ["loop-detect"]` 兜底；阈值少量可调（如 `loopDetectThreshold`） | 可视化规则编辑器 |
| **statusline** | `[stop]` `[file]` OSC 8 链接真正落地（v0.1 是脚手架） | 新预设 / 快捷键扩展 |

### 1.2 不变量（验收门槛）

1. 单击系统通知 → 浏览器在 `/sessions/:id` 高亮对应规则上下文，全闭环 < 1s
2. 单击状态行 `[stop]` → 当前 turn 在 < 500ms 内中断（等价于按 Esc）
3. macOS 没授予通知权限时，daemon 不崩溃，crash.log 记录一次，规则继续跑但通知静默；WS `ALERT` 帧仍发，dashboard 内 toast 仍可见
4. 4 条规则按 `${sessionId}:${ruleId}` 去重，10min 内只触发一次
5. 已有 87 单测 + 2 e2e 全数继续通过；新增测试覆盖见 §6

---

## 2 · 四个垂直切片

每切片是一个可演示态（独立 commit 或一组耦合 commits）。

### Slice 1 · 单规则 + 通知 + 详情页骨架（最大风险卸载点）

**目标**：`ctx-high` 一条规则从触发到点击通知跳详情页，链路打通。

- 后端：新建 `packages/daemon/src/rules/`，骨架 `RuleEngine` + 规则 `ctx-high`（10s tick / 去重表）
- 后端：`platform/macos.ts` + `platform/linux.ts` 增加 `notify({ title, body, deepLink })` 实现（`osascript` / `notify-send`）
- 后端：deep-link `http://localhost:PORT/sessions/<id>?alert=ctx-high`
- 前端：新增 TanStack Router 路由 `/sessions/:id`，仅 Header + 占位面板；从 query string 读 `alert` 显示 `AlertBanner`
- 测试：RuleEngine 单测（mock registry / clock）；平台 notify 单测（mock command exec）；e2e 跑通
- **暴露并解决的风险**：R7 macOS 通知权限首次弹窗 UX

### Slice 2 · TranscriptWatcher 扩展 + 剩 3 条规则

**目标**：cost-spike / loop-detect / subagent-stuck 全部跑起来。

- 后端：`TranscriptEvent` 扩增 `FILE_EDIT { path, tool, ts }`（解析 `tool_use.input.file_path` for Edit/Write/Read）
- 后端：`SessionState` 增加 `lastEditPath?` + `lastEditTs?`，供 `[file]` 跳转与 loop-detect 共用
- 后端：实现 3 条规则
  - `cost-spike`：基线 `baselinePerSecond = totalCostAcrossSessions / totalActiveSecondsAcrossSessions`（daemon 启动以来累计，记在 RuleEngine 内）；session 必须运行 ≥ 30min 才参与；触发条件 `(session.cost - session.costAt(now - 300s)) / 300s > baselinePerSecond × 2.0`
  - `loop-detect`：同一 `path` 10min 内 Edit/Write 事件 > **8 次**（默认阈值放宽到 8，spec §5 解释）
  - `subagent-stuck`：最近 `TOOL_USE name='Task'` 距今 > 5min，且此后无任何 TOOL_USE
- 测试：每条规则 3-5 个用例（命中 / 不命中 / 去重 / 边界）

### Slice 3 · ActionDispatcher 剩 4 个动作 + statusline 链接落地

**目标**：状态行 `[stop]` `[file]` 真能用。

- 后端：完善 `api/routes.ts`
  - `POST /api/sessions/:id/interrupt` → 先 `readlink /proc/<ppid>/exe`（Linux）/ `ps -p <ppid> -o comm=`（mac）验证命令名含 `claude` → `kill -SIGINT ppid`；不匹配返回 `422 stop-unavailable`
  - `POST /api/sessions/:id/open-file` → 用 `lastEditPath` → `platform.openFile(path)`
  - `POST /api/sessions/:id/copy-info` body=`{ field: 'sessionId'|'cost'|'transcriptPath'|'cwd' }` → `platform.clipboardWrite(...)`
  - `POST /api/sessions/:id/focus-terminal` → `platform.focusTerminal(ppid)`
- 后端：`platform/macos.ts` `platform/linux.ts` 增加 `focusTerminal` 实现（其他动作已就位）
- 前端：`SessionCard` 控制按钮区接 4 个 fetch POST；URL deep-link 直达
- statusline：OSC 8 链接走 `GET /api/sessions/:id/interrupt-redirect` —— daemon GET 端点内部转 POST 后 302 回 dashboard，避免要求终端注册自定义 scheme
- 测试：routes 单测（happy / 404 / 422）+ 平台抽象单测（mock exec）

### Slice 4 · 详情页填充

**目标**：`/sessions/:id` 从骨架变成 spec §4.3 描述的完整布局。

- 前端：四个面板组件
  - `CtxChart` µPlot 实时曲线（环形 60 点）
  - `ToolBarChart` 最近 5min 工具调用柱图（按 tool 名分组）
  - `TodosPanel` 复用 Overview 已有的 todos 渲染
  - `EventTimeline` 全宽事件流（USAGE / TOOL_USE / FILE_EDIT 时间序）
- 后端：daemon 暴露 `GET /api/sessions/:id/events?since=<ts>` 拉 EventBuffer 内容（每 session 200 条 FIFO）
- 后端：复用现有 WS 广播实时推送新事件
- 测试：每个面板组件单测（vitest + RTL）

---

## 3 · 模块结构与新增文件

```
packages/
├── daemon/src/
│   ├── rules/                          ← 新建
│   │   ├── engine.ts                   RuleEngine（10s tick / 去重表）
│   │   ├── engine.test.ts
│   │   ├── ctx-high.ts
│   │   ├── ctx-high.test.ts
│   │   ├── cost-spike.ts
│   │   ├── cost-spike.test.ts
│   │   ├── loop-detect.ts
│   │   ├── loop-detect.test.ts
│   │   ├── subagent-stuck.ts
│   │   ├── subagent-stuck.test.ts
│   │   └── types.ts                    Rule interface + AlertEvent + RuleContext
│   ├── api/
│   │   └── routes.ts                   ← 扩，新增 interrupt / open-file / copy-info / focus-terminal / events / interrupt-redirect
│   ├── platform/
│   │   ├── index.ts                    ← 扩 PlatformActions 接口
│   │   ├── darwin.ts                   ← 扩 notify / openFile / clipboard / focusTerminal
│   │   └── linux.ts                    ← 扩 同上
│   ├── transcript-watcher.ts           ← 扩 FILE_EDIT 事件提取
│   ├── event-buffer.ts                 ← 新建 200 条 FIFO，每 session 一个
│   ├── alert-store.ts                  ← 新建 recentAlerts 环形缓冲（50 条）
│   └── main.ts                         ← wire RuleEngine + EventBuffer + AlertStore
├── shared/src/
│   ├── session-state.ts                ← 扩 lastEditPath / lastEditTs
│   └── protocol.ts                     ← 扩 ALERT WS 帧
├── statusline/src/
│   └── osc8-links.ts                   ← 改，URL 换成 /api/.../interrupt-redirect、/.../open-file-redirect
└── dashboard/src/
    ├── routes/
    │   └── sessions.$sessionId.tsx     ← 新建（TanStack Router 文件路由）
    └── components/
        ├── CtxChart.tsx                ← 新建
        ├── ToolBarChart.tsx            ← 新建
        ├── TodosPanel.tsx              ← 新建（或抽自 Overview）
        ├── EventTimeline.tsx           ← 新建
        └── AlertBanner.tsx             ← 新建（从 ?alert= 高亮）
```

### 3.1 关键接口

```ts
// rules/types.ts
export type RuleId = 'ctx-high' | 'cost-spike' | 'loop-detect' | 'subagent-stuck'

export interface AlertEvent {
  ruleId: RuleId
  sessionId: string
  ts: number
  title: string
  body: string
}

export interface RuleContext {
  now: number
  recentEvents: TranscriptEvent[]              // 由 EventBuffer 切片提供
  rolling: { perHourCostAvg: number }          // 全局基线，cost-spike 用
}

export interface Rule {
  id: RuleId
  evaluate(s: SessionState, ctx: RuleContext): AlertEvent | null
}

// platform/index.ts
export interface PlatformActions {
  platform: 'darwin' | 'linux'
  openUrl(url: string): Promise<void>            // 已存在
  openFile(path: string): Promise<void>          // 已存在
  clipboardWrite(text: string): Promise<void>    // 已存在
  notify(args: { title: string; body: string; deepLink?: string }): Promise<void>  // v0.5 新增
  focusTerminal(pid: number): Promise<void>      // v0.5 新增
}
```

### 3.2 RuleEngine 流程

1. 每 10s 遍历 `SessionRegistry.list()`
2. 对每 session 跑 4 条规则的 `evaluate`，命中返回 `AlertEvent`
3. 查去重表 `Map<"${sessionId}:${ruleId}", lastFiredTs>`，10min 内已发过则跳过
4. 命中且未去重：
   - `platform.notify({ title, body, deepLink: 'http://localhost:PORT/sessions/:id?alert=' + ruleId })`
   - WS 广播 `ALERT` 帧到所有 dashboard 连接
   - `AlertStore.push(alert)`（环形缓冲 50 条，供详情页 `/api/sessions/:id/recent-alerts` 查询）

### 3.3 配置加载

- 路径：`~/.claude-cockpit/config.json`，可选；不存在则使用默认
- 形状：
  ```jsonc
  {
    "disabledRules": ["loop-detect"],
    "loopDetectThreshold": 8,
    "ctxHighThresholdPct": 90,
    "costSpikeMultiplier": 2.0,
    "subagentStuckMinutes": 5
  }
  ```
- daemon 启动时读取一次；变更需重启 daemon（不做热重载）

---

## 4 · 数据流增量

```
                                  ┌──────────────────────┐
Claude Code transcript JSONL ──→  │  TranscriptWatcher   │
                                  │  扩: FILE_EDIT 事件   │
                                  └──────────┬───────────┘
                                             ↓
                  ┌──────────────────────────┴───────────────────────┐
                  ↓                                                  ↓
       ┌─────────────────────┐                          ┌──────────────────────┐
       │  SessionRegistry    │                          │  EventBuffer 200 条   │
       │  扩: lastEditPath   │ ← update event ──        │  (供 RuleContext +    │
       │     lastEditTs      │                          │   详情页 EventTimeline)│
       └─────────┬───────────┘                          └──────────┬───────────┘
                 │                                                  │
                 └────────┬───────────────────────────────┬─────────┘
                          ↓                               ↓
                ┌────────────────┐               ┌─────────────────┐
                │  RuleEngine    │  10s tick     │  WsBroadcaster  │
                │  (4 rules)     │   ↓ AlertEvent│  扩: ALERT 帧   │
                └────────┬───────┘               └─────────┬───────┘
                         ↓                                 ↓
              ┌──────────────────┐               ┌──────────────────┐
              │ PlatformActions  │               │  Dashboard WS    │
              │   .notify(...)   │               │  (浏览器实时)     │
              └────────┬─────────┘               └────────┬─────────┘
                       ↓ 用户点击通知                       ↓
              ┌─────────────────────┐            ┌────────────────────┐
              │  openUrl(deepLink)  │ ─────────→ │ /sessions/:id?     │
              │                     │            │  alert=ctx-high    │
              └─────────────────────┘            │  (AlertBanner 高亮) │
                                                 └────────────────────┘
```

### 4.1 新增字段、帧、API

| 位置 | 字段 / 帧 / API | 来源 | 用途 |
|---|---|---|---|
| `TranscriptEvent` | `\| { type: 'FILE_EDIT'; path: string; tool: 'Edit'\|'Write'\|'Read'; ts: number }` | transcript `tool_use.input.file_path` | loop-detect + `[file]` 跳转 |
| `SessionState` | `lastEditPath?: string` | TranscriptWatcher 推送 | `[file]` 跳转、详情页 Header |
| `SessionState` | `lastEditTs?: number` | 同上 | 同上 |
| `RpcFrame` (WS) | `\| { type: 'ALERT'; payload: AlertEvent }` | RuleEngine → WsBroadcaster | dashboard 实时弹横幅 |
| HTTP POST | `/api/sessions/:id/interrupt` | statusline `[stop]` / 详情页按钮 | SIGINT 中断 |
| HTTP POST | `/api/sessions/:id/open-file` | statusline `[file]` / 详情页按钮 | EDITOR 打开 lastEditPath |
| HTTP POST | `/api/sessions/:id/copy-info` body=`{ field }` | 详情页按钮 | clipboard.write |
| HTTP POST | `/api/sessions/:id/focus-terminal` | 详情页按钮 / 通知点击副效果 | 切窗到 Claude Code 终端 |
| HTTP GET | `/api/sessions/:id/interrupt-redirect` | statusline OSC 8 链接 | GET → 内部转 POST → 302 回 dashboard |
| HTTP GET | `/api/sessions/:id/open-file-redirect` | statusline OSC 8 链接 | 同上 |
| HTTP GET | `/api/sessions/:id/events?since=<ts>` | 详情页 EventTimeline 初始拉取 | 拉 EventBuffer 内容 |
| HTTP GET | `/api/sessions/:id/recent-alerts` | 详情页 AlertBanner 备用、初始化时回放 | 拉 AlertStore 内容（按 sessionId 过滤） |

### 4.2 EventBuffer 容量决策

每个 session 200 条事件 FIFO。USAGE/TOOL_USE/FILE_EDIT 加起来约每小时 50-100 条，200 条够回放最近半小时。超容量丢弃 —— 完整历史等 Phase 3 SQLite。

### 4.3 OSC 8 GET → POST 转译

OSC 8 协议要求 URL，浏览器以 GET 打开。但 `[stop]` 需要的是 POST。
- 方案：daemon 新增 GET 端点 `/api/sessions/:id/interrupt-redirect`、`.../open-file-redirect`
- GET 进来后内部执行同 POST 的副作用，然后 302 回 `/sessions/:id`
- 优点：OSC 8 不变形，浏览器最终落 dashboard
- CSRF 防护：daemon 只绑 127.0.0.1；端点检查 `Origin: http://localhost:<本机端口>` 或允许无 Origin（直接 GET 打开）；其他 origin 一律 403

---

## 5 · 风险与应对（v0.5 增量）

| # | 风险 | spec 评级 | 应对 |
|---|---|---|---|
| **R2** | PID 找不到对应的 `claude` 主进程，SIGINT 无效 | 中 | `interrupt` 端点先验证 `ppid` 的 `comm` 含 `claude`（Linux `readlink /proc/<ppid>/exe`，mac `ps -p <ppid> -o comm=`）；不匹配返回 `422 stop-unavailable`；statusline 把 `[stop]` 渲染为灰色 + tooltip。Slice 1 就上验证逻辑。 |
| **R7** | macOS 通知权限首次启动弹系统对话框；用户拒绝则后续静默 | 中 | 首次 daemon 启动跑一次"测试通知"，把权限弹窗时机提前到用户注意力集中于 cockpit 时；失败 → crash.log 一行 + 后续 `notify` 静默；WS `ALERT` 帧仍发，dashboard 内 toast 仍可见。 |
| **R11**（新） | cost-spike 基线在无 SQLite 时不稳 —— daemon 重启即清零 | 新增·中 | v0.5 用软规则：session 必须运行 ≥ 30min 才参与；rolling 平均的窗口是"daemon 启动以来累计 cost / 累计活跃秒"。Phase 3 接入 SQLite 后改 7 天滑窗。README 明写此为简化版。 |
| **R12**（新） | loop-detect 误报 —— 同一文件 10min 内 5 次 Edit 在合理重构中也常见 | 新增·中 | 默认阈值放宽到 **8 次**（spec 写 5）；触发通知文本明示"如果你在重构这是正常的"；用户可在 config.json `loopDetectThreshold` 改。 |
| **R13**（新） | OSC 8 GET-to-POST 重定向被浏览器视为不安全（CSRF 角度） | 新增·低 | daemon 只绑 127.0.0.1；端点检查 `Origin`；其他 origin 一律 403。 |
| **R14**（新） | `focusTerminal(pid)` mac 要 AppleScript（辅助功能权限），Linux 要 `wmctrl`（非标配） | 新增·中 | v0.5 把 `focusTerminal` 作为软失败：失败 crash.log 一行，主链路不受影响。README 标注依赖。 |

---

## 6 · 测试策略

**目标**：v0.5 收尾时 87+N 单测全过，e2e 新增覆盖到 Slice 数 +2 个场景，typecheck 跨 workspace 干净。

| 层级 | 范围 | 工具 | 用例数 |
|---|---|---|---|
| 单测 | 4 条规则各 3-5 例（命中 / 不命中 / 去重 / 边界） | vitest | ≈ 16 |
| 单测 | `platform/macos` `platform/linux` mock exec（断言 `notify` / `focusTerminal` 命令拼装） | vitest + mock `node:child_process` | ≈ 8 |
| 单测 | `TranscriptWatcher` FILE_EDIT 提取（Edit / Write / Read 三 tool） | vitest | ≈ 3 |
| 单测 | `routes.ts` 4 个新 POST + 4 个 GET（重定向 + events + recent-alerts，happy / 404 / 422 / origin 拒绝） | vitest | ≈ 24 |
| 单测 | dashboard 组件 `CtxChart` `ToolBarChart` `EventTimeline` `AlertBanner` 各渲染 + 数据更新 | vitest + RTL | ≈ 8 |
| e2e | Slice 1 完成态：触发 ctx-high → 通知 mock 被调 → WS 收 ALERT → 详情页路由可达 | playwright | 1 |
| e2e | Slice 3 完成态：POST /interrupt → mock kill 被调；POST /open-file → mock openFile 被调 | playwright | 1 |

**回归门**：每切片收尾跑 `npm test && npm run test:e2e && npm run typecheck`，红则不进下一 slice。

---

## 7 · 验收清单（v0.5 release 阈值）

- [ ] 4 条告警规则都能触发系统通知（手动用 mock SessionState 验证）
- [ ] 通知点击后浏览器开到 `/sessions/:id?alert=<ruleId>`，AlertBanner 高亮 < 1s
- [ ] `[stop]` OSC 8 链接点击后 Claude Code 当前 turn 中断（实机 mac + linux 各测一次）
- [ ] `[file]` OSC 8 链接点击后默认编辑器打开最近编辑文件
- [ ] dashboard 详情页 4 个面板都有真实数据（实机跑一个真的 Claude Code session 验证）
- [ ] mac 无通知权限的退化路径走通（手动撤权限测一次）
- [ ] linux 无 `wmctrl` 的退化路径走通（CI 容器自然无）
- [ ] `npm test` + `npm run test:e2e` + `npm run typecheck` 全绿
- [ ] README 增加 v0.5 段：列出新功能 + 系统依赖（osascript / notify-send / wmctrl）
- [ ] 截图：详情页 + 系统通知 popup（macOS 通知中心）—— Twitter / GitHub release 用

---

## 附录 · 已锁定决策快照

1. v0.5 = Phase 2 = A(ActionDispatcher 5 动作) + B(RuleEngine 4 规则) + C(单 session 详情页) + D(平台通知)
2. 告警仅出系统通知，4 条规则默认全开、写死，`/alerts` 页面推后
3. 交付方式：4 个垂直切片，每切片可演示
4. cost-spike v0.5 用进程内 rolling 平均（无 SQLite）；session ≥ 30min 才参与
5. loop-detect 默认阈值放宽到 8（spec 写 5）
6. OSC 8 链接落地：GET → 内部转 POST → 302 回 dashboard 的桥接端点
7. focusTerminal 软失败；mac 通知权限首次提前弹窗
