# claude-cockpit v1.0 (Phase 4) · 设计 Spec

| 字段 | 值 |
|---|---|
| 项目 | `claude-cockpit` |
| 里程碑 | v1.0 (Phase 4 / GA) |
| 上一里程碑 | v0.9-beta（Phase 3 SQLite 历史层完成） |
| 日期 | 2026-05-18 |
| 作者 | shuliuyang (shaun@dupoin.com) |
| 协作 | Claude Opus 4.7 |
| 关联 spec | [`2026-05-15-claude-cockpit-design.md`](./2026-05-15-claude-cockpit-design.md)（总体设计） · [`2026-05-15-claude-cockpit-v0.5-design.md`](./2026-05-15-claude-cockpit-v0.5-design.md)（Phase 2） · [`2026-05-18-claude-cockpit-v0.9-design.md`](./2026-05-18-claude-cockpit-v0.9-design.md)（Phase 3） |
| 状态 | 已批准（brainstorm 阶段） |

---

## 1 · 范围与不变量

v1.0 的目标：**从"内部能跑的 beta"转为"公开可发布的 GA"** —— 任何人 `npm install -g claude-cockpit` 一行装上、`claude-cockpit configure` 一步配齐即可用。

### 1.1 入选（默认）

| Workstream | 关键设计选择 |
|---|---|
| **1. npm publish** | 把 monorepo 打成**单包** `claude-cockpit` 发到 npm registry；`bin/claude-cockpit` 是 CLI 入口含 4 个子命令（`start` / `statusline` / `configure` / `status`）；内部 4 workspaces 不单独发包，只在 build 时 bundle 出发布产物 |
| **2. README polish** | 顶部加 Quickstart 三行；v1.0 段补 + `/history` 截图 + light theme 对照截图；Install 段从 git clone 改为 npm i -g；旧流程移到 Develop 段 |
| **3. Configure wizard** | 独立 CLI `claude-cockpit configure`（**非** Claude Code slash command — 解耦于 CC 插件机制）；`@clack/prompts` 8 题向导；写入 `~/.claude-cockpit/config.json`（合并而非覆盖） + 可选 patch `~/.claude/settings.json` |
| **4. Minimal / Full presets** | 三档：Minimal（1 行）/ **Essential（默认）**/ Full（2 行 + cache 命中 + tool 名细分 + 其他 session 摘要） |
| **5. Light theme** | Tailwind tokens 走 CSS `var(--cockpit-*)`，零组件改动；`<html data-theme="light\|dark">` 切换；Sidebar 加切换按钮；`auto`（依 `prefers-color-scheme`）/`light`/`dark` 三态；localStorage 持久化 |
| **6. EN/CN i18n** | `react-i18next` + 2 locale (`en` / `zh-CN`)；Sidebar 加语言切换；**仅 dashboard 翻译**，statusline/通知/CLI 一律英文；~50 keys |
| **7. 覆盖度 audit** | 跑 `vitest --coverage` 摸底；缺口补到加权 ≥ 60%；不追求 file-level 60%（避免脆弱测试） |

### 1.2 不变量（验收门槛）

1. `npm install -g claude-cockpit` 一行装上，无需 git clone
2. `claude-cockpit configure` 一次走完就能初始化所有配置
3. Light/Dark 切换 < 100ms，无 FOUC
4. zh-CN 切换后所有 dashboard 文本切换，刷新页面记忆生效
5. 三档预设可在 wizard 切，也可直接编辑 config.json
6. 现有 267 单测 + typecheck 必须保持绿；新增测试至加权 ≥ 60%
7. Daemon socket 协议 / `~/.claude-cockpit/cockpit.db` schema **零破坏**（保持 v0.9 兼容）

### 1.3 显式不入选 v1.0

- 卸载脚本（用户手工 npm uninstall + 删 `~/.claude-cockpit/` 足够）
- Windows 支持（总 spec 一直显式排除）
- 主题自定义编辑器（只支持 Light/Dark/Auto 三档）
- 第三种语言
- `/alerts/feed` UI 页（events 表已持久化告警，留给 v1.x）
- macOS 通知点击 deep-link 解决（osascript API 限制）
- statusline / 通知 / CLI 的 i18n

---

## 2 · npm publish — 单包打包结构

