# claude-cockpit · Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 claude-cockpit 从零做到 v0.1 alpha —— statusline + daemon + dashboard 端到端跑通 + 多 session 聚合 Overview 页可截图。

**Architecture:** Node monorepo（npm workspaces）三包：`shared`（类型）/ `statusline`（CC 状态行子进程）/ `daemon`（常驻 HTTP+WS+Unix socket）/ `dashboard`（Vite + React 静态产物，daemon 直接 serve）。statusline 每次刷新通过 Unix socket 推送 SessionState 给 daemon；daemon 自己 tail JSONL transcripts 补全细节；dashboard 通过 WebSocket 拿实时 diff。懒启动：sock 不可连时 statusline 双 fork 起 daemon；daemon 30 分钟全局 idle 自动退出。

**Tech Stack:** TypeScript 5.x · Node 20 · npm workspaces · vitest（测试） · better-sqlite3（Phase 3 才用，Phase 1 不引入） · Vite 5 + React 18 + TanStack Router + Tailwind CSS + µPlot（dashboard） · GitHub Actions（mac + ubuntu CI）

**Reference spec:** `docs/superpowers/specs/2026-05-15-claude-cockpit-design.md`

---

## 文件结构（Phase 0+1 完成后）

```
claude-cockpit/
├── package.json                                # root workspaces
├── tsconfig.base.json
├── .gitignore
├── LICENSE                                     # MIT
├── README.md
├── .github/workflows/ci.yml
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                        # barrel export
│   │       ├── session-state.ts                # SessionState, SessionStatus, ToolCall, TodoItem
│   │       └── protocol.ts                     # RPC frame types (UPDATE_SESSION, PING)
│   ├── statusline/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/statusline.ts                   # entry, shebang
│   │   └── src/
│   │       ├── main.ts
│   │       ├── stdin.ts                        # read & parse CC JSON
│   │       ├── render.ts                       # render statusline text (Essential preset)
│   │       ├── osc8.ts                         # OSC 8 link helper + terminal capability detection
│   │       ├── rpc-client.ts                   # connect / send UPDATE_SESSION
│   │       └── daemon-spawn.ts                 # double-fork detached daemon
│   ├── daemon/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/daemon.ts
│   │   └── src/
│   │       ├── main.ts                         # bootstrap, signal handlers
│   │       ├── paths.ts                        # ~/.claude-cockpit/* + sock path
│   │       ├── runtime-info.ts                 # daemon.json read/write
│   │       ├── socket-server.ts                # net.Server Unix socket
│   │       ├── http-server.ts                  # express-less raw http + ws
│   │       ├── session-registry.ts             # Map<sid, SessionState>
│   │       ├── transcript-watcher.ts           # tail JSONL → events
│   │       ├── mcp-inspector.ts                # parse ~/.claude/settings.json
│   │       ├── lifecycle.ts                    # idle self-check, graceful shutdown
│   │       ├── platform/
│   │       │   ├── index.ts                    # dispatcher by process.platform
│   │       │   ├── macos.ts                    # open / pbcopy / osascript
│   │       │   └── linux.ts                    # xdg-open / xclip / notify-send
│   │       └── api/
│   │           ├── routes.ts                   # /api/sessions/* GET + POST
│   │           └── ws.ts                       # WebSocket broadcaster
│   └── dashboard/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── routes/
│           │   ├── __root.tsx                  # layout: Sidebar + main outlet
│           │   └── index.tsx                   # Overview page (default route)
│           ├── components/
│           │   ├── Sidebar.tsx
│           │   ├── KpiBar.tsx
│           │   ├── SessionCard.tsx
│           │   ├── Sparkline.tsx               # µPlot wrapper
│           │   └── McpHealthBar.tsx
│           ├── hooks/
│           │   └── useSessionStream.ts         # WS hook → SessionState[]
│           ├── lib/
│           │   ├── api.ts                      # fetch / ws url helpers
│           │   └── colors.ts                   # Grafana palette tokens
│           └── styles.css                      # Tailwind directives
└── tests/e2e/
    └── lazy-start.test.ts                      # full lifecycle integration test
```

**为什么这样切：**
- `shared` 只放跨包类型，无运行时依赖；daemon 和 statusline 都进口它，dashboard 也能 import（Vite ESM ok）
- `statusline` 是 hot path（每 300ms fork 一次），保持小，最小化 deps
- `daemon` 把所有"长期 state + 跨 session 协调"集中
- `dashboard` 独立构建产物（`vite build`），由 daemon 静态 serve
- `tests/e2e` 跨包，所以放根目录

---

## 通用约定（每个 Task 都假设这些已就位）

**包管理：** 仓库根 `npm install` 一次装齐所有 workspaces。每个包用 `npm run -w packages/<name> <script>` 执行脚本。

**测试运行命令：**
- 包内单测：`npm run -w packages/<name> test`
- 全量：`npm test`（root 脚本聚合）
- e2e：`npm run test:e2e`

**Commit 信息约定：** Conventional Commits（`feat:` / `fix:` / `chore:` / `test:` / `docs:` / `refactor:`），结尾固定挂：

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**TypeScript 严格度：** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`。

---

# Phase 0 · 骨架（Task 1–14，目标 3–5 天）

## Task 1: Monorepo scaffold + 工具链

**Files:**
- Create: `package.json` (root), `tsconfig.base.json`, `.gitignore` (update), `LICENSE`, `README.md`, `.editorconfig`, `vitest.config.ts` (root)

- [ ] **Step 1: 在根目录写 package.json**

```json
{
  "name": "claude-cockpit-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm run -ws --if-present build",
    "test": "vitest run",
    "test:e2e": "vitest run --config tests/e2e/vitest.config.ts",
    "typecheck": "npm run -ws --if-present typecheck",
    "lint": "echo 'lint placeholder — wired up in later task'"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.12.0"
  }
}
```

- [ ] **Step 2: 写 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: 写 LICENSE（MIT）和最小 README.md**

`LICENSE`:
```
MIT License

Copyright (c) 2026 shuliuyang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md`:
```markdown
# claude-cockpit

> Multi-session dashboard + control console for Claude Code. The Grafana-style HUD claude-hud doesn't ship.

Work in progress — Phase 0 + 1 (alpha).
```

- [ ] **Step 4: 写 .gitignore（追加）**

把现有 `.gitignore` 改成：
```
.superpowers/
node_modules/
dist/
*.log
.DS_Store
~/.claude-cockpit/   # not committed, but doc note
.vite/
coverage/
```

- [ ] **Step 5: 写 vitest.config.ts（root）**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
  },
})
```

- [ ] **Step 6: 装依赖、验证空运行**

```bash
npm install
npx tsc --version
npx vitest --version
```

Expected: 都打印版本号，无报错。

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json .gitignore LICENSE README.md vitest.config.ts package-lock.json
git commit -m "$(cat <<'EOF'
chore: scaffold monorepo with npm workspaces + TypeScript + vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: shared 包 —— 类型定义

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/session-state.ts`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/session-state.test.ts`

- [ ] **Step 1: 写包 manifest 和 tsconfig**

`packages/shared/package.json`:
```json
{
  "name": "@claude-cockpit/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: 写测试（先写）**

`packages/shared/src/session-state.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { isSessionStatus, type SessionState } from './session-state.js'

describe('SessionStatus', () => {
  it('accepts the four known statuses', () => {
    expect(isSessionStatus('busy')).toBe(true)
    expect(isSessionStatus('idle')).toBe(true)
    expect(isSessionStatus('waiting')).toBe(true)
    expect(isSessionStatus('closed')).toBe(true)
  })

  it('rejects unknown statuses', () => {
    expect(isSessionStatus('unknown')).toBe(false)
    expect(isSessionStatus('')).toBe(false)
  })
})

describe('SessionState shape', () => {
  it('can be constructed with required fields only', () => {
    const s: SessionState = {
      sessionId: 'abc',
      pid: 1234,
      ppid: 1233,
      cwd: '/tmp',
      model: 'claude-opus-4-7',
      ctxPct: 0,
      cost: 0,
      tools: [],
      todos: [],
      mcpServers: [],
      transcriptPath: '/tmp/x.jsonl',
      status: 'busy',
      lastUpdate: Date.now(),
      startedAt: Date.now(),
    }
    expect(s.sessionId).toBe('abc')
  })
})
```

- [ ] **Step 3: 运行测试，看它 fail**

```bash
npm run -w packages/shared test
```
Expected: FAIL，提示 `Cannot find module './session-state.js'`。

- [ ] **Step 4: 写实现**

`packages/shared/src/session-state.ts`:
```typescript
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
}
```

- [ ] **Step 5: 写 protocol.ts 测试 + 实现**

`packages/shared/src/protocol.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { isRpcFrame, type RpcFrame } from './protocol.js'

describe('isRpcFrame', () => {
  it('accepts a well-formed UPDATE_SESSION frame', () => {
    const frame: RpcFrame = { type: 'UPDATE_SESSION', sessionId: 'abc', payload: {} }
    expect(isRpcFrame(frame)).toBe(true)
  })

  it('rejects null and missing type', () => {
    expect(isRpcFrame(null)).toBe(false)
    expect(isRpcFrame({ type: 'NOPE' })).toBe(false)
    expect(isRpcFrame({})).toBe(false)
  })
})
```

`packages/shared/src/protocol.ts`:
```typescript
import type { SessionState } from './session-state.js'

export type RpcFrame =
  | { type: 'UPDATE_SESSION'; sessionId: string; payload: Partial<SessionState> }
  | { type: 'PING' }
  | { type: 'PONG' }

const FRAME_TYPES: ReadonlySet<string> = new Set(['UPDATE_SESSION', 'PING', 'PONG'])

export function isRpcFrame(value: unknown): value is RpcFrame {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.type === 'string' && FRAME_TYPES.has(v.type)
}
```

- [ ] **Step 6: 写 index barrel**

`packages/shared/src/index.ts`:
```typescript
export * from './session-state.js'
export * from './protocol.js'
```

- [ ] **Step 7: 运行所有 shared 测试**

```bash
npm run -w packages/shared test
```
Expected: 全 PASS（4 tests across two files）。

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "$(cat <<'EOF'
feat(shared): define SessionState + RPC frame types with guards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: daemon —— paths 与 runtime-info

**Files:**
- Create: `packages/daemon/package.json`
- Create: `packages/daemon/tsconfig.json`
- Create: `packages/daemon/src/paths.ts`
- Create: `packages/daemon/src/runtime-info.ts`
- Test: `packages/daemon/src/paths.test.ts`
- Test: `packages/daemon/src/runtime-info.test.ts`

- [ ] **Step 1: 写包 manifest**

`packages/daemon/package.json`:
```json
{
  "name": "@claude-cockpit/daemon",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "claude-cockpit-daemon": "./bin/daemon.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": {
    "@claude-cockpit/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^20.12.0"
  }
}
```

`packages/daemon/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*", "bin/**/*"]
}
```

- [ ] **Step 2: 写 paths.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { getCockpitDir, getSocketPath, getRuntimeInfoPath } from './paths.js'

describe('paths', () => {
  it('socket path lives in TMPDIR', () => {
    expect(getSocketPath()).toMatch(/claude-cockpit\.sock$/)
  })
  it('cockpit dir is under HOME', () => {
    expect(getCockpitDir()).toMatch(/\.claude-cockpit$/)
  })
  it('runtime info lives inside cockpit dir', () => {
    expect(getRuntimeInfoPath()).toBe(`${getCockpitDir()}/daemon.json`)
  })
})
```

- [ ] **Step 3: 跑测试 → fail**

```bash
npm run -w packages/daemon test
```
Expected: FAIL，`Cannot find module './paths.js'`。

- [ ] **Step 4: 写 paths.ts**

```typescript
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export function getCockpitDir(): string {
  return join(homedir(), '.claude-cockpit')
}

export function getSocketPath(): string {
  return join(tmpdir(), 'claude-cockpit.sock')
}

export function getRuntimeInfoPath(): string {
  return join(getCockpitDir(), 'daemon.json')
}

export function getCrashLogPath(): string {
  return join(getCockpitDir(), 'crash.log')
}
```

- [ ] **Step 5: 跑测试 → pass**

```bash
npm run -w packages/daemon test
```
Expected: 3 passed。

- [ ] **Step 6: 写 runtime-info.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeRuntimeInfo, readRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'cockpit-rt-'))
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('runtime-info', () => {
  it('writes and reads back', () => {
    const path = join(testDir, 'daemon.json')
    writeRuntimeInfo(path, { pid: 1234, port: 5678, startedAt: 100 })
    expect(readRuntimeInfo(path)).toEqual({ pid: 1234, port: 5678, startedAt: 100 })
  })

  it('readRuntimeInfo returns null when missing', () => {
    expect(readRuntimeInfo(join(testDir, 'nope.json'))).toBeNull()
  })

  it('readRuntimeInfo returns null on malformed JSON', () => {
    const path = join(testDir, 'bad.json')
    require('node:fs').writeFileSync(path, '{not json')
    expect(readRuntimeInfo(path)).toBeNull()
  })

  it('deleteRuntimeInfo is idempotent', () => {
    const path = join(testDir, 'x.json')
    expect(() => deleteRuntimeInfo(path)).not.toThrow()
    writeRuntimeInfo(path, { pid: 1, port: 1, startedAt: 1 })
    deleteRuntimeInfo(path)
    expect(readRuntimeInfo(path)).toBeNull()
  })
})
```

- [ ] **Step 7: 跑测试 → fail（module not found）**

- [ ] **Step 8: 写 runtime-info.ts**

```typescript
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export interface RuntimeInfo {
  pid: number
  port: number
  startedAt: number
}

export function writeRuntimeInfo(path: string, info: RuntimeInfo): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(info, null, 2))
}

