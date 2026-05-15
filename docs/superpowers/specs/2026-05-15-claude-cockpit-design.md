# claude-cockpit · 设计 Spec

| 字段 | 值 |
|---|---|
| 项目名 | `claude-cockpit` |
| Repo / npm / CLI 名 | `claude-cockpit` |
| 日期 | 2026-05-15 |
| 状态 | 已批准（brainstorm 阶段） |
| 作者 | shuliuyang (shaun@dupoin.com) |
| 协作 | Claude Opus 4.7 |

> 注：本地项目目录沿用 brainstorm 期间的旧名 `claude-hud-plus`，repo 名才是 `claude-cockpit`。后续 push 前可改本地目录名以保持一致。

---

## 1 · 目标与差异化

`claude-cockpit` 是 Claude Code 的 OSS 增强插件，三合一定位：

- **statusline**（沿用 Claude Code 原生状态行 API，对标 claude-hud）
- **dashboard**（浏览器内 Grafana 风的多 session 总览 + 详情 + 历史）
- **控制台**（dashboard 与状态行 OSC 8 链接可触发的交互动作）

### 1.1 对 claude-hud 的超越点（v1 范围）

| 维度 | claude-hud 现状 | claude-cockpit v1 |
|---|---|---|
| Session 数量 | 单 session，每个状态行各自孤立 | **多 session 聚合**：一个 dashboard 看全部 |
| 交互能力 | 纯只读 | **可控**：停止回合 / 跳转文件 / 复制信息 / 系统通知聚焦 |
| 历史数据 | 仅当下 | **SQLite 入库**：30 天趋势 / Top N 排行 / 项目成本聚合 |
| MCP / Tool | 不显示 | **MCP 健康度 + Tool 调用统计** |
| 告警 | 无 | **规则引擎**：4 条内置规则（绕圈 / cost 突增 / ctx 90% / subagent 卡） |
| 入口 | 仅状态行文本 | **OSC 8 超链接 + 快捷键 → 浏览器面板** |

### 1.2 目标用户画像

并行跑 2–5 个 Claude Code 的开发者，被 claude-hud 满足了基础需求但想要"全局视野 + 能动手"。审美参照：Linear / Raycast / Grafana。

### 1.3 非目标（v1 明确不做）

- Session 回放 / timeline scrubbing
- 跨工具监控（Cursor / Claude Desktop / Codex 等）
- PTY 注入类危险操作（注入 slash / 注入 prompt / 工具回滚）
- 杀指定 subagent（v2 候选）
- Windows 支持（v1 仅 macOS + Linux）
- launchd / systemd 服务化（仅懒启动模式）

---

## 2 · 架构与数据流

### 2.1 三层拓扑

```
┌──────────────── 多个 Claude Code 实例 ────────────────┐
│   CC-1 (projects/x)    CC-2 (hermes)    CC-3 (…)     │
│        ↓ stdin JSON          ↓                ↓       │
│  ┌──────────────────────────────────────────────────┐ │
│  │  采集层 · statusline plugin（每 ~300ms fork）     │ │
│  │  · 读 stdin (Claude Code 喂的 JSON)              │ │
│  │  · 读 transcript JSONL                           │ │
│  │  · Unix socket 上报 daemon                       │ │
│  │  · 从 daemon 拿聚合状态 → 输出状态行文本           │ │
│  └──────────────────────────┬───────────────────────┘ │
└────────────────────────────  │ ───────────────────────┘
                              ↓ Unix socket
┌──────────────────────────────────────────────────────┐
│  协调层 · cockpit daemon（懒启动；30min idle 退出）   │
│   SessionRegistry · TranscriptWatcher · RuleEngine   │
│   HTTP+WS API · SQLite · ActionDispatcher            │
└──────────────────────────────┬───────────────────────┘
                              ↓ HTTP + WebSocket
┌──────────────────────────────────────────────────────┐
│  展示层 · Dashboard Web App（Vite + React）           │
│   http://localhost:PORT — WebSocket 实时推送          │
└──────────────────────────────────────────────────────┘
```

### 2.2 关键数据流