### 2.1 发布产物布局

```
claude-cockpit/                          (published npm package)
├── package.json                         # name: claude-cockpit, bin, files, dependencies
├── bin/
│   └── claude-cockpit.js                # single entrypoint with subcommands
├── dist/                                # bundled at build time, published
│   ├── cli.js                           # configure / status subcommands
│   ├── daemon.js                        # daemon process
│   ├── statusline.js                    # statusline subprocess
│   └── dashboard/                       # vite build output (HTML + assets)
├── README.md
└── LICENSE
```

### 2.2 CLI 子命令

```
$ claude-cockpit --help

  start         Start daemon (foreground; useful for debugging)
  statusline    Stdin → statusline output (called by Claude Code)
  configure     Interactive wizard to edit ~/.claude-cockpit/config.json
  status        Print daemon state + DB stats + recent commits
  --version     Print version
```

### 2.3 package.json 关键字段

```jsonc
{
  "name": "claude-cockpit",
  "version": "1.0.0-beta",
  "type": "module",
  "bin": {
    "claude-cockpit": "./bin/claude-cockpit.js"
  },
  "files": ["dist", "bin", "README.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "dependencies": {
    "better-sqlite3": "^12",
    "ws": "^8",
    "@clack/prompts": "^0.7"
  }
  // dev-only: tsx, vitest, vite, react, tailwind etc. — NOT in dependencies
}
```

### 2.4 构建管线

新增 `tools/bundle.ts`（用 `esbuild`）：

```
1. esbuild packages/daemon/bin/daemon.ts       → dist/daemon.js
2. esbuild packages/statusline/bin/statusline.ts → dist/statusline.js
3. esbuild packages/cli/bin/cli.ts             → dist/cli.js
4. vite build packages/dashboard               → dist/dashboard/
5. write bin/claude-cockpit.js                 (thin dispatcher, ~15 lines)
```

`bin/claude-cockpit.js`：

```js
#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const cmd = process.argv[2]
const subcommands = {
  start:      'daemon.js',
  statusline: 'statusline.js',
  configure:  'cli.js',
  status:     'cli.js',
}
if (!cmd || cmd === '--help' || cmd === '-h') { /* print help */ ; process.exit(0) }
if (cmd === '--version') { console.log(require('../package.json').version); process.exit(0) }
const target = subcommands[cmd]
if (!target) { console.error(`unknown command: ${cmd}`); process.exit(1) }
await import(join(here, '..', 'dist', target))
```

### 2.5 better-sqlite3 native binding

走 `better-sqlite3@^12` 的 prebuilt-install 机制（v0.9 已验证）。`npm install` 时从 prebuilt CDN 下载对应 mac arm64 / mac x64 / linux x64 的 `.node` 文件。该平台没有 prebuilt（Alpine glibc / Windows / FreeBSD），`tryOpenHistory` 已 graceful degrade。

### 2.6 dashboard 文件 serve

`findDashboardDist()` 已有 fallback 数组。增加一条 sibling 路径 `<bin>/../dist/dashboard`，使 npm 发布产物能被正确找到。

### 2.7 esbuild externals 列表

```ts
external: [
  'better-sqlite3',   // native binding
  'node:*',           // built-in modules
  // NOT external:
  //   '@claude-cockpit/shared'   → resolve from workspaces, bundled
  //   'ws'                       → bundle into daemon.js (avoid runtime resolve)
  //   '@clack/prompts'           → bundle into cli.js
]
```

dev 依赖（`tsx` / `vite` / `react` 等）不参与 bundle，靠 esbuild 默认 platform=node + main 字段解析。

---

## 3 · Configure wizard (`claude-cockpit configure`)

### 3.1 8 题流程

1. **Statusline preset**: Minimal / Essential (default) / Full
2. **Dashboard theme**: Auto (follow `prefers-color-scheme`) / Light / Dark
3. **Dashboard language**: English / 中文 (zh-CN)
4. **Alert rules to enable**: 4 checkboxes (ctx-high / cost-spike / loop-detect / subagent-stuck)
5. **ctx-high threshold** (default 90%): numeric input with bounds (50-100). 其他规则阈值（cost-spike multiplier / loop-detect threshold / subagent-stuck minutes）不在 wizard 里调，留 config.json 手编 —— wizard 不强求功能完整，只覆盖 ≈ 80% 用户的常用配置。
6. **History retention** (days, default 90): numeric input with bounds (7-365)
7. **macOS notification quick check?** (macOS only; Skip / Send test notification)
8. **Patch `~/.claude/settings.json`?** (Skip / Patch it)