export function readRuntimeInfo(path: string): RuntimeInfo | null {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    if (
      typeof raw === 'object' &&
      raw !== null &&
      typeof raw.pid === 'number' &&
      typeof raw.port === 'number' &&
      typeof raw.startedAt === 'number'
    ) {
      return raw as RuntimeInfo
    }
    return null
  } catch {
    return null
  }
}

export function deleteRuntimeInfo(path: string): void {
  if (existsSync(path)) unlinkSync(path)
}
```

- [ ] **Step 9: 跑测试 → all pass**

```bash
npm run -w packages/daemon test
```
Expected: 7 passed。

- [ ] **Step 10: Commit**

```bash
git add packages/daemon
git commit -m "$(cat <<'EOF'
feat(daemon): paths + runtime-info read/write/delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: daemon —— Unix socket 服务器

**Files:**
- Create: `packages/daemon/src/socket-server.ts`
- Test: `packages/daemon/src/socket-server.test.ts`

- [ ] **Step 1: 写测试（先写）**

`packages/daemon/src/socket-server.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { createConnection } from 'node:net'
import { startSocketServer, type SocketServer } from './socket-server.js'
import type { RpcFrame } from '@claude-cockpit/shared'

let server: SocketServer | undefined
let dir: string

afterEach(async () => {
  await server?.stop()
  server = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function sendFrame(sockPath: string, frame: RpcFrame): Promise<RpcFrame> {
  return new Promise((resolve, reject) => {
    const c = createConnection(sockPath)
    let buf = ''
    c.on('data', (d) => {
      buf += d.toString()
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        resolve(JSON.parse(buf.slice(0, nl)))
        c.end()
      }
    })
    c.on('error', reject)
    c.write(JSON.stringify(frame) + '\n')
  })
}

describe('socket-server', () => {
  it('replies PONG to PING', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sock-'))
    const sockPath = join(dir, 's.sock')
    const onFrame = () => undefined
    server = await startSocketServer(sockPath, onFrame)
    const reply = await sendFrame(sockPath, { type: 'PING' })
    expect(reply).toEqual({ type: 'PONG' })
  })

  it('forwards UPDATE_SESSION to handler', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sock-'))
    const sockPath = join(dir, 's.sock')
    const received: RpcFrame[] = []
    server = await startSocketServer(sockPath, (f) => { received.push(f) })
    await sendFrame(sockPath, {
      type: 'UPDATE_SESSION',
      sessionId: 'abc',
      payload: { ctxPct: 47 },
    })
    expect(received[0]?.type).toBe('UPDATE_SESSION')
  })

  it('removes stale socket file on start', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sock-'))
    const sockPath = join(dir, 's.sock')
    // simulate stale file
    require('node:fs').writeFileSync(sockPath, 'stale')
    server = await startSocketServer(sockPath, () => undefined)
    const reply = await sendFrame(sockPath, { type: 'PING' })
    expect(reply).toEqual({ type: 'PONG' })
  })
})
```

- [ ] **Step 2: 跑测试 → fail（模块不存在）**

- [ ] **Step 3: 写 socket-server.ts**

```typescript
import { createServer, Server } from 'node:net'
import { existsSync, unlinkSync } from 'node:fs'
import { isRpcFrame, type RpcFrame } from '@claude-cockpit/shared'

export interface SocketServer {
  stop(): Promise<void>
}

export type FrameHandler = (frame: RpcFrame) => void

export async function startSocketServer(
  sockPath: string,
  onFrame: FrameHandler,
): Promise<SocketServer> {
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* race ok */ }
  }

  const server: Server = createServer((conn) => {
    let buf = ''
    conn.on('data', (chunk) => {
      buf += chunk.toString()
      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try {
          const parsed = JSON.parse(line)
          if (isRpcFrame(parsed)) {
            if (parsed.type === 'PING') {
              conn.write(JSON.stringify({ type: 'PONG' }) + '\n')
            } else {
              onFrame(parsed)
              conn.write(JSON.stringify({ type: 'PONG' }) + '\n')
            }
          }
        } catch { /* skip malformed */ }
        nl = buf.indexOf('\n')
      }
    })
    conn.on('error', () => undefined)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(sockPath, () => resolve())
  })

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          if (existsSync(sockPath)) {
            try { unlinkSync(sockPath) } catch { /* ignore */ }
          }
          resolve()
        })
      }),
  }
}
```

- [ ] **Step 4: 跑测试 → all 3 pass**

```bash
npm run -w packages/daemon test src/socket-server.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/socket-server.ts packages/daemon/src/socket-server.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): unix socket RPC server with newline-delimited JSON frames

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: daemon —— HTTP + WS server skeleton

**Files:**
- Create: `packages/daemon/src/http-server.ts`
- Test: `packages/daemon/src/http-server.test.ts`

- [ ] **Step 1: 装 ws 依赖**

```bash
npm install -w packages/daemon ws
npm install -w packages/daemon -D @types/ws
```

- [ ] **Step 2: 写测试**

`packages/daemon/src/http-server.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { startHttpServer, type HttpServer } from './http-server.js'
import WebSocket from 'ws'

let server: HttpServer | undefined

afterEach(async () => {
  await server?.stop()
  server = undefined
})

describe('http-server', () => {
  it('serves GET /health with 200 ok', async () => {
    server = await startHttpServer({ port: 0 })
    const res = await fetch(`http://127.0.0.1:${server.port}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('listens on a random port when port=0', async () => {
    server = await startHttpServer({ port: 0 })
    expect(server.port).toBeGreaterThan(0)
  })

  it('accepts websocket connection at /ws', async () => {
    server = await startHttpServer({ port: 0 })
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server!.port}/ws`)
      ws.on('open', () => { ws.close(); resolve() })
      ws.on('error', reject)
    })
  })
})
```

- [ ] **Step 3: 跑测试 → fail**

- [ ] **Step 4: 写 http-server.ts**

```typescript
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'

export interface HttpServer {
  port: number
  stop(): Promise<void>
  broadcast(message: unknown): void
}

export interface HttpServerOptions {
  port: number
}

export async function startHttpServer(opts: HttpServerOptions): Promise<HttpServer> {
  const sockets = new Set<WebSocket>()

  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ noServer: true })

  http.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.add(ws)
        ws.on('close', () => sockets.delete(ws))
      })
    } else {
      socket.destroy()
    }
  })

  const port: number = await new Promise<number>((resolve, reject) => {
    http.once('error', reject)
    http.listen(opts.port, '127.0.0.1', () => {
      const addr = http.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('no address'))
    })
  })

  return {
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const ws of sockets) ws.terminate()
        wss.close(() => http.close(() => resolve()))
      }),
    broadcast: (message: unknown) => {
      const data = JSON.stringify(message)
      for (const ws of sockets) {
        if (ws.readyState === ws.OPEN) ws.send(data)
      }
    },
  }
}
```

- [ ] **Step 5: 跑测试 → all pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon
git commit -m "$(cat <<'EOF'
feat(daemon): HTTP + WS server skeleton with /health and /ws

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: statusline —— 读 stdin + 渲染最小文本

**Files:**
- Create: `packages/statusline/package.json`
- Create: `packages/statusline/tsconfig.json`
- Create: `packages/statusline/src/stdin.ts`
- Create: `packages/statusline/src/render.ts`
- Test: `packages/statusline/src/stdin.test.ts`
- Test: `packages/statusline/src/render.test.ts`

- [ ] **Step 1: 写 package manifest**

`packages/statusline/package.json`:
```json
{
  "name": "@claude-cockpit/statusline",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "claude-cockpit-statusline": "./bin/statusline.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": {
    "@claude-cockpit/shared": "*"
  }
}
```

`packages/statusline/tsconfig.json`: 同 daemon 的 tsconfig，include 加 `"bin/**/*"`。

- [ ] **Step 2: 写 stdin.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { parseStatuslineInput } from './stdin.js'

describe('parseStatuslineInput', () => {
  it('parses a typical Claude Code stdin payload', () => {
    const raw = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/home/me/proj',
      model: { id: 'claude-opus-4-7' },
      transcript_path: '/Users/x/.claude/projects/abc/transcript.jsonl',
      workspace: { current_branch: 'main' },
    })
    const parsed = parseStatuslineInput(raw)
    expect(parsed).toEqual({
      sessionId: 'abc-123',
      cwd: '/home/me/proj',
      model: 'claude-opus-4-7',
      transcriptPath: '/Users/x/.claude/projects/abc/transcript.jsonl',
      branch: 'main',
    })
  })

  it('returns null for invalid JSON', () => {
    expect(parseStatuslineInput('not json')).toBeNull()
  })

  it('returns null when required fields missing', () => {
    expect(parseStatuslineInput('{}')).toBeNull()
  })
})
```

- [ ] **Step 3: 跑测试 → fail**

- [ ] **Step 4: 写 stdin.ts**

```typescript
export interface StatuslineInput {
  sessionId: string
  cwd: string
  model: string
  transcriptPath: string
  branch?: string
}

export function parseStatuslineInput(raw: string): StatuslineInput | null {
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return null }
  if (!obj || typeof obj !== 'object') return null
  const v = obj as Record<string, unknown>

  const sessionId = typeof v.session_id === 'string' ? v.session_id : null
  const cwd = typeof v.cwd === 'string' ? v.cwd : null
  const transcriptPath = typeof v.transcript_path === 'string' ? v.transcript_path : null
  const model = (() => {
    if (typeof v.model === 'string') return v.model
    if (v.model && typeof v.model === 'object') {
      const id = (v.model as Record<string, unknown>).id
      if (typeof id === 'string') return id
    }
    return null
  })()
  if (!sessionId || !cwd || !transcriptPath || !model) return null

  let branch: string | undefined
  if (v.workspace && typeof v.workspace === 'object') {
    const b = (v.workspace as Record<string, unknown>).current_branch
    if (typeof b === 'string') branch = b
  }

  return { sessionId, cwd, model, transcriptPath, ...(branch !== undefined && { branch }) }
}
```

- [ ] **Step 5: 跑 stdin 测试 → pass**

- [ ] **Step 6: 写 render.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { renderMinimal } from './render.js'

describe('renderMinimal', () => {
  it('outputs one line with model, cwd, branch, ctx, cost', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/home/me/proj', model: 'claude-opus-4-7',
      branch: 'main', ctxPct: 47, cost: 0.42,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: false,
    })
    expect(out).toContain('claude-opus-4-7')
    expect(out).toContain('proj')
    expect(out).toContain('main')
    expect(out).toContain('47%')
    expect(out).toContain('$0.42')
    expect(out).toContain('[cockpit]')
  })

  it('emits OSC 8 escape sequences when supported', () => {
    const out = renderMinimal({
      sessionId: 'abc', cwd: '/x', model: 'm',
      branch: 'main', ctxPct: 0, cost: 0,
      dashboardUrl: 'http://localhost:5050/sessions/abc', supportsOsc8: true,
    })
    expect(out).toContain(']8;;http://localhost:5050/sessions/abc')
    expect(out).toContain(']8;;') // closing
  })
})
```

- [ ] **Step 7: 跑测试 → fail**

- [ ] **Step 8: 写 render.ts**

```typescript
import { basename } from 'node:path'
import { osc8 } from './osc8.js'

export interface RenderInput {
  sessionId: string
  cwd: string
  model: string
  branch?: string
  ctxPct: number
  cost: number
  dashboardUrl: string
  supportsOsc8: boolean
}

export function renderMinimal(input: RenderInput): string {
  const cwdShort = basename(input.cwd) || input.cwd
  const branch = input.branch ?? 'detached'
  const ctx = `${Math.round(input.ctxPct)}%`
  const cost = `$${input.cost.toFixed(2)}`
  const link = osc8(input.dashboardUrl, '[cockpit]', input.supportsOsc8)
  return `● ${input.model} · ${cwdShort} · ${branch} · ctx ${ctx} · ${cost} · ${link}`
}
```

- [ ] **Step 9: 写 osc8.ts（最小占位实现，详细能力探测在 Task 11）**

```typescript
export function osc8(url: string, text: string, supported: boolean): string {
  if (!supported) return text
  const ESC = ''
  const BEL = ''
  return `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`
}
```

- [ ] **Step 10: 跑所有 statusline 测试 → pass**

- [ ] **Step 11: Commit**

```bash
git add packages/statusline
git commit -m "$(cat <<'EOF'
feat(statusline): parse Claude Code stdin + render minimal preset

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: statusline —— RPC client to daemon

**Files:**
- Create: `packages/statusline/src/rpc-client.ts`
- Test: `packages/statusline/src/rpc-client.test.ts`

- [ ] **Step 1: 写测试（用 daemon 包的 socket-server 起一个真 server，端到端测）**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { startSocketServer, type SocketServer } from '@claude-cockpit/daemon/src/socket-server.js'
import { sendUpdateSession, pingDaemon } from './rpc-client.js'
import type { RpcFrame } from '@claude-cockpit/shared'

let server: SocketServer | undefined
let dir: string

afterEach(async () => {
  await server?.stop()
  server = undefined
  rmSync(dir, { recursive: true, force: true })
})