1. **实时状态**：statusline plugin 把 Claude Code 喂的 stdin JSON（含 `model / ctx% / cost / current tool`）推到 daemon 的 `SessionRegistry`。同时 daemon 的 `TranscriptWatcher` tail JSONL 补全工具调用细节。**双数据源互补，互为校准**。
2. **聚合下行**：statusline plugin 拿到自己所属 session 的渲染数据 + 全局摘要（"其他 2 个 session 在跑"），输出多行状态文本。
3. **控制路径**：用户在 dashboard / 状态行触发动作 → POST `/sessions/:id/<action>` → `ActionDispatcher` 执行 → 全闭环 < 50ms。
4. **告警路径**：`TranscriptWatcher` 事件 → `RuleEngine` 命中 → `ActionDispatcher.notify(...)` → 系统通知（带 deep-link）。

### 2.3 关键设计取舍

- **Unix socket 而非 TCP**：本机通信、免端口冲突、权限随 UID
- **HTTP 端口随机**：写入 `~/.claude-cockpit/daemon.json`，statusline 和浏览器都从这里读
- **双数据源**：statusline 推送 + JSONL tail 互为冗余，单边断不影响整体

### 2.4 进程与文件

| 名称 | 位置 | 作用 |
|---|---|---|
| Unix socket | `/tmp/claude-cockpit.sock` | statusline ↔ daemon RPC |
| Runtime info | `~/.claude-cockpit/daemon.json` | port / pid / 启动时间 |
| SQLite | `~/.claude-cockpit/cockpit.db` | 历史数据 |
| Config | `~/.claude-cockpit/config.json` | 用户配置 |
| Crash log | `~/.claude-cockpit/crash.log` | 异常追溯 |

---

## 3 · 状态行（statusline）

### 3.1 三档预设

| 预设 | 行数 | 内容 |
|---|---|---|
| Minimal | 1 | `● model · cwd · branch · ctx% · cost · [cockpit]` |
| **Essential（默认）** | 2 | 第 1 行同 Minimal + 进度条 + subs%；第 2 行 tools 计数 / subagent / todos / 3 个 OSC 8 链接 |
| Full | 3 | Essential + cache 命中 + tool 名细分 + MCP 健康灯 + 其他 session 摘要 |

### 3.2 OSC 8 链接集

| 链接 | 触发 |
|---|---|
| `[dash]` | `open http://localhost:PORT/sessions/<id>` |
| `[stop]` | `POST /sessions/<id>/interrupt` → SIGINT |
| `[file]` | 解析 transcript 找最近 Edit/Write 路径 → `$EDITOR <path>` |
| `[copy]` | 弹小菜单：sessionId / cost / transcript path / cwd |
| `[cockpit]` | Minimal 档兜底，跳总览 |

### 3.3 终端能力探测与降级

- **支持 OSC 8**：iTerm2 / Ghostty / WezTerm / Kitty / VS Code / Warp / Alacritty 1.x
- **不支持**：macOS Terminal.app 等 —— 降级显示"[stop ⌃⇧S]"格式，daemon 后台监听全局热键
- **完全无图形**：保留 `/cockpit:open` slash command 兜底

### 3.4 颜色语义（继承 Grafana 配色）

| 色 | Hex | 语义 |
|---|---|---|
| 绿 | `#73bf69` | ok / busy / healthy |
| 黄 | `#f2cc0c` | warning（ctx 60–85% / cache 50–70%） |
| 橙 | `#f4a261` | near-limit（ctx 85–95%） |
| 红 | `#e0524d` | critical（ctx >95% / MCP down / 告警触发） |
| 蓝 | `#5794f2` | info（计数 / tools） |
| 灰 | `#7a8794` | idle / 次要 |

---

## 4 · Dashboard 信息架构

### 4.1 Sitemap

```
claude-cockpit/
├── /                       总览（默认首页）
├── /sessions/:id           单 session 详情
│   ├── live                  实时 tools / todos / ctx 走势
│   ├── transcript            原始 JSONL 浏览（可过滤）
│   └── controls              控制抽屉
├── /history                历史分析
│   ├── trends                30 天 token / cost / cache 趋势
│   ├── top                   最贵 / 最长 / 最多 tool 排行
│   └── projects              按项目成本聚合
├── /mcp                    MCP / Tool
│   ├── servers               每个 MCP server 健康度
│   └── tools                 每个 tool 调用次数 / p50/p95 耗时 / 错误率
├── /alerts                 智能告警
│   ├── rules                 规则配置
│   └── feed                  告警时间线
└── /settings               可视化配置编辑器
```

### 4.2 总览页（默认首页）

- 顶部：5 KPI bar（sessions active / cost 今日 / tokens/s / cache hit / subs used）
- 主区：session 卡片列表，每张含 CTX/Cost/Tools/Todos + 状态 chip（busy / idle / wait）
- 底部：24h cost 趋势 + ctx % 实时双线图（两个并排）