### 3.2 新增 workspace

```
packages/cli/
├── package.json
├── bin/cli.ts                       # entry — dispatches by argv[2]
└── src/
    ├── main.ts                       # configure / status dispatcher
    ├── configure.ts                  # the 8-step wizard
    ├── configure.test.ts
    ├── status.ts                     # daemon state + db stats printer
    ├── status.test.ts
    ├── settings-json.ts              # ~/.claude/settings.json patcher
    └── settings-json.test.ts
```

### 3.3 关键决定

| # | 决定 | 理由 |
|---|---|---|
| 1 | `@clack/prompts`，不用 `inquirer` | clack 体积小 5×、彩色 ASCII 边框、键盘体验现代 |
| 2 | Atomic write（写到 `*.tmp` → rename） | 崩溃不留半文件 |
| 3 | 已存在 config.json 时合并而非覆盖 | 保留用户手编字段 |
| 4 | 第 8 题 patch settings.json 是选项不是默认 | 用户可能在多份 settings 间切；强 patch 风险大 |
| 5 | 第 7 题 macOS 通知测试 only-on-darwin | linux 上跳过 |
| 6 | wizard 不重启 daemon | 仅写文件；用户自己重启 CC |
| 7 | 输出 spinner / progress 走 clack 标配 | 体验一致 |

### 3.4 `settings-json.ts`

```typescript
export interface PatchResult {
  patched: boolean
  previousCommand?: string          // backup of the previous statusLine.command
  backupPath?: string               // path of *.bak.cockpit-<ts> file
}
export function patchSettingsJson(path: string): PatchResult
```

流程：
1. 读 `~/.claude/settings.json`（不存在则创建空对象）
2. 备份 `statusLine.command` 到 `*.bak.cockpit-<unix-ts>`
3. 设 `statusLine = { type: 'command', command: 'npx claude-cockpit statusline' }`
4. Atomic write 回去
5. 读回校验 JSON valid（rollback 如不 valid）

### 3.5 `claude-cockpit status` 输出

```
claude-cockpit v1.0.0-beta

Daemon
  pid:        29384
  port:       58003
  uptime:     2h 14m
  started:    2026-05-18 09:24:51

History (SQLite)
  path:       ~/.claude-cockpit/cockpit.db
  size:       3.2 MB
  sessions:   12
  tool_calls: 1,847
  alerts:     3
  oldest row: 2026-04-22 (26 days)

Statusline plugin
  wired up:   ✓  (settings.json.statusLine.command = "npx claude-cockpit statusline")
  preset:     Essential
```

Daemon 不在时输出 `daemon not running (will lazy-start on next CC refresh)`。

---

## 4 · Minimal / Full 预设

### 4.1 三档对比

| 元素 | Minimal | **Essential**（默认） | Full |
|---|---|---|---|
| 行数 | 1 | 2 | 2 |
| Line 1 | `● model · cwd · branch? · ctx X% · [cockpit]` | `● model · cwd · branch? · tools N↑ · subagents ×N? · todos a/b · [dash] [stop] [file]` | 同 Essential + ` · cache R%` |
| Line 2 | — | `ctx X% ████░░ · 5h X% (...) · 7d X% (...)` | `ctx … · 5h … · 7d … · tool: Bash·Read·Edit · others ×N` |
| OSC 8 链接 | 1（`[cockpit]`） | 3（`[dash]/[stop]/[file]`） | 3 |

### 4.2 实现

`renderMinimal` Phase 2 已写好。要新加 **`renderFull`** —— 在 `renderEssential` 基础上扩展：

| 段 | 来源 |
|---|---|
| `cache R%` | `cacheReadTokens / (input+cacheRead+cacheCreation)` |
| `tool: Bash·Read·Edit` | `tools[]` 取前 3 个 distinct name |
| `others ×N` | 来自 daemon 返回的 `otherCount` 字段（见 §4.4） |

### 4.3 配置入口