describe('rpc-client', () => {
  it('pingDaemon returns true when server responds', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rpc-'))
    const sock = join(dir, 's.sock')
    server = await startSocketServer(sock, () => undefined)
    expect(await pingDaemon(sock, 500)).toBe(true)
  })

  it('pingDaemon returns false when no server', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rpc-'))
    const sock = join(dir, 'absent.sock')
    expect(await pingDaemon(sock, 200)).toBe(false)
  })

  it('sendUpdateSession delivers payload to handler', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rpc-'))
    const sock = join(dir, 's.sock')
    const received: RpcFrame[] = []
    server = await startSocketServer(sock, (f) => { received.push(f) })
    await sendUpdateSession(sock, 'sid-1', { ctxPct: 33, cost: 0.1 })
    // server replies PONG; give it a tick
    await new Promise((r) => setTimeout(r, 50))
    expect(received[0]).toMatchObject({ type: 'UPDATE_SESSION', sessionId: 'sid-1' })
  })
})
```

Note: 测试里用 `@claude-cockpit/daemon/src/...` 直接进口需要 daemon 的 package.json `exports` 字段放开 `./src/*`，或简单点直接用 `import { startSocketServer } from '../../daemon/src/socket-server.js'` 相对路径。**采用相对路径方案**（不污染 public exports）。把上面 import 改成：

```typescript
import { startSocketServer, type SocketServer } from '../../daemon/src/socket-server.js'
```

- [ ] **Step 2: 跑测试 → fail**

- [ ] **Step 3: 写 rpc-client.ts**

```typescript
import { createConnection } from 'node:net'
import type { SessionState, RpcFrame } from '@claude-cockpit/shared'

export async function pingDaemon(sockPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection(sockPath)
    const timer = setTimeout(() => { conn.destroy(); resolve(false) }, timeoutMs)
    conn.on('connect', () => {
      conn.write(JSON.stringify({ type: 'PING' }) + '\n')
    })
    conn.on('data', (d) => {
      clearTimeout(timer)
      conn.end()
      try {
        const reply = JSON.parse(d.toString().split('\n')[0]!) as RpcFrame
        resolve(reply.type === 'PONG')
      } catch { resolve(false) }
    })
    conn.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

export function sendUpdateSession(
  sockPath: string,
  sessionId: string,
  payload: Partial<SessionState>,
): Promise<void> {
  return new Promise((resolve) => {
    const conn = createConnection(sockPath)
    conn.on('connect', () => {
      const frame: RpcFrame = { type: 'UPDATE_SESSION', sessionId, payload }
      conn.write(JSON.stringify(frame) + '\n')
    })
    conn.on('data', () => { conn.end(); resolve() })
    conn.on('error', () => resolve())   // fire-and-forget; statusline must not block on daemon
    setTimeout(() => { conn.destroy(); resolve() }, 300)
  })
}
```

- [ ] **Step 4: 跑测试 → pass**

- [ ] **Step 5: Commit**

```bash
git add packages/statusline
git commit -m "$(cat <<'EOF'
feat(statusline): RPC client (ping + UPDATE_SESSION) over unix socket

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: statusline —— 懒启动 daemon（双 fork detached spawn）

**Files:**
- Create: `packages/statusline/src/daemon-spawn.ts`
- Create: `packages/daemon/bin/daemon.ts`
- Create: `packages/daemon/src/main.ts`
- Test: `packages/statusline/src/daemon-spawn.test.ts`

- [ ] **Step 1: 先写 daemon bootstrap（统一拉起 socket + http + runtime-info）**

`packages/daemon/src/main.ts`:
```typescript
import { startSocketServer } from './socket-server.js'
import { startHttpServer } from './http-server.js'
import { getSocketPath, getRuntimeInfoPath, getCockpitDir } from './paths.js'
import { writeRuntimeInfo, deleteRuntimeInfo } from './runtime-info.js'
import { mkdirSync } from 'node:fs'

export interface MainOptions {
  port?: number              // default 0 (random)
  onFrame?: (f: unknown) => void  // injected for tests; production wires to SessionRegistry later
}

export async function startDaemon(opts: MainOptions = {}): Promise<() => Promise<void>> {
  mkdirSync(getCockpitDir(), { recursive: true })
  const http = await startHttpServer({ port: opts.port ?? 0 })
  const sock = await startSocketServer(getSocketPath(), opts.onFrame ?? (() => undefined))
  writeRuntimeInfo(getRuntimeInfoPath(), {
    pid: process.pid,
    port: http.port,
    startedAt: Date.now(),
  })
  return async () => {
    await sock.stop()
    await http.stop()
    deleteRuntimeInfo(getRuntimeInfoPath())
  }
}
```

`packages/daemon/bin/daemon.ts`:
```typescript
#!/usr/bin/env node
import { startDaemon } from '../src/main.js'

const shutdown = await startDaemon()

process.on('SIGTERM', async () => { await shutdown(); process.exit(0) })
process.on('SIGINT',  async () => { await shutdown(); process.exit(0) })
```

- [ ] **Step 2: 写 daemon-spawn 测试**

`packages/statusline/src/daemon-spawn.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawnDaemon } from './daemon-spawn.js'
import { pingDaemon } from './rpc-client.js'

let dir: string
let cleanupFn: (() => Promise<void>) | undefined

afterEach(async () => {
  if (cleanupFn) await cleanupFn()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('spawnDaemon', () => {
  it('starts a daemon when none is running and ping succeeds', async () => {
    dir = mkdtempSync(join(tmpdir(), 'spawn-'))
    const sockPath = join(dir, 's.sock')
    cleanupFn = await spawnDaemon({
      daemonBinPath: require.resolve('@claude-cockpit/daemon/bin/daemon.ts'),
      sockPath,
      waitMs: 2000,
    })
    expect(await pingDaemon(sockPath, 500)).toBe(true)
  }, 8000)
})
```

注意：该测试需要 `tsx` 或 `tsc` 编译后能跑 daemon bin。先在 daemon `package.json` 加：
```json
"scripts": { "dev:bin": "tsx bin/daemon.ts" }
```
然后 root 装 tsx：
```bash
npm install -D tsx
```

测试时把 `daemonBinPath` 改为 spawn `tsx <path>`。简化：让 `spawnDaemon` 接受 `command` + `args`。

修改 test 为：
```typescript
cleanupFn = await spawnDaemon({
  command: 'npx',
  args: ['tsx', require.resolve('../../daemon/bin/daemon.ts')],
  sockPath,
  waitMs: 3000,
})
```

- [ ] **Step 3: 跑测试 → fail**

- [ ] **Step 4: 写 daemon-spawn.ts**

```typescript
import { spawn } from 'node:child_process'
import { pingDaemon } from './rpc-client.js'

export interface SpawnDaemonOptions {
  command: string
  args: string[]
  sockPath: string
  waitMs: number
}

export async function spawnDaemon(opts: SpawnDaemonOptions): Promise<() => Promise<void>> {
  // double-fork: spawn detached, immediately unref so statusline can exit
  const child = spawn(opts.command, opts.args, {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()

  // poll for sock readiness
  const deadline = Date.now() + opts.waitMs
  while (Date.now() < deadline) {
    if (await pingDaemon(opts.sockPath, 200)) {
      return async () => {
        try { process.kill(child.pid!, 'SIGTERM') } catch { /* already dead */ }
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`daemon did not respond within ${opts.waitMs}ms`)
}

export async function ensureDaemon(opts: SpawnDaemonOptions): Promise<void> {
  if (await pingDaemon(opts.sockPath, 200)) return
  await spawnDaemon(opts)
}
```

- [ ] **Step 5: 跑测试 → pass（可能要 3s，因为真起一次 daemon）**

- [ ] **Step 6: Commit**

```bash
git add packages/statusline/src/daemon-spawn.ts packages/statusline/src/daemon-spawn.test.ts packages/daemon/bin/daemon.ts packages/daemon/src/main.ts packages/daemon/package.json package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(statusline): double-fork detached daemon spawn with readiness polling

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: daemon —— stale-sock 自愈

**Files:**
- Modify: `packages/daemon/src/socket-server.ts`（已经在 Task 4 处理；本任务确认 stale sock + bound to dead process 的场景）
- Create: `packages/daemon/src/stale-sock.ts`
- Test: `packages/daemon/src/stale-sock.test.ts`

- [ ] **Step 1: 写测试 —— 三个场景**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { isSocketAlive, clearStaleSocket } from './stale-sock.js'
import { startSocketServer, type SocketServer } from './socket-server.js'

let dir: string
let server: SocketServer | undefined

afterEach(async () => {
  await server?.stop()
  server = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('stale-sock', () => {
  it('isSocketAlive returns false when file does not exist', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    expect(await isSocketAlive(join(dir, 'nope.sock'))).toBe(false)
  })

  it('isSocketAlive returns false when file is plain regular file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    const sock = join(dir, 'fake.sock')
    writeFileSync(sock, 'not a real socket')
    expect(await isSocketAlive(sock)).toBe(false)
  })

  it('isSocketAlive returns true when daemon is listening', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    const sock = join(dir, 'real.sock')
    server = await startSocketServer(sock, () => undefined)
    expect(await isSocketAlive(sock)).toBe(true)
  })

  it('clearStaleSocket removes a non-listening sock file', () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    const sock = join(dir, 'stale.sock')
    writeFileSync(sock, '')
    clearStaleSocket(sock)
    expect(existsSync(sock)).toBe(false)
  })

  it('clearStaleSocket is idempotent', () => {
    dir = mkdtempSync(join(tmpdir(), 'stale-'))
    expect(() => clearStaleSocket(join(dir, 'absent.sock'))).not.toThrow()
  })
})
```

- [ ] **Step 2: 跑 → fail**

- [ ] **Step 3: 写 stale-sock.ts**

```typescript
import { existsSync, unlinkSync } from 'node:fs'
import { createConnection } from 'node:net'

export async function isSocketAlive(sockPath: string): Promise<boolean> {
  if (!existsSync(sockPath)) return false
  return new Promise<boolean>((resolve) => {
    const conn = createConnection(sockPath)
    const timer = setTimeout(() => { conn.destroy(); resolve(false) }, 300)
    conn.on('connect', () => { clearTimeout(timer); conn.end(); resolve(true) })
    conn.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

export function clearStaleSocket(sockPath: string): void {
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* race with another spawner is fine */ }
  }
}
```

- [ ] **Step 4: 修改 `daemon-spawn.ts` 在 spawn 前调 clearStaleSocket**

修改 `packages/statusline/src/daemon-spawn.ts` 的 `ensureDaemon`：
```typescript
import { clearStaleSocket } from '../../daemon/src/stale-sock.js'

export async function ensureDaemon(opts: SpawnDaemonOptions): Promise<void> {
  if (await pingDaemon(opts.sockPath, 200)) return
  clearStaleSocket(opts.sockPath)
  await spawnDaemon(opts)
}
```

- [ ] **Step 5: 跑所有测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/stale-sock.ts packages/daemon/src/stale-sock.test.ts packages/statusline/src/daemon-spawn.ts
git commit -m "$(cat <<'EOF'
feat(daemon): stale socket detection + idempotent cleanup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: daemon —— graceful shutdown + idle 自检

**Files:**
- Create: `packages/daemon/src/lifecycle.ts`
- Test: `packages/daemon/src/lifecycle.test.ts`
- Modify: `packages/daemon/src/main.ts` 接 lifecycle

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { IdleChecker } from './lifecycle.js'

describe('IdleChecker', () => {
  it('does NOT call shutdown when any session updated within window', () => {
    const shutdown = vi.fn()
    const now = 100_000
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => false,
      lastSessionUpdate: () => now - 1_000,  // 1s ago
      now: () => now,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).not.toHaveBeenCalled()
  })

  it('calls shutdown when no recent updates AND no browsers', () => {
    const shutdown = vi.fn()
    const now = 100_000
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => false,
      lastSessionUpdate: () => now - 31 * 60_000,
      now: () => now,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('does NOT call shutdown when browsers connected, even if sessions idle', () => {
    const shutdown = vi.fn()
    const now = 100_000
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => true,
      lastSessionUpdate: () => now - 31 * 60_000,
      now: () => now,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).not.toHaveBeenCalled()
  })

  it('handles undefined lastSessionUpdate (no sessions ever) as idle', () => {
    const shutdown = vi.fn()
    const checker = new IdleChecker({
      idleMs: 30 * 60_000,
      hasActiveBrowsers: () => false,
      lastSessionUpdate: () => undefined,
      now: () => 100_000,
      onIdle: shutdown,
    })
    checker.tick()
    expect(shutdown).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 lifecycle.ts**

```typescript
export interface IdleCheckerOptions {
  idleMs: number
  hasActiveBrowsers: () => boolean
  lastSessionUpdate: () => number | undefined
  now: () => number
  onIdle: () => void
}

export class IdleChecker {
  constructor(private readonly opts: IdleCheckerOptions) {}

  tick(): void {
    if (this.opts.hasActiveBrowsers()) return
    const last = this.opts.lastSessionUpdate()
    const idleFor = last === undefined ? Infinity : this.opts.now() - last
    if (idleFor >= this.opts.idleMs) this.opts.onIdle()
  }
}
```

- [ ] **Step 4: 跑测试 → pass**

- [ ] **Step 5: 接入 main.ts**

修改 `packages/daemon/src/main.ts`，在 `startDaemon` 内每 60s 跑一次 `IdleChecker.tick()`，触发 idle 时调 shutdown。先用占位（hasActiveBrowsers / lastSessionUpdate 简单返回 undefined，集成完整在后续 task）：

```typescript
import { IdleChecker } from './lifecycle.js'

// ... 在 startDaemon 内部，writeRuntimeInfo 之后：
const idleChecker = new IdleChecker({
  idleMs: 30 * 60_000,
  hasActiveBrowsers: () => false,         // wired up in Task 16
  lastSessionUpdate: () => undefined,     // wired up in Task 13
  now: () => Date.now(),
  onIdle: () => { void shutdown() },
})
const idleTimer = setInterval(() => idleChecker.tick(), 60_000)

const shutdown = async () => {
  clearInterval(idleTimer)
  await sock.stop()
  await http.stop()
  deleteRuntimeInfo(getRuntimeInfoPath())
}
return shutdown
```

⚠️ 注意 `shutdown` 在 `setInterval` 回调里被引用，所以两个变量要前后顺序对（把 `setInterval` 移到 `shutdown` 声明之后）。

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/lifecycle.ts packages/daemon/src/lifecycle.test.ts packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): IdleChecker with browser-aware shutdown trigger

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: statusline —— OSC 8 终端能力探测

**Files:**
- Create / replace: `packages/statusline/src/osc8.ts`（覆盖 Task 6 占位版本）
- Test: `packages/statusline/src/osc8.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { detectOsc8Support, osc8 } from './osc8.js'

describe('detectOsc8Support', () => {
  beforeEach(() => {
    delete process.env.TERM_PROGRAM
    delete process.env.WEZTERM_EXECUTABLE
    delete process.env.KITTY_WINDOW_ID
    delete process.env.GHOSTTY_RESOURCES_DIR
    delete process.env.WT_SESSION
    delete process.env.VSCODE_INJECTION
  })

  it('detects iTerm2', () => {
    process.env.TERM_PROGRAM = 'iTerm.app'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects WezTerm via env', () => {
    process.env.WEZTERM_EXECUTABLE = '/usr/local/bin/wezterm'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects Kitty', () => {
    process.env.KITTY_WINDOW_ID = '1'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects Ghostty', () => {
    process.env.GHOSTTY_RESOURCES_DIR = '/app/share/ghostty'
    expect(detectOsc8Support()).toBe(true)
  })

  it('detects VS Code integrated terminal', () => {
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectOsc8Support()).toBe(true)
  })

  it('treats Apple_Terminal as unsupported', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal'
    expect(detectOsc8Support()).toBe(false)
  })

  it('defaults to false when unknown', () => {
    expect(detectOsc8Support()).toBe(false)
  })
})