### 4.3 单 session 详情页

- Header：项目 / 模型 / sid / elapsed + 右上角控制按钮（Stop / Open file / Copy ID）
- 三面板：CTX 实时曲线 / Cache hit / Session cost 拆分
- 双面板：Tool calls 最近 5min 柱图 / Todos checklist
- 全宽：Event timeline 最近活动

### 4.4 历史页

- Tab：Trends（趋势） / Top（排行） / Projects（项目聚合）
- 30 天 daily cost 柱图 + 30 天 cache rate 折线
- Top 5 项目本月成本横向条形图

### 4.5 技术栈

| 角色 | 技术 |
|---|---|
| 前端框架 | Vite + React + TypeScript |
| 路由 | TanStack Router |
| 样式 | Tailwind，对齐 Grafana 配色 token |
| 图表 | µPlot（轻量高性能） |
| 实时 | WebSocket（daemon 推送 diff） |
| 构建 | Vite build → daemon 直接 serve 静态产物 |
| 主题 | 默认深色 Grafana 风；提供 light 切换；中英 i18n |

---

## 5 · 五大模块实现要点

### 5.1 SessionRegistry（多 session 聚合）

- **数据结构**：`Map<sessionId, SessionState>` —— 内存中
  - `SessionState { pid, ppid, cwd, model, ctxPct, cost, tools[], todos[], lastUpdate, status }`
- **写入**：statusline plugin 每次刷新发 `UPDATE_SESSION` 帧；daemon 自己的 `TranscriptWatcher` 监听 `~/.claude/projects/*/` 补全工具调用细节
- **过期清理**：60s 无 stdin → `idle`；transcript 5min 无写入 → `closed`，留 last state 给历史
- **跨重启恢复**：daemon 启动时扫已有 transcripts，把今天的 session 状态恢复出来

### 5.2 ActionDispatcher（5 个控制动作）

| 动作 | 实现 |
|---|---|
| Open dashboard | `open <url>`（mac）/ `xdg-open`（Linux） |
| Jump to file | transcript 取最近 Edit/Write 路径 → `${EDITOR:-code} <path>` |
| Copy info | 菜单：sessionId / cost / transcript path / cwd → `pbcopy` / `xclip` |
| Stop turn | 取 statusline 上报的 ppid 链向上找 `claude` **主进程** → `kill -INT`（等价于用户按 Esc；不针对单个 subagent） |
| Notify focus | macOS：`osascript` 通知 + AppleScript 切窗；Linux：`notify-send` + `wmctrl` |

**安全护栏**：所有动作校验 "session owner UID = daemon UID"。

### 5.3 HistoryStore（SQLite 入库）

- **库**：`~/.claude-cockpit/cockpit.db`，`better-sqlite3`（同步 API + WAL 模式）
- **表**：
  ```sql
  sessions(id TEXT PRIMARY KEY, cwd TEXT, model TEXT,
           started_at INTEGER, ended_at INTEGER,
           total_cost REAL, input_tokens INTEGER, output_tokens INTEGER,
           cache_read_tokens INTEGER)
  tool_calls(session_id TEXT, ts INTEGER, tool_name TEXT,
             duration_ms INTEGER, status TEXT)
  events(session_id TEXT, ts INTEGER, event_type TEXT, payload_json TEXT)
  ```
- **写入**：`TranscriptWatcher` 解析 JSONL 增量 → batch insert 每 5s flush；session close 时写最终 row
- **保留期**：默认 90 天；每天 0:00 跑清理任务
- **隐私默认**：**只存元数据，不存 transcript 原文**；settings 可开"全量归档"模式

### 5.4 RuleEngine（智能告警）

内置 4 条规则（用户可禁、可加自定义）：

| 规则 | 条件 | 通知文本 |
|---|---|---|
| `ctx-high` | context 连续 30s > 90% | "考虑 /compact" |
| `cost-spike` | 单 session 5min cost > 历史日均 ×2 | "成本异常" |
| `loop-detect` | 同一文件 10min 读/写 > 5 次 | "可能在绕圈" |
| `subagent-stuck` | Task 子代理运行 > 5min 无 child 工具调用 | "subagent 卡住" |

- **扫描频率**：每 10s 跑一次，基于 `SessionRegistry` 内存
- **去重**：同规则 + 同 session 10min 内只发一次
- **通知载荷**：title + body + deep-link URL（点通知跳 dashboard 对应 session）