`packages/statusline/src/main.ts` 顶部读 `config.json.statuslinePreset`：

```ts
import { loadConfig } from './config.js'

const preset = loadConfig().statuslinePreset ?? 'essential'
switch (preset) {
  case 'minimal':   return renderMinimal({...})
  case 'full':      return renderFull({...})
  default:          return renderEssential({...})
}
```

每次 statusline 调用同步读 `~/.claude-cockpit/config.json`（小文件，<5ms IO）。

`CockpitConfig` 扩 `statuslinePreset?: 'minimal' | 'essential' | 'full'`。

### 4.4 "其他 session 数" 数据通道

`GET /api/sessions/:sid` 响应增加 `otherCount: number` 字段（其他活跃 session 的总数 = `registry.list().length - 1`）。Full preset 直接从 fetchSession 返回的 merged 对象拿。零额外 RPC。

### 4.5 测试

- `renderFull.test.ts` 5 例（含/不含 cacheRead、多/单 session、多 tool 名截断、空 tools fallback、preset 切换）
- `main.test.ts` 加 3 例 preset 路径分支

---

## 5 · Light theme

### 5.1 Tokens 走 CSS variable

`styles.css`：

```css
:root {
  --cockpit-bg:     #0e1419;
  --cockpit-panel:  #161b22;
  --cockpit-line:   #30363d;
  --cockpit-text:   #e6edf3;
  --cockpit-muted:  #7a8794;
}

:root[data-theme='light'] {
  --cockpit-bg:     #ffffff;
  --cockpit-panel:  #f6f8fa;
  --cockpit-line:   #d0d7de;
  --cockpit-text:   #1f2328;
  --cockpit-muted:  #6e7781;
}
```

`tailwind.config.ts` colors 改成走 var：

```ts
cockpit: {
  bg:    'var(--cockpit-bg)',
  panel: 'var(--cockpit-panel)',
  line:  'var(--cockpit-line)',
  text:  'var(--cockpit-text)',
  muted: 'var(--cockpit-muted)',
  // 信号色保持 hex（不分主题）
  info:    '#5794f2',
  ok:      '#73bf69',
  warning: '#f2cc0c',
  crit:    '#e0524d',
}
```

**现有组件零修改**：`bg-cockpit-panel` 编译出 `background: var(--cockpit-panel)`，自动随 `data-theme` 切换。

### 5.2 切换 + 持久化

新建 `packages/dashboard/src/lib/theme.ts`：

```typescript
type Theme = 'auto' | 'light' | 'dark'

export function getEffectiveTheme(stored: Theme): 'light' | 'dark' {
  if (stored === 'auto') {
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return stored
}
export function applyTheme(effective: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', effective)
}
export function loadStoredTheme(): Theme {
  const v = localStorage.getItem('cockpit-theme')
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto'
}
export function storeTheme(t: Theme): void {
  localStorage.setItem('cockpit-theme', t)
}
```

`main.tsx` 顶部（React 挂载前）：

```ts
const stored = loadStoredTheme()
applyTheme(getEffectiveTheme(stored))
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (loadStoredTheme() === 'auto') applyTheme(getEffectiveTheme('auto'))
})
```

无 FOUC：因为 `<html data-theme>` 在 React 挂载前已经设置好，首次绘制时 CSS var 已经是对的值。

### 5.3 切换 UI

Sidebar 底部小图标按钮（不抢眼）：

```
┌─ Sidebar ─────────┐
│ ● Overview        │
│   History         │
│                   │
│                   │
│ ─────────────────│
│ ☀ / 🌙   EN/中    │
└───────────────────┘
```

点 ☀/🌙 切换 `auto → light → dark → auto`；右边 EN/中 是 §6 i18n 切换。

### 5.4 配合 wizard

`claude-cockpit configure §3` 第 2 题选 Light/Dark/Auto 时，写入 `~/.claude-cockpit/config.json.dashboardTheme`。

Dashboard 启动时优先级：
1. `localStorage('cockpit-theme')`（用户在 UI 切过）
2. 否则 query `/api/config` 拿 `dashboardTheme`
3. 否则 `auto`

新增 daemon 端点 `GET /api/config`：返回 `{ statuslinePreset, dashboardTheme, dashboardLang }` 三字段（read-only，无敏感数据；不返回 disabledRules / 阈值等运维细节）。Origin guard 不需要（GET only，无副作用）。