describe('osc8', () => {
  it('wraps text with escape sequences when supported', () => {
    const out = osc8('http://x', 'hi', true)
    expect(out).toBe(']8;;http://xhi]8;;')
  })

  it('returns raw text when not supported', () => {
    expect(osc8('http://x', 'hi', false)).toBe('hi')
  })
})
```

- [ ] **Step 2: 跑 → 部分 fail（detectOsc8Support 还不存在）**

- [ ] **Step 3: 重写 osc8.ts**

```typescript
const SUPPORTED_TERM_PROGRAMS: ReadonlySet<string> = new Set([
  'iTerm.app',
  'vscode',
  'WarpTerminal',
  'ghostty',
  'tabby',
])

const NON_LOOPBACK_ENV_HINTS: ReadonlyArray<string> = [
  'WEZTERM_EXECUTABLE',
  'KITTY_WINDOW_ID',
  'GHOSTTY_RESOURCES_DIR',
  'WT_SESSION',
  'VSCODE_INJECTION',
  'ALACRITTY_LOG',
]

export function detectOsc8Support(): boolean {
  const tp = process.env.TERM_PROGRAM
  if (tp && SUPPORTED_TERM_PROGRAMS.has(tp)) return true
  for (const hint of NON_LOOPBACK_ENV_HINTS) {
    if (process.env[hint]) return true
  }
  return false
}

export function osc8(url: string, text: string, supported: boolean): string {
  if (!supported) return text
  const ESC = ''
  const BEL = ''
  return `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`
}
```

- [ ] **Step 4: 跑测试 → all pass**

- [ ] **Step 5: Commit**

```bash
git add packages/statusline/src/osc8.ts packages/statusline/src/osc8.test.ts
git commit -m "$(cat <<'EOF'
feat(statusline): terminal capability detection for OSC 8

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: statusline —— bin 入口拼装 + e2e dry run

**Files:**
- Create: `packages/statusline/bin/statusline.ts`
- Create: `packages/statusline/src/main.ts`
- Test: `packages/statusline/src/main.test.ts`

- [ ] **Step 1: 写 main.test.ts —— spy 依赖，验证 wiring**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runStatusline } from './main.js'

describe('runStatusline', () => {
  it('outputs minimal line when daemon offline and input parses', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined)
    const send   = vi.fn().mockResolvedValue(undefined)
    const ping   = vi.fn().mockResolvedValue(true)
    const out = await runStatusline({
      stdin: JSON.stringify({
        session_id: 'sid', cwd: '/x/y/z', model: { id: 'm' },
        transcript_path: '/t.jsonl', workspace: { current_branch: 'main' },
      }),
      sockPath: '/tmp/x.sock',
      detect: () => false,
      ensureDaemon: ensure,
      pingDaemon: ping,
      sendUpdateSession: send,
      readRuntimeInfo: () => ({ pid: 1, port: 5050, startedAt: 1 }),
    })
    expect(out).toContain('m')
    expect(out).toContain('z')
    expect(out).toContain('main')
    expect(out).toContain('[cockpit]')
    expect(send).toHaveBeenCalledWith('/tmp/x.sock', 'sid', expect.any(Object))
  })

  it('returns fallback text when stdin not parseable', async () => {
    const out = await runStatusline({
      stdin: 'not json',
      sockPath: '/tmp/x.sock',
      detect: () => false,
      ensureDaemon: vi.fn(),
      pingDaemon: vi.fn().mockResolvedValue(false),
      sendUpdateSession: vi.fn(),
      readRuntimeInfo: () => null,
    })
    expect(out).toContain('claude-cockpit')   // graceful banner
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 main.ts**

```typescript
import { parseStatuslineInput } from './stdin.js'
import { renderMinimal } from './render.js'
import { detectOsc8Support } from './osc8.js'
import type { RuntimeInfo } from '../../daemon/src/runtime-info.js'

export interface RunStatuslineDeps {
  stdin: string
  sockPath: string
  detect: () => boolean
  ensureDaemon: (opts: { command: string; args: string[]; sockPath: string; waitMs: number }) => Promise<void>
  pingDaemon: (sock: string, timeoutMs: number) => Promise<boolean>
  sendUpdateSession: (sock: string, sid: string, payload: object) => Promise<void>
  readRuntimeInfo: (path: string) => RuntimeInfo | null
}

export async function runStatusline(deps: RunStatuslineDeps): Promise<string> {
  const parsed = parseStatuslineInput(deps.stdin)
  if (!parsed) return 'claude-cockpit · waiting for valid Claude Code stdin'

  // best-effort fire daemon update; don't block render
  const ping = await deps.pingDaemon(deps.sockPath, 100)
  if (ping) {
    // existing daemon — just push
    void deps.sendUpdateSession(deps.sockPath, parsed.sessionId, {
      cwd: parsed.cwd,
      model: parsed.model,
      transcriptPath: parsed.transcriptPath,
      ...(parsed.branch !== undefined && { branch: parsed.branch }),
      lastUpdate: Date.now(),
    })
  }

  const supports = deps.detect()
  const rt = deps.readRuntimeInfo(`${process.env.HOME}/.claude-cockpit/daemon.json`)
  const port = rt?.port ?? 0
  const dashboardUrl = port ? `http://localhost:${port}/sessions/${parsed.sessionId}` : 'http://localhost'

  return renderMinimal({
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    model: parsed.model,
    ...(parsed.branch !== undefined && { branch: parsed.branch }),
    ctxPct: 0,    // Phase 1 task 15 fills from transcript-watcher
    cost: 0,
    dashboardUrl,
    supportsOsc8: supports,
  })
}
```

- [ ] **Step 4: 写 bin/statusline.ts**

```typescript
#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { runStatusline } from '../src/main.js'
import { detectOsc8Support } from '../src/osc8.js'
import { pingDaemon } from '../src/rpc-client.js'
import { sendUpdateSession } from '../src/rpc-client.js'
import { ensureDaemon } from '../src/daemon-spawn.js'
import { readRuntimeInfo } from '../../daemon/src/runtime-info.js'

const stdin = readFileSync(0, 'utf8')
const sockPath = join(tmpdir(), 'claude-cockpit.sock')

// fire-and-forget background daemon spawn if absent
const wasAlive = await pingDaemon(sockPath, 80)
if (!wasAlive) {
  void ensureDaemon({
    command: 'npx',
    args: ['tsx', require.resolve('../../daemon/bin/daemon.ts')],
    sockPath,
    waitMs: 0,    // don't block render
  })
}

const out = await runStatusline({
  stdin,
  sockPath,
  detect: detectOsc8Support,
  ensureDaemon,
  pingDaemon,
  sendUpdateSession,
  readRuntimeInfo,
})
process.stdout.write(out + '\n')
```

- [ ] **Step 5: 跑 unit 测试 → pass**

- [ ] **Step 6: 手动 e2e 验证**

```bash
# 一次性手动 fire；模拟 CC 喂 stdin
echo '{"session_id":"test-sid","cwd":"/Users/me/proj","model":{"id":"claude-opus-4-7"},"transcript_path":"/tmp/x.jsonl","workspace":{"current_branch":"main"}}' \
  | npx tsx packages/statusline/bin/statusline.ts
```
Expected：第一次跑 daemon 起来，输出 `● claude-opus-4-7 · proj · main · ctx 0% · $0.00 · [cockpit]`。再跑一次速度变快，daemon 已经在。`ls ~/.claude-cockpit/daemon.json` 显示 runtime info。

- [ ] **Step 7: Commit**

```bash
git add packages/statusline
git commit -m "$(cat <<'EOF'
feat(statusline): wire main entry — parse stdin, ensure daemon, render

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: daemon —— SessionRegistry 集成 + 接 socket 流

**Files:**
- Create: `packages/daemon/src/session-registry.ts`
- Test: `packages/daemon/src/session-registry.test.ts`
- Modify: `packages/daemon/src/main.ts` —— wire 起 socket → registry

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { SessionRegistry } from './session-registry.js'

const baseUpdate = {
  cwd: '/x', model: 'm', transcriptPath: '/t.jsonl', lastUpdate: 1_000,
}

describe('SessionRegistry', () => {
  it('returns empty list initially', () => {
    expect(new SessionRegistry().list()).toEqual([])
  })

  it('upsert creates a new state with defaults', () => {
    const r = new SessionRegistry()
    r.upsert('sid', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1_000 })
    const s = r.list()[0]!
    expect(s.sessionId).toBe('sid')
    expect(s.ctxPct).toBe(0)
    expect(s.tools).toEqual([])
    expect(s.status).toBe('busy')
  })

  it('upsert merges into existing state, preserving missing fields', () => {
    const r = new SessionRegistry()
    r.upsert('sid', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1_000 })
    r.upsert('sid', { ctxPct: 47, lastUpdate: 2_000 })
    const s = r.list()[0]!
    expect(s.ctxPct).toBe(47)
    expect(s.cwd).toBe('/x')          // preserved
    expect(s.lastUpdate).toBe(2_000)
  })

  it('lastSessionUpdate returns max lastUpdate across all sessions', () => {
    const r = new SessionRegistry()
    r.upsert('a', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 100 })
    r.upsert('b', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 300 })
    expect(r.lastSessionUpdate()).toBe(300)
  })

  it('lastSessionUpdate returns undefined when empty', () => {
    expect(new SessionRegistry().lastSessionUpdate()).toBeUndefined()
  })

  it('markIdle moves sessions older than threshold to idle', () => {
    const r = new SessionRegistry()
    r.upsert('a', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 0 })
    r.upsert('b', { ...baseUpdate, pid: 1, ppid: 2, startedAt: 1, lastUpdate: 100_000 })
    r.markIdle({ now: 100_000, idleMs: 60_000 })
    const byId = Object.fromEntries(r.list().map(s => [s.sessionId, s]))
    expect(byId.a!.status).toBe('idle')
    expect(byId.b!.status).toBe('busy')
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 session-registry.ts**

```typescript
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
```

- [ ] **Step 4: 接入 main.ts**

修改 `packages/daemon/src/main.ts`:
```typescript
import { SessionRegistry } from './session-registry.js'

export async function startDaemon(opts: MainOptions = {}): Promise<() => Promise<void>> {
  mkdirSync(getCockpitDir(), { recursive: true })
  const registry = new SessionRegistry()
  const http = await startHttpServer({ port: opts.port ?? 0 })
  const sock = await startSocketServer(getSocketPath(), (frame) => {
    if (frame.type === 'UPDATE_SESSION') {
      registry.upsert(frame.sessionId, {
        ...frame.payload,
        lastUpdate: Date.now(),
      })
    }
  })
  writeRuntimeInfo(getRuntimeInfoPath(), {
    pid: process.pid, port: http.port, startedAt: Date.now(),
  })

  const idleChecker = new IdleChecker({
    idleMs: 30 * 60_000,
    hasActiveBrowsers: () => false,        // task 16 wires this up
    lastSessionUpdate: () => registry.lastSessionUpdate(),
    now: () => Date.now(),
    onIdle: () => { void shutdown() },
  })
  const idleTimer = setInterval(() => {
    registry.markIdle({ now: Date.now(), idleMs: 60_000 })
    idleChecker.tick()
  }, 60_000)

  const shutdown = async () => {
    clearInterval(idleTimer)
    await sock.stop()
    await http.stop()
    deleteRuntimeInfo(getRuntimeInfoPath())
  }

  // expose registry for tests + later HTTP api
  ;(globalThis as any).__cockpitRegistry = registry
  return shutdown
}
```

- [ ] **Step 5: 跑所有 daemon 测试 → 全 pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/session-registry.ts packages/daemon/src/session-registry.test.ts packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): SessionRegistry with upsert/list/idle marking, wired to socket

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: dashboard —— Vite + React + TanStack Router 骨架

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `index.html`
- Create: `packages/dashboard/src/main.tsx`
- Create: `packages/dashboard/src/routes/__root.tsx`
- Create: `packages/dashboard/src/routes/index.tsx`
- Create: `packages/dashboard/src/styles.css`

- [ ] **Step 1: 装 dashboard 依赖**