### 5.5 McpInspector（MCP / Tool 详情）

- **数据来源**：transcript 的 `tool_use` 事件解析 `name / duration / is_error`；从 Claude Code `settings.json` 读 MCP 配置
- **健康度**：每个 MCP server 最近 5min 是否有成功调用 → `healthy / degraded / down`
- **聚合**：tool 维度的"调用次数 / p50/p95 耗时 / 错误率 / 最近 1h 趋势"
- **配置变更**：filesystem watcher 监听 `settings.json` 刷新

---

## 6 · 配置、生命周期、跨平台

### 6.1 配置 UX（三层）

1. **预设级**：Minimal / Essential / Full
2. **交互级**：`/cockpit:configure` slash command 走 8–10 题向导，问语言（中/英）、保留期、告警开关、快捷键
3. **手动级**：`~/.claude-cockpit/config.json`，所有 advanced 项；configure 命令保留 manual 段不覆写

### 6.2 Slash Commands

| 命令 | 作用 |
|---|---|
| `/cockpit:setup` | 首次安装向导，配 statusline 到 `~/.claude/settings.json` |
| `/cockpit:configure` | 改预设、改告警规则 |
| `/cockpit:open` | 不依赖 OSC 8，直接开 dashboard |
| `/cockpit:status` | 文本输出 daemon 当前状态 |

### 6.3 生命周期（懒启动）

```
状态行首次刷新 → 探测 /tmp/claude-cockpit.sock
  ├── 可连     → RPC 上报
  └── 不可连   → spawn detached daemon（双 fork + setsid）
                  ├── 创建 sock / 监听端口 / 写 daemon.json
                  └── 等 200ms 后 statusline 重试连接

daemon 自检 idle（注意区分两个 idle 概念）：
  · session idle：单个 session 60s 内无 stdin 更新 → SessionRegistry 标记 status=idle
  · daemon idle：所有 session 30 分钟内都没有 stdin 更新 + 当前无浏览器 WebSocket 连接
  daemon 每 60s 跑一次 idle 自检，命中 daemon idle 条件就 graceful shutdown

异常恢复：
  - sock 文件存在但连不上 → 删 sock 重 spawn
  - 端口占用 → 换随机端口、刷 daemon.json
  - panic → 写 crash.log，下次首次刷新自动重启
```

### 6.4 跨平台抽象

`platform/` 模块只暴露 5 个接口：

| 接口 | macOS | Linux |
|---|---|---|
| `notify(title, body, deepLink)` | `osascript` | `notify-send` + libnotify hint |
| `openUrl(url)` | `open` | `xdg-open` |
| `openFile(path)` | `${EDITOR:-code} <path>` | 同 |
| `clipboard.write(text)` | `pbcopy` | `xclip -selection clipboard` |
| `focusTerminal(pid)` | AppleScript 切 iTerm/Terminal | `wmctrl -a` |

**CI 矩阵**：GitHub Actions = macOS-latest + ubuntu-latest。Windows 实现留 `platform/windows.ts` 占位，社区贡献再合并。

### 6.5 安装与卸载

```bash
# 安装
/plugin marketplace add <user>/claude-cockpit
/plugin install claude-cockpit
/cockpit:setup

# 卸载
/plugin uninstall claude-cockpit
~/.claude-cockpit/cleanup.sh   # 删 sock / db / config（README 提供）
```

---

## 7 · MVP 切片与里程碑（5–6 周）

| Phase | 范围 | 产出 | 时间 |
|---|---|---|---|
| 0 · 骨架 | statusline + daemon + dashboard 空壳；双 fork 懒启动；stale-sock 自愈 | 端到端能跑通；无截图价值 | 3–5 天 |
| 1 · Alpha | SessionRegistry 全功能 / Overview 页 / Essential 状态行 / MCP 基础显示 / Linux CI | **v0.1**，README 主图素材 | 1–2 周 |
| 2 · Beta | ActionDispatcher 5 动作 / RuleEngine 4 规则 / mac+Linux 通知 / 单 session 详情页 | **v0.5**，30s 演示视频 | 1 周 |
| 3 · RC | HistoryStore 入库 / `/history` 三 tab / 清理 job | **v0.9**，趋势图素材 | 1 周 |
| 4 · v1.0 | Minimal/Full 预设 / configure 向导 / light theme / 中英 i18n / 单测 60% / README 完善 | **v1.0.0 正式版** | 1 周 |