### 5.5 测试

- `theme.test.ts` 5 例（auto→light/dark 解析、localStorage 持久化、matchMedia listener、空 storage 回退）
- `Sidebar.test.tsx` 加 1 例（点击切换 toggle `data-theme`）

### 5.6 µPlot Sparkline 颜色

µPlot 颜色 prop 直传 hex。当前都是写死的（`#73bf69` 等）。**保持不变** —— 这些是阈值信号色（绿黄红蓝），两个主题共用一套是常规做法。

---

## 6 · EN/CN i18n

### 6.1 库

**`react-i18next`** + **`i18next`** —— 行业标准、~30KB gz、key 找回机制成熟。

### 6.2 文件结构

```
packages/dashboard/src/
├── i18n/
│   ├── index.ts                  # i18next init + lang loader
│   ├── locales/
│   │   ├── en.json               # English (default + fallback)
│   │   └── zh-CN.json            # 简体中文
│   ├── i18n.test.ts
│   └── extract-strings.ts        # dev-only helper to diff JSON vs t() calls
└── lib/
    └── useLanguage.ts            # hook + setter delegating to i18n.changeLanguage
```

### 6.3 翻译范围

| 范围 | 翻译 |
|---|---|
| Dashboard UI 静态文本（Sidebar / KpiBar / HistoryTabs / Tab labels / 按钮 / loading / error / tooltips） | ✅ |
| AlertBanner 内 rule label（"Context near limit" 等） | ✅ |
| Data values（数字 / $ / %）| ❌ |
| 错误信息技术细节（"HTTP 503" 等） | ❌ |
| µPlot axes / Sparkline | ❌（v1.0 不动） |
| Statusline 输出 | ❌（terminal 英文） |
| 系统通知文本（macOS / linux notify-send） | ❌（增加风险面） |
| CLI（`claude-cockpit configure / status`） | ❌（命令本身英文） |

**结论**：仅 dashboard 浏览器 UI，~50 keys。

### 6.4 locale 示例

`en.json`：

```jsonc
{
  "nav": { "overview": "Overview", "history": "History" },
  "history": {
    "title": "Past 30 days",
    "tabs.trends":   "Trends",
    "tabs.top":      "Top",
    "tabs.projects": "Projects",
    "trends.totals":    "Last 30 days · totals",
    "trends.sessions":  "sessions",
    "trends.cacheHit":  "cache hit",
    "trends.dailyCost": "DAILY COST",
    "trends.cacheRate": "CACHE HIT RATE",
    "trends.usage":     "SUBSCRIBER USAGE (snapshots)",
    "top.by":           "by",
    "projects.clear":   "Clear all history…",
    "projects.confirm.title":   "Permanently delete all history?",
    "projects.confirm.body":    "This empties all 4 tables. Cannot be undone.",
    "projects.confirm.cancel":  "Cancel",
    "projects.confirm.ok":      "Clear",
    "projects.confirm.clearing": "Clearing…",
    "loading":      "Loading…",
    "noData":       "No data in this window.",
    "noProjects":   "No projects in this window."
  },
  "session": {
    "details":            "SESSION DETAIL",
    "controls.stop":      "Stop",
    "controls.file":      "Open file",
    "controls.copy":      "Copy id",
    "controls.focus":     "Focus term",
    "alerts.ctxHigh":     "Context near limit",
    "alerts.costSpike":   "Cost spike",
    "alerts.loopDetect":  "Possible loop",
    "alerts.subagentStuck": "Subagent stuck"
  },
  "overview": {
    "noActiveSessions": "No active sessions yet.",
    "active":           "ACTIVE SESSIONS",
    "cost24h":          "COST · 24h",
    "ctx24h":           "CONTEXT % · 24h",
    "noDataYet":        "no data yet"
  },
  "usage": {
    "5h.tooltip": "5-hour rolling window (from first use after last reset)",
    "7d.tooltip": "Weekly quota — resets on your account billing-week boundary, not a rolling-7-days count",
    "resetsIn":   "resets in {{countdown}}"
  },
  "mcp": {
    "none":        "no MCP",
    "lastUsed":    "last used {{ago}}",
    "notUsedYet":  "not used yet"
  }
}
```