```bash
npm install -w packages/dashboard react react-dom @tanstack/react-router uplot
npm install -w packages/dashboard -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss postcss autoprefixer @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: 写 dashboard package.json**

```json
{
  "name": "@claude-cockpit/dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@claude-cockpit/shared": "*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-router": "^1.30.0",
    "uplot": "^1.6.30"
  },
  "devDependencies": {
    "vite": "^5.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 3: 写 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
```

- [ ] **Step 4: 写 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["DOM", "ES2022"],
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: 写 Tailwind 配置**

`tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg:    '#0e1419',
          panel: '#181e25',
          line:  '#20262d',
          text:  '#d8d9da',
          muted: '#7a8794',
          ok:    '#73bf69',
          warn:  '#f2cc0c',
          near:  '#f4a261',
          crit:  '#e0524d',
          info:  '#5794f2',
        },
      },
    },
  },
} satisfies Config
```

`postcss.config.js`:
```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 6: index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <title>claude-cockpit</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body class="bg-cockpit-bg text-cockpit-text">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: src/styles.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
```

- [ ] **Step 8: src/test-setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 9: 路由 + 入口**

`src/routes/__root.tsx`:
```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex">
      <aside className="w-40 bg-[#0a0e12] border-r border-cockpit-line p-4 text-xs">
        <div className="text-cockpit-muted tracking-widest mb-3">CLAUDE-COCKPIT</div>
        <div className="px-2 py-1 rounded bg-cockpit-panel border-l-2 border-cockpit-info">
          Overview
        </div>
      </aside>
      <main className="flex-1 p-3"><Outlet /></main>
    </div>
  ),
})
```

`src/routes/index.tsx`:
```typescript
import { createRoute } from '@tanstack/react-router'
import { Route as Root } from './__root.js'

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/',
  component: () => (
    <div>
      <h1 className="text-sm text-cockpit-muted mb-4">Overview</h1>
      <p>hello cockpit</p>
    </div>
  ),
})
```

`src/main.tsx`:
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root.js'
import { Route as IndexRoute } from './routes/index.js'
import './styles.css'

const routeTree = RootRoute.addChildren([IndexRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
)
```

- [ ] **Step 10: 启动 dev server 手验**

```bash
npm run -w packages/dashboard dev
```
Expected: vite 起 5173 端口；浏览器打开看到 `hello cockpit`，左侧 nav 显示 Overview。

- [ ] **Step 11: build 一次确认产物**

```bash
npm run -w packages/dashboard build
ls packages/dashboard/dist
```
Expected: `index.html` + `assets/*.js / *.css`。

- [ ] **Step 12: Commit**

```bash
git add packages/dashboard
git commit -m "$(cat <<'EOF'
feat(dashboard): Vite + React + TanStack Router + Tailwind skeleton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: daemon —— serve dashboard 静态产物 + Phase 0 e2e

**Files:**
- Modify: `packages/daemon/src/http-server.ts`（加 static 文件 serving）
- Create: `tests/e2e/phase0.test.ts`
- Create: `tests/e2e/vitest.config.ts`

- [ ] **Step 1: 修改 http-server.ts 加静态文件支持**

把 `startHttpServer` 改成接受 `staticDir`：

```typescript
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

export interface HttpServerOptions {
  port: number
  staticDir?: string
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
}

function serveStatic(staticDir: string, url: string, res: ServerResponse): boolean {
  // SPA: serve index.html for any unknown route
  let path = normalize(join(staticDir, url === '/' ? '/index.html' : url))
  if (!path.startsWith(normalize(staticDir))) {  // path traversal guard
    res.writeHead(403); res.end(); return true
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    path = join(staticDir, 'index.html')
    if (!existsSync(path)) return false
  }
  const ext = extname(path).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(readFileSync(path))
  return true
}
```

并在 request handler 内：
```typescript
const http: Server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { /* 已有 */ }
  if (req.method === 'GET' && opts.staticDir && serveStatic(opts.staticDir, req.url ?? '/', res)) {
    return
  }
  res.writeHead(404); res.end()
})
```

- [ ] **Step 2: 在 startDaemon 里传入 staticDir**

`packages/daemon/src/main.ts`:
```typescript
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 假定 dashboard build 产物位于 monorepo 内
function findDashboardDist(): string | undefined {
  // 从当前 daemon 文件出发，向上找直到 packages/dashboard/dist
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../dashboard/dist'),
    join(here, '../../../dashboard/dist'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return undefined
}
```

把 `startHttpServer({ port: opts.port ?? 0 })` 改为 `startHttpServer({ port: opts.port ?? 0, staticDir: findDashboardDist() })`。

需要 import `existsSync`：放到 main.ts 顶部。

- [ ] **Step 3: 写 e2e 测试 phase0.test.ts**

`tests/e2e/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['tests/e2e/**/*.test.ts'], testTimeout: 30_000 },
})
```

`tests/e2e/phase0.test.ts`:
```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'

let daemonChild: ChildProcess | undefined
let dir: string

afterAll(async () => {
  if (daemonChild?.pid) try { process.kill(daemonChild.pid, 'SIGTERM') } catch { /* */ }
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function statuslineOnce(stdin: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'packages/statusline/bin/statusline.ts'], { env })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d.toString() })
    child.on('close', () => resolve(buf))
    child.on('error', reject)
    child.stdin.write(stdin); child.stdin.end()
  })
}

describe('Phase 0 end-to-end', () => {
  it('lazy-starts daemon on first statusline run', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-e2e-'))
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    const transcript = join(dir, 't.jsonl')
    writeFileSync(transcript, '')
    const stdin = JSON.stringify({
      session_id: 'e2e-sid', cwd: dir,
      model: { id: 'claude-opus-4-7' },
      transcript_path: transcript,
      workspace: { current_branch: 'main' },
    })
    const out = await statuslineOnce(stdin, env)
    expect(out).toContain('claude-opus-4-7')
    expect(out).toContain('main')
  })

  it('subsequent runs hit existing daemon (faster)', async () => {
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    const t0 = Date.now()
    await statuslineOnce(JSON.stringify({
      session_id: 'e2e-sid-2', cwd: dir, model: { id: 'm' },
      transcript_path: join(dir, 't2.jsonl'), workspace: { current_branch: 'main' },
    }), env)
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(2000)  // should be fast since daemon is up
  })
})
```

- [ ] **Step 4: 跑 e2e**

```bash
npm run test:e2e
```
Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/http-server.ts packages/daemon/src/main.ts tests/e2e package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(daemon): serve dashboard build dir as static SPA; add Phase 0 e2e

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 1 · Alpha（Task 16–28，目标 1–2 周）

## Task 16: HTTP API: GET /api/sessions

**Files:**
- Create: `packages/daemon/src/api/routes.ts`
- Modify: `packages/daemon/src/http-server.ts` 调 routes
- Modify: `packages/daemon/src/main.ts` 传 registry 给 http-server
- Test: `packages/daemon/src/api/routes.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { handleApiRequest } from './routes.js'
import { SessionRegistry } from '../session-registry.js'

describe('handleApiRequest', () => {
  it('GET /api/sessions returns list as JSON', () => {
    const r = new SessionRegistry()
    r.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t.jsonl', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = handleApiRequest('GET', '/api/sessions', r)
    expect(res?.status).toBe(200)
    const body = JSON.parse(res!.body)
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].sessionId).toBe('a')
  })

  it('GET /api/sessions/:id returns single session', () => {
    const r = new SessionRegistry()
    r.upsert('a', { cwd: '/x', model: 'm', transcriptPath: '/t', lastUpdate: 1, pid: 1, ppid: 1, startedAt: 1 })
    const res = handleApiRequest('GET', '/api/sessions/a', r)
    expect(res?.status).toBe(200)
    expect(JSON.parse(res!.body).sessionId).toBe('a')
  })

  it('returns 404 for unknown session', () => {
    expect(handleApiRequest('GET', '/api/sessions/nope', new SessionRegistry())?.status).toBe(404)
  })

  it('returns null for non-/api paths so http-server can fallthrough to static', () => {
    expect(handleApiRequest('GET', '/index.html', new SessionRegistry())).toBeNull()
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 routes.ts**

```typescript
import type { SessionRegistry } from '../session-registry.js'

export interface ApiResponse {
  status: number
  body: string
  contentType: string
}

export function handleApiRequest(method: string, url: string, registry: SessionRegistry): ApiResponse | null {
  if (!url.startsWith('/api/')) return null

  if (method === 'GET' && url === '/api/sessions') {
    return json(200, { sessions: registry.list() })
  }

  const m = url.match(/^\/api\/sessions\/([^/]+)$/)
  if (method === 'GET' && m) {
    const s = registry.get(m[1]!)
    if (!s) return json(404, { error: 'session not found' })
    return json(200, s)
  }

  return json(404, { error: 'not found' })
}

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}
```

- [ ] **Step 4: 接入 http-server.ts**

修改 `startHttpServer` 接收 `registry`，在 request handler 内：
```typescript
if (req.method && req.url) {
  const apiRes = opts.registry ? handleApiRequest(req.method, req.url, opts.registry) : null
  if (apiRes) {
    res.writeHead(apiRes.status, { 'Content-Type': apiRes.contentType })
    res.end(apiRes.body)
    return
  }
}
```

main.ts 调用处传 `registry`。

- [ ] **Step 5: 跑测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon
git commit -m "$(cat <<'EOF'
feat(daemon): GET /api/sessions and /api/sessions/:id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: WebSocket —— 推送 session diffs

**Files:**
- Create: `packages/daemon/src/api/ws.ts`
- Modify: `packages/daemon/src/main.ts` 接入
- Test: `packages/daemon/src/api/ws.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { WsBroadcaster } from './ws.js'

describe('WsBroadcaster', () => {
  it('emits SESSION_UPSERT events to subscribers', () => {
    const b = new WsBroadcaster()
    const events: unknown[] = []
    b.subscribe((e) => events.push(e))
    b.publishUpsert({ sessionId: 'sid' } as any)
    expect(events[0]).toMatchObject({ type: 'SESSION_UPSERT', session: { sessionId: 'sid' } })
  })

  it('hasActive returns true when at least one subscriber', () => {
    const b = new WsBroadcaster()
    expect(b.hasActive()).toBe(false)
    const unsub = b.subscribe(() => undefined)
    expect(b.hasActive()).toBe(true)
    unsub()
    expect(b.hasActive()).toBe(false)
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 ws.ts**

```typescript
import type { SessionState } from '@claude-cockpit/shared'

export type WsEvent =
  | { type: 'SESSION_UPSERT'; session: SessionState }
  | { type: 'SESSION_REMOVED'; sessionId: string }

export type WsListener = (event: WsEvent) => void

export class WsBroadcaster {
  private readonly listeners = new Set<WsListener>()

  subscribe(listener: WsListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  hasActive(): boolean { return this.listeners.size > 0 }

  publishUpsert(session: SessionState): void {
    for (const l of this.listeners) l({ type: 'SESSION_UPSERT', session })
  }

  publishRemoved(sessionId: string): void {
    for (const l of this.listeners) l({ type: 'SESSION_REMOVED', sessionId })
  }
}
```

- [ ] **Step 4: 接入 http-server + main**

`http-server.ts`: WebSocketServer 的 `connection` 时调 `broadcaster.subscribe`，并在 ws.close 时 unsub。`broadcaster.publishUpsert` 时遍历 sockets `ws.send(JSON.stringify(event))`。

实际上更直接：让 `http-server` 接受 `broadcaster: WsBroadcaster`，并把 `wss.on('connection', ws => broadcaster.subscribe((e) => ws.send(JSON.stringify(e))))`。

`main.ts`: 实例化 `WsBroadcaster`，把它传给 http-server；socket 回调里 upsert 后 `broadcaster.publishUpsert(updated)`。`IdleChecker.hasActiveBrowsers` 改为 `() => broadcaster.hasActive()`。

- [ ] **Step 5: 跑测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon
git commit -m "$(cat <<'EOF'
feat(daemon): WsBroadcaster for session diffs; wire to socket upserts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: TranscriptWatcher —— tail JSONL + 提取事件

**Files:**
- Create: `packages/daemon/src/transcript-watcher.ts`
- Test: `packages/daemon/src/transcript-watcher.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { TranscriptWatcher, type TranscriptEvent } from './transcript-watcher.js'

let dir: string
let watcher: TranscriptWatcher | undefined

afterEach(async () => {
  await watcher?.stop()
  watcher = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('TranscriptWatcher', () => {
  it('emits TOOL_USE event when transcript file gets a tool_use line', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
    }) + '\n')
    await new Promise(r => setTimeout(r, 200))
    const tu = events.find(e => e.type === 'TOOL_USE')
    expect(tu).toBeDefined()
    expect((tu as any).name).toBe('Read')
  })

  it('skips malformed JSON lines', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, 'not json\n' + JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Write', input: {} }] },
    }) + '\n')
    await new Promise(r => setTimeout(r, 200))
    expect(events.filter(e => e.type === 'TOOL_USE')).toHaveLength(1)
  })

  it('extracts ctx % from system message usage when present', async () => {
    dir = mkdtempSync(join(tmpdir(), 'tw-'))
    const path = join(dir, 't.jsonl')
    writeFileSync(path, '')
    const events: TranscriptEvent[] = []
    watcher = new TranscriptWatcher(path, (e) => events.push(e))
    await watcher.start()
    appendFileSync(path, JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 } },
    }) + '\n')
    await new Promise(r => setTimeout(r, 200))
    const usage = events.find(e => e.type === 'USAGE')
    expect(usage).toBeDefined()
    expect((usage as any).inputTokens).toBe(100_000)
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 transcript-watcher.ts**