**关键路径**：Phase 1 必须出 Overview 页好截图 —— 决定能不能拿到第一波 100 star。

---

## 8 · 风险与开放问题

### 8.1 风险与应对

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | Claude Code 内部协议变更 | 高 | 锁 CC ≥ 1.0.80；transcript parser 版本探测 + 兼容层；CI 跑最新 CC 回归 |
| R2 | PID 发现不稳 | 中 | `ppid` 链上溯找 `claude` 进程；找不到则禁用 stop（UI 灰掉） |
| R3 | OSC 8 嵌套 ANSI 兼容性 | 中 | 终端能力表逐个测试；首发挂"已测终端"清单 |
| R4 | JSONL tail 性能 | 中 | 只读 last 5MB + tail；建偏移索引；启动期异步重建 |
| R5 | SQLite 多进程并发 | 低 | WAL 模式 + advisory lock；sock 监听失败即退出（单例） |
| R6 | DB 膨胀 | 中 | 默认 90 天保留 + 每天清理；`cockpit vacuum` 命令 |
| R7 | macOS 通知权限 | 中 | 首次启动检测权限并提示；失败时 fallback 到 dashboard 内 toast |
| R8 | claude-hud 抢做多 session | 中 | Grafana 风视觉 + 控制台是 moat；速度抢跑 |
| R9 | 隐私顾虑 | 中 | 默认不存原文；README 顶部明写"零外发请求"；代码可审计 |
| R10 | 副业精力 vs 工程量 | 高 | 严格守 v1 scope；Phase 1 出货前不接新需求；告警/历史砍简版上线 |

### 8.2 已敲定的开放问题

| # | 问题 | 决定 |
|---|---|---|
| O1 | 许可证 | **MIT** |
| O2 | 仓库归属 | **个人账号**（github.com/`<github-username>`/claude-cockpit，注册前留 placeholder） |
| O3 | 文档站 | **v1 纯 README**，v1.x 后再上 docs site |
| O4 | 测试策略 | 核心模块单测 ≥ 60% + dashboard 跑 smoke |
| O5 | Logo / 品牌 | **Grafana 蓝 `#5794f2` + 字标 `>_ cockpit`**，v1 不做 logo 设计 |
| O6 | i18n | **中 / 英 两套** |

---

## 附录 A · 已锁定决策快照（来自 brainstorm 全过程）

1. 项目定位：statusline + dashboard + 控制台三合一
2. 点击机制：OSC 8 超链接（现代终端） + 键盘快捷键（老终端降级）
3. 分发：OSS 插件，发到 Claude Code 插件市场 + GitHub
4. v1 差异化范围：A 多 session 聚合 / B 实时控制台 / C 历史分析 / D 智能告警 / F MCP-Tool 详情
5. v1 不做：E 回放 / G 跨工具监控 / Windows / launchd 服务化 / PTY hack
6. 技术栈：TypeScript + Node（daemon）/ Vite + React + TS（dashboard）/ better-sqlite3 + µPlot / Tailwind
7. v1 控制动作：1 open dashboard / 2 jump file / 3 copy info / 4 SIGINT stop / 7 notify focus
8. 视觉风格：Grafana 风（密集面板 + 图表 + 数据驱动）
9. 平台：macOS + Linux
10. daemon lifecycle：A 懒启动（30 分钟 idle 自动退出）
11. 名称：claude-cockpit（GitHub repo / npm 包 / CLI 命令同名）

---

## 附录 B · Brainstorm 资产留存

mockup 文件（可作为前端实现参考）：

- `/.superpowers/brainstorm/.../click-mechanism.html` —— OSC 8 vs 快捷键 vs 菜单栏 vs 混合方案对比
- `/.superpowers/brainstorm/.../differentiators.html` —— 7 项差异化卡片
- `/.superpowers/brainstorm/.../architecture.html` —— 拓扑图 + 语言选项
- `/.superpowers/brainstorm/.../control-actions.html` —— 10 个控制动作可行性分析
- `/.superpowers/brainstorm/.../dashboard-style.html` —— Linear / Grafana / macOS 三风格对比
- `/.superpowers/brainstorm/.../statusline-design.html` —— Minimal / Essential / Full 三档预设
- `/.superpowers/brainstorm/.../dashboard-ia.html` —— 总览 / 详情 / 历史三页高保真 mockup

这些 HTML 已 gitignore（在 `.superpowers/` 下），但保留在本地作为实现参考。