`zh-CN.json`：对应翻译 ~50 key 镜像，手译。

### 6.5 组件迁移

举例 `HistoryTabs.tsx`：

```tsx
// Before:
{tabs.map(t => <button>...{t}</button>)}

// After:
import { useTranslation } from 'react-i18next'
const { t } = useTranslation()
{tabs.map(tab => <button>...{t(`history.tabs.${tab}`)}</button>)}
```

迁移约 12 个组件文件、~50 处字符串。

### 6.6 语言切换

Sidebar 加 `EN | 中` 切换：

```tsx
const { i18n } = useTranslation()
<button onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'zh-CN' : 'en')}>
  {i18n.language === 'en' ? '中' : 'EN'}
</button>
```

启动时优先级：
1. `localStorage('cockpit-lang')`
2. `/api/config` 的 `dashboardLang`
3. `navigator.language`（如 'zh-*' → 'zh-CN'，其他 → 'en'）
4. fallback `'en'`

### 6.7 风险点

| # | 风险 | 应对 |
|---|---|---|
| **R22** | 翻译 key 散落难维护 | `extract-strings.ts` dev 脚本扫 TSX 里 `t('...')` 调用，diff JSON 缺失 key 报错 |
| **R23** | i18n init 顺序导致首渲染英文一闪 | 同步加载默认 locale（不走 async backend），首次同步可用 |
| **R24** | 翻译质量 | en/zh-CN 手写一遍，避免机翻怪味 |

### 6.8 测试

- `i18n.test.ts` 6 例（init / fallback en / changeLanguage / 已知 key / 未知 key 退回原 key / interpolation `{{}}` 替换）
- `Sidebar.test.tsx` 加 1 例语言切换 toggle
- HistoryTabs / TrendsTab / TopTab / ProjectsTab 各 .test.tsx 改为按 i18n key 断言（约 6 处改动，无新增）

---

## 7 · README polish + 覆盖度 audit

### 7.1 README 改造

| 段 | 现状 | 改后 |
|---|---|---|
| 顶部 | 标题 + 一句话 + 大截图 | 加 Quickstart（3 行） |
| What you get | v0.5 / v0.9 / v0.1 倒序 | 加 v1.0 段，含 install/configure 步骤 |
| Install (beta — v0.5.x) | git clone + npm install + 手编 settings.json | 改为 `npm i -g claude-cockpit` + `configure`；旧流程移到 Develop 段 |
| Roadmap | v0.5 ✅ / v0.9 ✅ current / v1.0 next | v1.0 标 ✅ current；future 列 alerts feed / Linux notify deep-link / Windows |
| 截图 | v0.1 主图 + 架构 mermaid | 加 `/history` Trends + light theme 对照截图 |

### 7.2 Quickstart 三行（README 顶部）

```bash
npm install -g claude-cockpit
claude-cockpit configure          # 8-step wizard
# Restart Claude Code; statusline + dashboard auto-wire
```

### 7.3 覆盖度 audit

```bash
# Step 1: baseline
npx vitest run --coverage --reporter=text-summary

# Step 2: identify files < 60% line coverage
npx vitest run --coverage --reporter=text | awk '...'

# Step 3: write tests for the worst offenders until pkg avg ≥ 60%
```

**目标**：所有 src/**/*.ts 文件**按行数加权**的平均行覆盖 ≥ 60%（vitest `--coverage` 默认输出的 "All files" 行）。**不**追求 file-level 60%（避免脆弱测试）。

预期补测区域：`main.ts`（daemon 主装配）、`socket-server.ts`、`http-server.ts`。`bin/*.ts` 入口接受 0%。

---