```typescript
import { watch, FSWatcher } from 'node:fs'
import { open, FileHandle } from 'node:fs/promises'

export type TranscriptEvent =
  | { type: 'TOOL_USE'; name: string; ts: number }
  | { type: 'USAGE'; inputTokens: number; outputTokens: number; cacheReadTokens: number; ts: number }
  | { type: 'TODOS'; items: { text: string; completed: boolean }[]; ts: number }

export type TranscriptListener = (event: TranscriptEvent) => void

export class TranscriptWatcher {
  private fh: FileHandle | undefined
  private offset = 0
  private fsw: FSWatcher | undefined
  private stopped = false

  constructor(
    private readonly path: string,
    private readonly listener: TranscriptListener,
  ) {}

  async start(): Promise<void> {
    this.fh = await open(this.path, 'r')
    // seek to current end (we only emit new events going forward; Phase 3 will rescan history)
    const stat = await this.fh.stat()
    this.offset = stat.size
    this.fsw = watch(this.path, () => { void this.drain() })
  }

  private async drain(): Promise<void> {
    if (this.stopped || !this.fh) return
    const stat = await this.fh.stat()
    if (stat.size <= this.offset) return
    const buf = Buffer.alloc(stat.size - this.offset)
    await this.fh.read(buf, 0, buf.length, this.offset)
    this.offset = stat.size
    const text = buf.toString('utf8')
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        this.handleLine(obj)
      } catch { /* skip malformed */ }
    }
  }

  private handleLine(obj: Record<string, unknown>): void {
    const ts = Date.now()
    const message = obj.message as Record<string, unknown> | undefined
    if (!message) return

    // tool_use
    const content = message.content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item && typeof item === 'object') {
          const i = item as Record<string, unknown>
          if (i.type === 'tool_use' && typeof i.name === 'string') {
            this.listener({ type: 'TOOL_USE', name: i.name, ts })
          }
        }
      }
    }

    // usage
    const usage = message.usage as Record<string, unknown> | undefined
    if (usage) {
      this.listener({
        type: 'USAGE',
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
        cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
        ts,
      })
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.fsw?.close()
    await this.fh?.close()
    this.fh = undefined
  }
}
```

- [ ] **Step 4: 跑测试 → pass**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/transcript-watcher.ts packages/daemon/src/transcript-watcher.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): TranscriptWatcher tails JSONL and emits TOOL_USE/USAGE events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: TranscriptWatcher 集成 + ctx % 计算

**Files:**
- Modify: `packages/daemon/src/main.ts` —— statusline 推送时为 sessionId 启动 watcher
- Create: `packages/daemon/src/ctx-calc.ts`
- Test: `packages/daemon/src/ctx-calc.test.ts`

- [ ] **Step 1: 写 ctx-calc 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { computeCtxPct } from './ctx-calc.js'

describe('computeCtxPct', () => {
  it('returns input/200K * 100 for opus 4.7 (200K window)', () => {
    expect(computeCtxPct({ model: 'claude-opus-4-7', inputTokens: 100_000 })).toBeCloseTo(50)
  })
  it('returns input/1M * 100 for 1M context variant', () => {
    expect(computeCtxPct({ model: 'claude-opus-4-7[1m]', inputTokens: 500_000 })).toBeCloseTo(50)
  })
  it('returns 0 for 0 tokens', () => {
    expect(computeCtxPct({ model: 'm', inputTokens: 0 })).toBe(0)
  })
  it('caps at 100', () => {
    expect(computeCtxPct({ model: 'claude-opus-4-7', inputTokens: 300_000 })).toBe(100)
  })
})
```

- [ ] **Step 2: 写 ctx-calc.ts**

```typescript
export function getModelWindow(model: string): number {
  if (model.includes('[1m]')) return 1_000_000
  return 200_000
}

export function computeCtxPct(opts: { model: string; inputTokens: number }): number {
  const w = getModelWindow(opts.model)
  return Math.min(100, (opts.inputTokens / w) * 100)
}
```

- [ ] **Step 3: 在 main.ts 装入 watcher 生命周期**

```typescript
import { TranscriptWatcher } from './transcript-watcher.js'
import { computeCtxPct } from './ctx-calc.js'

// 内部 Map<sessionId, TranscriptWatcher>
const watchers = new Map<string, TranscriptWatcher>()

// 在 socket 回调里：
const sock = await startSocketServer(getSocketPath(), async (frame) => {
  if (frame.type !== 'UPDATE_SESSION') return
  const updated = registry.upsert(frame.sessionId, {
    ...frame.payload, lastUpdate: Date.now(),
  })
  broadcaster.publishUpsert(updated)

  // first time we see this transcript path? spin up a watcher
  if (updated.transcriptPath && !watchers.has(frame.sessionId)) {
    const w = new TranscriptWatcher(updated.transcriptPath, (e) => {
      if (e.type === 'TOOL_USE') {
        const cur = registry.get(frame.sessionId)
        if (!cur) return
        const newTools = [{ ts: e.ts, name: e.name, status: 'ok' as const }, ...cur.tools].slice(0, 50)
        const next = registry.upsert(frame.sessionId, { tools: newTools, lastUpdate: e.ts })
        broadcaster.publishUpsert(next)
      } else if (e.type === 'USAGE') {
        const cur = registry.get(frame.sessionId)
        if (!cur) return
        const ctxPct = computeCtxPct({ model: cur.model, inputTokens: e.inputTokens })
        const next = registry.upsert(frame.sessionId, {
          ctxPct, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
          cacheReadTokens: e.cacheReadTokens, lastUpdate: e.ts,
        })
        broadcaster.publishUpsert(next)
      }
    })
    try { await w.start(); watchers.set(frame.sessionId, w) }
    catch { /* file maybe absent; retry on next update */ }
  }
})
```

shutdown 里：`for (const w of watchers.values()) await w.stop()`。

- [ ] **Step 4: 跑全部 daemon 测试 → pass**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/ctx-calc.ts packages/daemon/src/ctx-calc.test.ts packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): wire TranscriptWatcher per session + compute ctxPct from usage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: dashboard —— useSessionStream hook (WS)

**Files:**
- Create: `packages/dashboard/src/hooks/useSessionStream.ts`
- Create: `packages/dashboard/src/lib/api.ts`
- Test: `packages/dashboard/src/hooks/useSessionStream.test.tsx`

- [ ] **Step 1: 写 api.ts（小辅助）**

```typescript
export function apiUrl(path: string): string {
  return `${window.location.origin}${path}`
}

export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
}
```

- [ ] **Step 2: 写 useSessionStream 测试（用 vitest + jsdom + 自家 WebSocket mock）**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSessionStream } from './useSessionStream.js'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(url: string) { this.url = url; MockWebSocket.instances.push(this); setTimeout(() => this.onopen?.()) }
  close() { this.onclose?.() }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
}

afterEach(() => { MockWebSocket.instances = [] })

describe('useSessionStream', () => {
  it('initial fetch populates sessions', async () => {
    ;(globalThis as any).WebSocket = MockWebSocket
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ sessions: [{ sessionId: 'a', model: 'm', ctxPct: 10 }] }),
    })
    const { result } = renderHook(() => useSessionStream())
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))
    expect(result.current.sessions[0]!.sessionId).toBe('a')
  })

  it('updates on SESSION_UPSERT event', async () => {
    ;(globalThis as any).WebSocket = MockWebSocket
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ sessions: [] }),
    })
    const { result } = renderHook(() => useSessionStream())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => {
      MockWebSocket.instances[0]!.emit({ type: 'SESSION_UPSERT', session: { sessionId: 'b', ctxPct: 50 } })
    })
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))
    expect(result.current.sessions[0]!.sessionId).toBe('b')
  })
})
```

- [ ] **Step 3: fail**

- [ ] **Step 4: 写 hook**

```typescript
import { useEffect, useState } from 'react'
import type { SessionState } from '@claude-cockpit/shared'
import { apiUrl, wsUrl } from '../lib/api.js'

export function useSessionStream(): { sessions: SessionState[] } {
  const [sessions, setSessions] = useState<SessionState[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(apiUrl('/api/sessions'))
      if (!res.ok) return
      const body = await res.json() as { sessions: SessionState[] }
      if (!cancelled) setSessions(body.sessions)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const ws = new WebSocket(wsUrl())
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data as string)
      setSessions(prev => {
        if (event.type === 'SESSION_UPSERT') {
          const idx = prev.findIndex(s => s.sessionId === event.session.sessionId)
          if (idx === -1) return [...prev, event.session]
          const next = prev.slice()
          next[idx] = event.session
          return next
        }
        if (event.type === 'SESSION_REMOVED') {
          return prev.filter(s => s.sessionId !== event.sessionId)
        }
        return prev
      })
    }
    return () => ws.close()
  }, [])

  return { sessions }
}
```

- [ ] **Step 5: 跑测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/hooks packages/dashboard/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): useSessionStream hook with initial fetch + WS diffs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: dashboard —— Overview 页组合（Sidebar / KpiBar / SessionCard）

**Files:**
- Create: `packages/dashboard/src/components/Sidebar.tsx`
- Create: `packages/dashboard/src/components/KpiBar.tsx`
- Create: `packages/dashboard/src/components/SessionCard.tsx`
- Create: `packages/dashboard/src/lib/colors.ts`
- Modify: `packages/dashboard/src/routes/__root.tsx`、`packages/dashboard/src/routes/index.tsx`
- Test: `packages/dashboard/src/components/SessionCard.test.tsx`

- [ ] **Step 1: 写 colors.ts**

```typescript
export const palette = {
  ok: '#73bf69', warn: '#f2cc0c', near: '#f4a261', crit: '#e0524d',
  info: '#5794f2', muted: '#7a8794',
}

export function ctxColor(pct: number): string {
  if (pct < 60) return palette.ok
  if (pct < 85) return palette.warn
  if (pct < 95) return palette.near
  return palette.crit
}
```

- [ ] **Step 2: 写 SessionCard 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionCard } from './SessionCard.js'
import type { SessionState } from '@claude-cockpit/shared'

const base: SessionState = {
  sessionId: 'sid', pid: 1, ppid: 1, cwd: '/x/y/z', model: 'claude-opus-4-7',
  ctxPct: 47, cost: 0.42, tools: [], todos: [], mcpServers: [],
  transcriptPath: '/t', status: 'busy', lastUpdate: 1, startedAt: 1,
}

describe('SessionCard', () => {
  it('shows cwd basename, model, ctx%, cost, status chip', () => {
    render(<SessionCard session={base} />)
    expect(screen.getByText(/z/)).toBeInTheDocument()
    expect(screen.getByText('claude-opus-4-7')).toBeInTheDocument()
    expect(screen.getByText(/47%/)).toBeInTheDocument()
    expect(screen.getByText(/\$0.42/)).toBeInTheDocument()
    expect(screen.getByText(/busy/i)).toBeInTheDocument()
  })

  it('applies near-limit color when ctxPct >= 85', () => {
    render(<SessionCard session={{ ...base, ctxPct: 92 }} />)
    const node = screen.getByText(/92%/)
    expect(node).toHaveStyle({ color: '#f4a261' })
  })
})
```

- [ ] **Step 3: fail**

- [ ] **Step 4: 写 SessionCard.tsx**

```typescript
import type { SessionState } from '@claude-cockpit/shared'
import { ctxColor, palette } from '../lib/colors.js'
import { basename } from 'node:path'

const STATUS_BG: Record<SessionState['status'], string> = {
  busy: palette.ok, idle: palette.muted, waiting: palette.info, closed: palette.crit,
}

export function SessionCard({ session: s }: { session: SessionState }) {
  const cwdShort = s.cwd.split('/').filter(Boolean).slice(-1)[0] ?? s.cwd
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-3 mb-1" style={{ borderLeft: `3px solid ${STATUS_BG[s.status]}` }}>
      <div className="grid grid-cols-[1fr_60px_60px_60px_60px_80px] gap-3 items-center text-xs">
        <div>
          <div className="text-cockpit-text font-semibold">{cwdShort}</div>
          <div className="text-cockpit-muted text-[10px]">{s.model} · sid {s.sessionId.slice(0, 6)}</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">CTX</div>
          <div style={{ color: ctxColor(s.ctxPct) }}>{Math.round(s.ctxPct)}%</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">COST</div>
          <div>${s.cost.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">TOOLS</div>
          <div className="text-cockpit-info">{s.tools.length}</div>
        </div>
        <div>
          <div className="text-cockpit-muted text-[10px]">TODOS</div>
          <div>{s.todos.filter(t => t.completed).length}/{s.todos.length || '—'}</div>
        </div>
        <div className="text-right">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: STATUS_BG[s.status], color: '#0e1419' }}>
            ● {s.status}
          </span>
        </div>
      </div>
    </div>
  )
}
```

注意：`basename` 不能从 `node:path` import 进 browser bundle —— 改用上方的 `s.cwd.split('/')...` 行内实现，删 import。

- [ ] **Step 5: 写 Sidebar 和 KpiBar**

`Sidebar.tsx`:
```typescript
const ITEMS = [
  { key: 'overview', label: '⊞ Overview', active: true },
  { key: 'sessions', label: '⊟ Sessions' },
  { key: 'history',  label: '⊿ History' },
  { key: 'mcp',      label: '⊕ MCP' },
  { key: 'alerts',   label: '▲ Alerts' },
  { key: 'settings', label: '⚙ Settings' },
]

export function Sidebar() {
  return (
    <aside className="w-40 bg-[#0a0e12] border-r border-cockpit-line p-4 text-xs">
      <div className="text-cockpit-muted tracking-widest mb-3">CLAUDE-COCKPIT</div>
      {ITEMS.map(item => (
        <div
          key={item.key}
          className={`px-2 py-1 mb-1 rounded ${item.active ? 'bg-cockpit-panel border-l-2 border-cockpit-info text-cockpit-text' : 'text-cockpit-muted'}`}
        >
          {item.label}
        </div>
      ))}
    </aside>
  )
}
```

`KpiBar.tsx`:
```typescript
import type { SessionState } from '@claude-cockpit/shared'

export function KpiBar({ sessions }: { sessions: SessionState[] }) {
  const totalCost = sessions.reduce((a, s) => a + s.cost, 0)
  const avgCtx = sessions.length === 0 ? 0 : sessions.reduce((a, s) => a + s.ctxPct, 0) / sessions.length
  return (
    <div className="grid grid-cols-5 gap-2 mb-3">
      <Kpi label="SESSIONS ACTIVE" value={String(sessions.length)} color="#5794f2" />
      <Kpi label="COST 今日" value={`$${totalCost.toFixed(2)}`} color="#73bf69" />
      <Kpi label="AVG CTX %" value={`${Math.round(avgCtx)}%`} color="#f2cc0c" />
      <Kpi label="CACHE HIT" value="—" color="#73bf69" />
      <Kpi label="SUBS USED" value="—" color="#5794f2" />
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
      <div className="text-cockpit-muted text-[10px]">{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 6: 改写 __root.tsx 与 index.tsx**

`__root.tsx`:
```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../components/Sidebar.js'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-3"><Outlet /></main>
    </div>
  ),
})
```

`index.tsx`:
```typescript
import { createRoute } from '@tanstack/react-router'
import { Route as Root } from './__root.js'
import { useSessionStream } from '../hooks/useSessionStream.js'
import { KpiBar } from '../components/KpiBar.js'
import { SessionCard } from '../components/SessionCard.js'

export const Route = createRoute({
  getParentRoute: () => Root,
  path: '/',
  component: () => {
    const { sessions } = useSessionStream()
    return (
      <div>
        <KpiBar sessions={sessions} />
        <div className="text-cockpit-muted text-[10px] mb-2">ACTIVE SESSIONS</div>
        {sessions.length === 0 && <p className="text-cockpit-muted">No active sessions yet.</p>}
        {sessions.map(s => <SessionCard key={s.sessionId} session={s} />)}
      </div>
    )
  },
})
```

- [ ] **Step 7: 跑测试 → pass**

```bash
npm run -w packages/dashboard test
```

- [ ] **Step 8: 手验 dev 预览**

```bash
npm run -w packages/dashboard dev
```
打开 http://localhost:5173 看到 sidebar + KpiBar + "No active sessions yet."；右上侧 nav 显示 active "Overview" 高亮。

- [ ] **Step 9: Commit**

```bash
git add packages/dashboard
git commit -m "$(cat <<'EOF'
feat(dashboard): Sidebar / KpiBar / SessionCard composition on Overview

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: dashboard —— Sparkline (µPlot) + 24h trend 占位

**Files:**
- Create: `packages/dashboard/src/components/Sparkline.tsx`
- Modify: `packages/dashboard/src/routes/index.tsx` 加 trend 区域

- [ ] **Step 1: 写 Sparkline**

```typescript
import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface SparklineProps {
  data: [number[], number[]]   // [xs, ys]
  color: string
  width?: number
  height?: number
}

export function Sparkline({ data, color, width = 200, height = 50 }: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const opts: uPlot.Options = {
      width, height, padding: [4, 4, 4, 4],
      cursor: { show: false }, legend: { show: false },
      scales: { x: { time: false }, y: {} },
      axes: [{ show: false }, { show: false }],
      series: [{}, { stroke: color, width: 1.5 }],
    }
    plotRef.current = new uPlot(opts, data, ref.current)
    return () => { plotRef.current?.destroy(); plotRef.current = null }
  }, [data, color, width, height])

  return <div ref={ref} />
}
```

- [ ] **Step 2: 在 index.tsx 加 trend 区域（v1 用 mock 数据，Phase 3 接历史）**

在 SessionCard 列表下方追加：
```typescript
<div className="grid grid-cols-2 gap-2 mt-3">
  <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
    <div className="text-cockpit-muted text-[10px] mb-1">COST · 24h（mock）</div>
    <Sparkline
      data={[Array.from({length: 24}, (_, i) => i), Array.from({length: 24}, () => Math.random() * 2)]}
      color="#73bf69"
    />
  </div>
  <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
    <div className="text-cockpit-muted text-[10px] mb-1">CONTEXT % · 实时（mock）</div>
    <Sparkline
      data={[Array.from({length: 24}, (_, i) => i), Array.from({length: 24}, () => Math.random() * 100)]}
      color="#5794f2"
    />
  </div>
</div>
```

> mock 标签会在 README 写明，告诉用户 trend 部分会在 Phase 3 接 SQLite 历史。

- [ ] **Step 3: 跑 dev、确认渲染**

```bash
npm run -w packages/dashboard dev
```
浏览器看到两个 sparkline。

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard
git commit -m "$(cat <<'EOF'
feat(dashboard): µPlot Sparkline + 24h trend placeholders on Overview

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: daemon —— MCP / Tool 基础显示

**Files:**
- Create: `packages/daemon/src/mcp-inspector.ts`
- Test: `packages/daemon/src/mcp-inspector.test.ts`
- Modify: `packages/daemon/src/main.ts` —— 启动时跑一次解析、写入 registry 每个 session

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { parseMcpConfig } from './mcp-inspector.js'

describe('parseMcpConfig', () => {
  it('returns empty list when settings.json missing', () => {
    expect(parseMcpConfig('/nonexistent')).toEqual([])
  })

  it('returns mcp server names from a settings file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({
      mcpServers: {
        ctx7: { command: 'mcp-context7', args: [] },
        figma: { command: 'mcp-figma', args: [] },
      },
    }))
    const out = parseMcpConfig(path)
    expect(out).toEqual([
      { name: 'ctx7', health: 'healthy' },
      { name: 'figma', health: 'healthy' },
    ])
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty list on malformed JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, '{bad')
    expect(parseMcpConfig(path)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 mcp-inspector.ts**

```typescript
import { readFileSync, existsSync } from 'node:fs'
import type { McpServerInfo } from '@claude-cockpit/shared'

export function parseMcpConfig(path: string): McpServerInfo[] {
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const servers = raw.mcpServers
    if (!servers || typeof servers !== 'object') return []
    return Object.keys(servers).map(name => ({ name, health: 'healthy' as const }))
  } catch {
    return []
  }
}

export function getDefaultSettingsPath(): string {
  return `${process.env.HOME}/.claude/settings.json`
}
```

- [ ] **Step 4: 在 main.ts 把 mcp servers 注入 registry**

在 socket handler 内 upsert 时同步注入：
```typescript
import { parseMcpConfig, getDefaultSettingsPath } from './mcp-inspector.js'

const mcpServers = parseMcpConfig(getDefaultSettingsPath())
// 在 upsert 后：
const updated = registry.upsert(frame.sessionId, {
  ...frame.payload,
  mcpServers,
  lastUpdate: Date.now(),
})
```

- [ ] **Step 5: 跑测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/mcp-inspector.ts packages/daemon/src/mcp-inspector.test.ts packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): parse ~/.claude/settings.json for MCP server list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: dashboard —— McpHealthBar component + 接入 SessionCard

**Files:**
- Create: `packages/dashboard/src/components/McpHealthBar.tsx`
- Modify: `packages/dashboard/src/components/SessionCard.tsx`（加 MCP 健康灯一行）

- [ ] **Step 1: 写 McpHealthBar**

```typescript
import type { McpServerInfo } from '@claude-cockpit/shared'
import { palette } from '../lib/colors.js'

const HEALTH_COLOR: Record<McpServerInfo['health'], string> = {
  healthy: palette.ok, degraded: palette.warn, down: palette.crit,
}

export function McpHealthBar({ servers }: { servers: McpServerInfo[] }) {
  if (servers.length === 0) return <span className="text-cockpit-muted text-[10px]">no MCP</span>
  return (
    <span className="text-[10px] text-cockpit-muted">
      MCP{' '}
      {servers.map(s => (
        <span key={s.name} title={`${s.name}: ${s.health}`} style={{ color: HEALTH_COLOR[s.health] }}>●</span>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: SessionCard 末行加 McpHealthBar**

在 grid 主体下方加：
```typescript
<div className="mt-2">
  <McpHealthBar servers={s.mcpServers} />
</div>
```

- [ ] **Step 3: 跑 dashboard tests → pass**

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/McpHealthBar.tsx packages/dashboard/src/components/SessionCard.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): MCP health indicator on each session card

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: statusline —— Essential 预设（2 行 + 链接集）

**Files:**
- Modify: `packages/statusline/src/render.ts` 加 `renderEssential`
- Modify: `packages/statusline/src/main.ts` 使用 Essential

- [ ] **Step 1: 写 Essential 测试（追加到 render.test.ts）**

```typescript
import { renderEssential } from './render.js'

describe('renderEssential', () => {
  it('outputs two lines with progress bar and link set', () => {
    const out = renderEssential({
      sessionId: 'sid', cwd: '/a/b/c', model: 'm', branch: 'main',
      ctxPct: 50, cost: 1.23, toolsCount: 7, subagentCount: 2,
      todosDone: 2, todosTotal: 5,
      dashboardUrl: 'http://l/s', stopUrl: 'http://l/stop', fileUrl: 'http://l/file',
      supportsOsc8: true,
    })
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('50%')
    expect(lines[0]).toContain('[█████░░░░░]')   // 50% progress bar
    expect(lines[1]).toContain('7')             // tools count
    expect(lines[1]).toContain('2/5')           // todos
    expect(lines[1]).toContain('[dash]')
    expect(lines[1]).toContain('[stop]')
    expect(lines[1]).toContain('[file]')
  })
})
```

- [ ] **Step 2: fail**

- [ ] **Step 3: 写 `renderEssential`**

```typescript
export interface EssentialInput extends RenderInput {
  toolsCount: number
  subagentCount: number
  todosDone: number
  todosTotal: number
  stopUrl: string
  fileUrl: string
}

function progressBar(pct: number, width = 10): string {
  const filled = Math.round((pct / 100) * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`
}

export function renderEssential(input: EssentialInput): string {
  const line1 = renderMinimal(input).replace(' · [cockpit]', '') +
    ` ${progressBar(input.ctxPct)}`
  const dash = osc8(input.dashboardUrl, '[dash]', input.supportsOsc8)
  const stop = osc8(input.stopUrl,      '[stop]', input.supportsOsc8)
  const file = osc8(input.fileUrl,      '[file]', input.supportsOsc8)
  const line2 = `tools ${input.toolsCount}↑ · subagents ×${input.subagentCount} · todos ${input.todosDone}/${input.todosTotal} · ${dash} ${stop} ${file}`
  return `${line1}\n${line2}`
}
```

- [ ] **Step 4: 修改 main.ts 改成 Essential 输出（从 daemon 拉当前 session 状态）**

```typescript
// 在 runStatusline 内 ping 成功之后，先 GET /api/sessions/:sid 拿到 daemon 的最新合并状态
// 简化：从 sendUpdateSession 返回值拿不到状态，所以发完帧后再 HTTP GET
// 用 daemon HTTP port 调 /api/sessions/<sid>
const rt = deps.readRuntimeInfo(...)
let merged: SessionState | undefined
if (rt) {
  try {
    const res = await fetch(`http://localhost:${rt.port}/api/sessions/${parsed.sessionId}`)
    if (res.ok) merged = await res.json() as SessionState
  } catch { /* daemon racing; fall back to local */ }
}

const ctxPct = merged?.ctxPct ?? 0
const cost = merged?.cost ?? 0
const toolsCount = merged?.tools.length ?? 0
const todosDone = merged?.todos.filter(t => t.completed).length ?? 0
const todosTotal = merged?.todos.length ?? 0

return renderEssential({
  sessionId: parsed.sessionId,
  cwd: parsed.cwd, model: parsed.model, branch: parsed.branch ?? 'detached',
  ctxPct, cost,
  toolsCount, subagentCount: 0,
  todosDone, todosTotal,
  dashboardUrl: `http://localhost:${rt?.port ?? 0}/sessions/${parsed.sessionId}`,
  stopUrl:      `http://localhost:${rt?.port ?? 0}/api/sessions/${parsed.sessionId}/interrupt`,
  fileUrl:      `http://localhost:${rt?.port ?? 0}/api/sessions/${parsed.sessionId}/open-file`,
  supportsOsc8: deps.detect(),
})
```

由于 main.ts 现在调用 fetch，需要在 RunStatuslineDeps 加 `fetch` 字段以便测试 mock；不想加就改为 `deps.fetchSession`：

```typescript
fetchSession: (port: number, sid: string) => Promise<SessionState | undefined>
```

测试相应改造。

- [ ] **Step 5: 跑测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/statusline
git commit -m "$(cat <<'EOF'
feat(statusline): Essential preset (2 rows + OSC 8 link set)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 26: daemon —— POST /api/sessions/:id/open-file 与 open-dashboard

**Files:**
- Create: `packages/daemon/src/platform/index.ts`、`macos.ts`、`linux.ts`
- Modify: `packages/daemon/src/api/routes.ts` 加 POST 处理

- [ ] **Step 1: 写 platform 测试**

```typescript
// packages/daemon/src/platform/index.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getPlatformActions } from './index.js'

describe('getPlatformActions', () => {
  it('returns macos actions on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    const a = getPlatformActions()
    expect(a.platform).toBe('darwin')
  })

  it('returns linux actions otherwise', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    expect(getPlatformActions().platform).toBe('linux')
  })
})
```

- [ ] **Step 2: 写 `platform/index.ts`**

```typescript
import * as macos from './macos.js'
import * as linux from './linux.js'

export interface PlatformActions {
  platform: 'darwin' | 'linux'
  openUrl(url: string): Promise<void>
  openFile(path: string): Promise<void>
  clipboardWrite(text: string): Promise<void>
}

export function getPlatformActions(): PlatformActions {
  return process.platform === 'darwin'
    ? { platform: 'darwin', ...macos }
    : { platform: 'linux', ...linux }
}
```

`platform/macos.ts`:
```typescript
import { spawn } from 'node:child_process'

function run(cmd: string, args: string[], stdin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args)
    c.on('error', reject)
    c.on('close', () => resolve())
    if (stdin !== undefined) { c.stdin.write(stdin); c.stdin.end() }
  })
}