## 8 · 风险与应对（v1.0 增量）

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| **R25** | npm publish 后 prebuilt better-sqlite3 binary 下载失败（限速 / CDN 故障 / 老 Node） | 中 | `engines.node >= 20`；锁版本 `^12`；R15 graceful degrade 兜底 |
| **R26** | `configure` wizard 覆盖用户手编 config.json | 中 | 合并而非替换；wizard 结尾显示 diff 让用户 confirm |
| **R27** | `settings.json` patch 写错挂掉 CC | 高 | atomic write + 备份到 `*.bak.cockpit-<ts>` + patch 后立即读回校验 valid，失败自动 rollback |
| **R28** | Light theme µPlot 颜色不调 | 低 | 信号色（绿黄红蓝）跨主题视觉 OK；v1.0 不修 |
| **R29** | i18n 加载延迟首屏闪英文 | 低 | 同步加载默认 locale（无 backend），等 React 首渲染前完成 |
| **R30** | esbuild 把 dev 依赖打进 dist | 中 | `external` allowlist 显式声明；bundle 后 `du -sh dist/*` 设上限 |
| **R31** | i18next + vitest 测试时 init 报错 | 低 | 测试 setup 提前 init i18n 单例 |
| **R32** | wizard 第 8 题用户选 Patch 后多次运行积累多个 `*.bak` | 低 | 备份保留最近 3 份；旧的自动删 |

---

## 9 · 测试策略

| 层级 | 范围 | 用例数 |
|---|---|---|
| 单测 | CLI: `configure` 各分支 / `status` 输出 / `settings-json` patch + rollback | ≈ 12 |
| 单测 | `renderFull` 5 例（cache hit / multi-tool name / others=0 / others 大 / 空 tools fallback） | 5 |
| 单测 | `theme.ts` 5 例（auto / light / dark 分支、localStorage、matchMedia 监听器） | 5 |
| 单测 | `i18n.ts` 6 例 | 6 |
| 单测 | `findDashboardDist()` fallback 路径扩展 | 2 |
| 集成 | `npx claude-cockpit configure` 跑完后 config.json + settings.json patch 验证（mock TTY） | 2 |
| 集成 | `npm pack` + 从 tarball install + `claude-cockpit --version` | 1 |
| 回归 | 现有 267 + N 全过 | 必须 |

新增约 **38 测试**，到 v1.0 收尾时累计 305+。

---

## 10 · 验收清单

- [ ] `npm pack` 生成 tarball；本地 `npm install -g ./tarball` 装上后 `claude-cockpit --version` 输出 `1.0.0-beta`
- [ ] `claude-cockpit configure` 8 题完整流程；输出 `~/.claude-cockpit/config.json` valid + `statuslinePreset / dashboardTheme / dashboardLang` 三字段都写入
- [ ] 选 patch settings.json 时，原值备份到 `*.bak.cockpit-<ts>`；patch 后 settings.json 是 valid JSON
- [ ] `claude-cockpit status` 输出 daemon 状态 + DB stats，daemon 不在时优雅提示
- [ ] 三档 statusline preset 切换：手改 config.json 后 CC 重启 → 看到对应渲染
- [ ] Light/Dark/Auto 三态切换 < 100ms 无 FOUC；refresh 后状态保留
- [ ] EN/中切换后所有 dashboard 文本翻译；µPlot 不动；数据值不变
- [ ] 全套测试 ≥ 305 全过；typecheck 跨 4 workspace clean
- [ ] coverage 加权 ≥ 60%
- [ ] better-sqlite3 装不上的 fallback 路径在 npm publish 包里仍正常工作
- [ ] README 顶部 Quickstart 三行；v1.0 段 + Roadmap 更新；`/history` + light theme 截图
- [ ] CI 矩阵（mac + ubuntu）通过 `npm install -g <tarball>` 验证

---

## 附录 · 已锁定决策快照

1. v1.0 范围 = npm publish + README polish + configure wizard + Minimal/Full presets + light theme + i18n + 覆盖度 audit（7 项全部，用户明确要求）
2. npm publish = 单包 `claude-cockpit`，bin CLI 含 4 子命令
3. configure 是独立 CLI（**非** CC slash command），用 `@clack/prompts`
4. statusline 三档：`minimal` / `essential`（默认）/ `full`；preset 走 `config.json`
5. Light theme 用 Tailwind tokens → CSS var 方案（零组件改动）；`data-theme` HTML 属性切换
6. i18n 仅 dashboard；library = `react-i18next`；2 locale
7. 覆盖度目标加权 60%（不强 file-level）
8. better-sqlite3 prebuilt binary 兜底 + R15 graceful degrade
9. `~/.claude-cockpit/cockpit.db` schema **零破坏**
10. CI 矩阵保持 mac + ubuntu；不引 Windows