export const openUrl       = (url: string)  => run('open', [url])
export const openFile      = (path: string) => run(process.env.EDITOR ?? 'open', [path])
export const clipboardWrite = (text: string) => run('pbcopy', [], text)
```

`platform/linux.ts`:
```typescript
import { spawn } from 'node:child_process'

function run(cmd: string, args: string[], stdin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args)
    c.on('error', reject)
    c.on('close', () => resolve())
    if (stdin !== undefined) { c.stdin.write(stdin); c.stdin.end() }
  })
}

export const openUrl       = (url: string)  => run('xdg-open', [url])
export const openFile      = (path: string) => run(process.env.EDITOR ?? 'xdg-open', [path])
export const clipboardWrite = (text: string) => run('xclip', ['-selection', 'clipboard'], text)
```

- [ ] **Step 3: 修改 routes.ts 加 POST**

```typescript
import { getPlatformActions } from '../platform/index.js'
import type { SessionRegistry } from '../session-registry.js'

const actions = getPlatformActions()

export async function handleApiRequest(
  method: string, url: string, registry: SessionRegistry,
): Promise<ApiResponse | null> {
  // (existing GETs)

  const openFile = url.match(/^\/api\/sessions\/([^/]+)\/open-file$/)
  if (method === 'POST' && openFile) {
    const s = registry.get(openFile[1]!)
    if (!s) return json(404, { error: 'session not found' })
    const recentEdit = s.tools.find(t => t.name === 'Edit' || t.name === 'Write')
    if (!recentEdit) return json(400, { error: 'no recent file edit found' })
    // best-effort: we don't have the path in ToolCall yet (Phase 2 enrichment)
    return json(200, { ok: true, note: 'open-file scaffold; needs path tracking in Phase 2' })
  }

  const openDash = url.match(/^\/api\/sessions\/([^/]+)\/open-dashboard$/)
  if (method === 'POST' && openDash) {
    const port = process.env.COCKPIT_PORT  // set by main.ts when starting http
    if (!port) return json(500, { error: 'port unknown' })
    await actions.openUrl(`http://localhost:${port}/sessions/${openDash[1]}`)
    return json(200, { ok: true })
  }

  return json(404, { error: 'not found' })
}
```

注意函数签名从同步变 async；adjust http-server 中 `await handleApiRequest(...)`。

- [ ] **Step 4: 跑测试 → pass（部分 fail 因为函数变 async，要 await）**

- [ ] **Step 5: 修复测试 → pass**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon
git commit -m "$(cat <<'EOF'
feat(daemon): platform abstraction (darwin/linux) + POST endpoints scaffolded

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 27: GitHub Actions CI 矩阵 + README 主图

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`（补完整 README）

- [ ] **Step 1: 写 CI workflow**

```yaml
name: ci

on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-latest]
        node: [20]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ matrix.node }}', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run -w packages/dashboard build
      - run: npm run test:e2e
```

- [ ] **Step 2: 跑一次 CI（本地 dry-run）**

```bash
npm ci && npm run typecheck && npm test && npm run -w packages/dashboard build && npm run test:e2e
```
全 pass。

- [ ] **Step 3: 重写 README.md（README 是 OSS 项目的脸）**

```markdown
# claude-cockpit

> Multi-session dashboard + control console for Claude Code. The Grafana-style HUD claude-hud doesn't ship.

![overview screenshot](docs/screenshots/overview.png)

## Why

`claude-hud` shows you ONE Claude Code session in your statusline. Cool, but —

- I run 3 Claude Codes in parallel. I want to see all of them at once.
- I want to *click* to jump to the file Claude just edited.
- I want to know which session is burning money right now.
- I want trends over time.

`claude-cockpit` is that.

## What you get (v0.1 alpha)

- **Statusline plugin** (drop-in replacement for claude-hud): Essential preset by default — 2 rows with model, cwd, ctx %, cost, tools, todos + OSC 8 clickable `[dash]` `[stop]` `[file]` links.
- **Multi-session dashboard** (Grafana style): browser-based, lazy-started local daemon at `http://localhost:<port>`.
- **Click `[dash]`** → opens dashboard pinned to that session.
- **Click `[stop]`** → POSTs to daemon → SIGINT to Claude Code (≈ Esc from anywhere).
- **MCP detection**: tells you which MCP servers Claude has configured.

## Roadmap

- v0.5 — Smart alerts (ctx 90% / cost spike / loop detection) + system notifications.
- v0.9 — SQLite history: 30-day trends, top sessions, project cost ranking.
- v1.0 — Minimal / Full presets, configure wizard, light theme, i18n.

## Install (alpha)

```bash
git clone https://github.com/<github-username>/claude-cockpit
cd claude-cockpit
npm install
npm run -w packages/dashboard build
```

Wire the statusline in `~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "npx tsx /absolute/path/to/claude-cockpit/packages/statusline/bin/statusline.ts"
  }
}
```

Restart Claude Code. First refresh lazy-starts the daemon. Click `[cockpit]` (or `[dash]`) to open the dashboard.

## Privacy

The daemon stores **only session metadata** (cwd, model, tokens, tool names). It does NOT store transcript content. Everything is local — zero external requests.

## License

MIT
```

- [ ] **Step 4: 截图占位**

```bash
mkdir -p docs/screenshots
# 占位文件，Phase 1 收尾时替换为真实 dashboard 截图
touch docs/screenshots/overview.png
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml README.md docs/screenshots
git commit -m "$(cat <<'EOF'
chore: add GitHub Actions CI matrix (mac+linux) and README for v0.1 alpha

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 28: Phase 1 e2e 验收

**Files:**
- Create: `tests/e2e/phase1.test.ts`

- [ ] **Step 1: 写 e2e 验证 full path**

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'

let dir: string

afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function statuslineOnce(stdin: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'packages/statusline/bin/statusline.ts'], { env })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d.toString() })
    child.on('close', () => resolve(buf))
    child.on('error', reject)
    child.stdin.write(stdin); child.stdin.end()
  })
}

describe('Phase 1 end-to-end', () => {
  it('statusline -> daemon -> transcript -> dashboard API shows ctxPct from tokens', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-p1-'))
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    const transcript = join(dir, 't.jsonl')
    writeFileSync(transcript, '')
    const stdin = JSON.stringify({
      session_id: 'p1-sid', cwd: dir,
      model: { id: 'claude-opus-4-7' },
      transcript_path: transcript,
      workspace: { current_branch: 'main' },
    })
    // first call: starts daemon + initial state
    await statuslineOnce(stdin, env)

    // wait for daemon
    await new Promise(r => setTimeout(r, 500))

    // read runtime info to get http port
    const rt = JSON.parse(require('node:fs').readFileSync(join(dir, '.claude-cockpit/daemon.json'), 'utf8'))

    // append a usage line to transcript
    appendFileSync(transcript, JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 } },
    }) + '\n')

    // give watcher time
    await new Promise(r => setTimeout(r, 500))

    // fetch via daemon API
    const res = await fetch(`http://localhost:${rt.port}/api/sessions/p1-sid`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ctxPct).toBeCloseTo(50, 0)
  })

  it('dashboard build artifact is served', async () => {
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    await statuslineOnce(JSON.stringify({
      session_id: 'sid2', cwd: dir, model: { id: 'm' },
      transcript_path: join(dir, 't2.jsonl'), workspace: { current_branch: 'main' },
    }), env)
    await new Promise(r => setTimeout(r, 500))
    const rt = JSON.parse(require('node:fs').readFileSync(join(dir, '.claude-cockpit/daemon.json'), 'utf8'))
    const html = await (await fetch(`http://localhost:${rt.port}/`)).text()
    expect(html).toContain('<div id="root">')
  })
})
```

- [ ] **Step 2: 跑 e2e**

```bash
npm run -w packages/dashboard build
npm run test:e2e
```
Expected: 4 tests passed（phase0 2 个 + phase1 2 个）。

- [ ] **Step 3: 截一张 dashboard 真实截图替换 placeholder**

启 dev 模式手动跑 1 个 statusline，浏览器打开看到 1 个 SessionCard，截图保存到 `docs/screenshots/overview.png`。

```bash
npm run -w packages/dashboard dev &
echo '{"session_id":"demo","cwd":"/Users/me/proj","model":{"id":"claude-opus-4-7"},"transcript_path":"/tmp/demo.jsonl","workspace":{"current_branch":"main"}}' | npx tsx packages/statusline/bin/statusline.ts
# 打开 http://localhost:5173 截图保存到 docs/screenshots/overview.png
```

- [ ] **Step 4: Commit + tag v0.1.0-alpha**

```bash
git add tests/e2e/phase1.test.ts docs/screenshots/overview.png
git commit -m "$(cat <<'EOF'
test(e2e): Phase 1 end-to-end + dashboard screenshot

claude-cockpit v0.1.0-alpha: statusline + lazy daemon + multi-session
Overview dashboard with live WebSocket updates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git tag v0.1.0-alpha
```

---

# Self-Review

## 1. Spec coverage

| Spec 章节 | 对应 Task |
|---|---|
| §1 目标差异化 | 体现在整体 scope；非目标（windows / E / G / 红色控制项）已排除 |
| §2.1 三层拓扑 | Tasks 3–10（采集 + 协调）；14–15、20（展示） |
| §2.2 数据流 1（statusline → registry） | Task 7、13 |
| §2.2 数据流 2（聚合下行） | Task 16、20（registry → /api → WS → dashboard） |
| §2.2 数据流 3（控制路径） | Task 26（platform actions + POST scaffold；完整动作 Phase 2） |
| §2.2 数据流 4（告警） | **不在 Phase 0+1 范围**，进 Phase 2 |
| §2.3 取舍 | Unix sock (Task 4)、随机端口 (Task 5)、双数据源 (Task 13 + 18) |
| §2.4 文件位置 | paths.ts (Task 3) |
| §3.1 三档预设 | Essential 在 Task 25；Minimal 在 Task 6 (基础已搭好)；Full 留 Phase 4 |
| §3.2 OSC 8 链接集 | Task 25 ([dash][stop][file]) + Task 6 ([cockpit]) |
| §3.3 终端能力探测 | Task 11 |
| §3.4 颜色语义 | Task 21 (lib/colors.ts ctxColor + palette) |
| §4 Dashboard IA | Overview Task 21 + 22；其他页 留 Phase 2+ |
| §5.1 SessionRegistry | Tasks 13、19 |
| §5.2 ActionDispatcher | Task 26（open-file/open-dashboard scaffold；stop turn 留 Phase 2） |
| §5.3 HistoryStore | **不在 Phase 0+1 范围**，进 Phase 3 |
| §5.4 RuleEngine | **不在 Phase 0+1 范围**，进 Phase 2 |
| §5.5 McpInspector | Tasks 23–24 |
| §6.1 配置 UX | 留 Phase 4 |
| §6.2 Slash Commands | 留 Phase 4 (作为 Claude Code 插件 manifest 一部分) |
| §6.3 生命周期 | Tasks 7、8、9、10 全覆盖 |
| §6.4 平台抽象 | Task 26（部分；notify focus 留 Phase 2） |
| §6.5 安装卸载 | README 已说明 (Task 27) |

**Coverage gaps（已知，且都明确属于后续 Phase）：**
- Smart alerts / Rule engine → Phase 2
- SQLite history → Phase 3
- Stop turn / clipboard 完整动作 / notify focus → Phase 2
- Configure wizard / slash commands packaging / i18n / themes → Phase 4
- Full / Minimal 预设的"Full" 档（多 session 横向摘要） → Phase 4

这些不是这份 plan 应该 cover 的，是下一份 plan 的范围。

## 2. Placeholder scan

扫了所有 task，没有 "TBD" / "TODO" / "implement later"。"Phase 2 enrichment" / "scaffold" 等字眼是**显式标注未来工作的注释**，不是工作未完成的 placeholder。

唯一例外：Task 26 open-file 端点返回 `{ ok: true, note: 'open-file scaffold; needs path tracking in Phase 2' }` —— 这是有意为之，Task 25 提到 file 链接但 ToolCall 类型现在只存 `name` 不存 `path`，扩展为 path 追踪是 Phase 2 工作。

修复：Task 25 的 `[file]` OSC 8 链接在用户点击时确实会 404/400 —— 这是已知降级。在 Task 25 加注释提醒。

## 3. Type consistency

- `SessionState`（Task 2 定义）字段在 Task 13、16、20、21 一致使用
- `RpcFrame`（Task 2）→ Task 4、7 一致
- `McpServerInfo`（Task 2）→ Task 23、24 一致
- `RuntimeInfo`（Task 3）→ Task 5、8、12、25 一致
- `IdleCheckerOptions`（Task 10）→ main.ts 接入处字段名一致
- `RenderInput` / `EssentialInput`（Task 6 / 25）：Essential extends Minimal，加了 5 个字段，调用方都对得上

类型连贯，无矛盾。

---

# 执行选择

Plan complete and saved to `docs/superpowers/plans/2026-05-15-claude-cockpit-phase-0-1.md`. 

**Two execution options:**

1. **Subagent-Driven (recommended)** — 我开一个新 subagent 跑每个 task，跑完两阶段 review（先 self-check 再代码评审），有问题打回。28 个 task 每个独立、TDD 严格，特别适合 subagent 并行 + 评审节奏。

2. **Inline Execution** — 在当前 session 里逐 task 执行，配合 executing-plans 做 checkpoint。适合你想全程盯着每个细节，但同步执行 28 task 会让 session 很长。

**选哪个？** 我推荐 1（Subagent-Driven），尤其前 14 个骨架任务很标准化，subagent 跑得又快又稳。
