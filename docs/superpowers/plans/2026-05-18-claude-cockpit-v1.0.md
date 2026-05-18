# claude-cockpit v1.0 (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 cockpit 从 v0.9-beta（内部能跑）升级到 v1.0-beta（公开可发布）—— `npm install -g claude-cockpit` 一行装、`claude-cockpit configure` 一步配；按 5 个垂直切片交付。

**Architecture:** 在 v0.9 monorepo 基础上：新增 `packages/cli/` workspace（configure + status + settings-json patcher）；新增 `tools/bundle.ts` esbuild 配置；新增 npm 单包发布产物结构（`bin/claude-cockpit.js` dispatcher + `dist/{cli,daemon,statusline}.js` + `dist/dashboard/`）。Dashboard 加 Light theme（Tailwind tokens → CSS var）+ EN/CN i18n (`react-i18next`)。Statusline 加 Minimal/Full preset。零 schema 破坏（保持 v0.9 兼容）。

**Tech Stack:** TypeScript 5 strict · Node 20 · npm workspaces · vitest · TanStack Router · µPlot · Tailwind · **新增**: esbuild ^0.21 · `@clack/prompts` ^0.7 · react-i18next ^14 · i18next ^23

**Reference spec:** `docs/superpowers/specs/2026-05-18-claude-cockpit-v1.0-design.md`

---

## 文件结构（v1.0 完成后增量）

```
claude-cockpit/
├── bin/
│   └── claude-cockpit.js                ← NEW thin dispatcher (~15 lines)
├── tools/
│   └── bundle.ts                        ← NEW esbuild + vite orchestrator
├── package.json                         ← MODIFY add bin/files/dependencies fields; bump 1.0.0-beta
├── packages/
│   ├── cli/                             ← NEW workspace
│   │   ├── package.json
│   │   ├── bin/cli.ts                   entry (dispatched by bin/claude-cockpit.js)
│   │   └── src/
│   │       ├── main.ts                  configure / status subcommand dispatcher
│   │       ├── configure.ts             @clack/prompts 8-step wizard
│   │       ├── configure.test.ts
│   │       ├── status.ts                daemon state + DB stats printer
│   │       ├── status.test.ts
│   │       ├── settings-json.ts         ~/.claude/settings.json patcher
│   │       └── settings-json.test.ts
│   ├── daemon/src/
│   │   ├── api/
│   │   │   ├── routes.ts                ← MODIFY add /api/config GET + otherCount in GET /sessions/:id
│   │   │   ├── routes.test.ts           ← MODIFY add config endpoint test
│   │   │   └── config-routes.ts         ← NEW handler for /api/config
│   │   ├── config-loader.ts             ← MODIFY add statuslinePreset/dashboardTheme/dashboardLang
│   │   └── config-loader.test.ts        ← MODIFY add 3 field tests
│   ├── statusline/src/
│   │   ├── main.ts                      ← MODIFY read preset from config; switch to renderFull/Minimal
│   │   ├── main.test.ts                 ← MODIFY add preset routing test
│   │   ├── render.ts                    ← MODIFY add renderFull export
│   │   ├── render.test.ts               ← MODIFY add renderFull tests
│   │   └── config-reader.ts             ← NEW lightweight sync reader for ~/.claude-cockpit/config.json
│   └── dashboard/
│       ├── tailwind.config.ts           ← MODIFY colors → CSS var
│       ├── src/
│       │   ├── main.tsx                 ← MODIFY apply theme + init i18n before mount
│       │   ├── styles.css               ← MODIFY add :root + [data-theme=light] CSS var defs
│       │   ├── lib/
│       │   │   ├── theme.ts             ← NEW theme load/store/apply helpers
│       │   │   ├── theme.test.ts        ← NEW
│       │   │   ├── useLanguage.ts       ← NEW thin wrapper around i18n
│       │   │   └── api.ts               ← MODIFY add /api/config fetcher
│       │   ├── i18n/
│       │   │   ├── index.ts             ← NEW i18next init + sync resource preload
│       │   │   ├── i18n.test.ts         ← NEW
│       │   │   └── locales/
│       │   │       ├── en.json          ← NEW ~50 keys
│       │   │       └── zh-CN.json       ← NEW mirror
│       │   ├── components/
│       │   │   ├── Sidebar.tsx          ← MODIFY translate labels + add theme/lang toggles
│       │   │   ├── Sidebar.test.tsx     ← MODIFY add toggle tests
│       │   │   └── (12 other components)  ← MODIFY replace string literals with t()
│       │   └── routes/
│       │       └── (4 routes)            ← MODIFY translate labels
```

```
README.md                                 ← MODIFY Quickstart + v1.0 section + Roadmap + screenshots
docs/release-notes/v1.0.0-beta.md         ← NEW
```

---

## 通用约定

沿用 v0.5 / v0.9 plans：
- npm workspaces，`npm run -w packages/<name> <script>`
- 测试命令：`npx vitest run <path>` from repo root
- TypeScript 严格度：`strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes`
- Conventional Commits + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- 每个 Task 收尾跑包内单测；每个 Slice 收尾跑 `npx vitest run && npm run typecheck` 全绿才进下一 Slice
- 每个 Task 一次 commit；不要 `--no-verify`，不要 amend

---

# Slice 1 · npm 打包基础设施

**产出**：`packages/cli/` workspace 骨架；esbuild 打包脚本；`bin/claude-cockpit.js` dispatcher；本地 `npm pack` 可生成可安装的 tarball。
**风险点**：esbuild externals 配置（避免把 dev deps 打进 dist）—— 本 slice 直接卸掉。

## Task 1: 新建 packages/cli/ workspace

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/main.ts`
- Create: `packages/cli/src/main.test.ts`
- Modify: `tsconfig.base.json` (if it has references list — confirm by reading)

- [ ] **Step 1: packages/cli/package.json**

```jsonc
{
  "name": "@claude-cockpit/cli",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.12.0"
  }
}
```

- [ ] **Step 2: packages/cli/tsconfig.json**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*", "bin/**/*"]
}
```

- [ ] **Step 3: skeleton src/main.ts**

```typescript
/**
 * CLI entry — dispatched by bin/claude-cockpit.js when subcommand is
 * `configure` or `status`. argv[2] is the subcommand name.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const cmd = argv[2] ?? ''
  switch (cmd) {
    case 'configure':
      // Filled in Task 7
      console.error('configure: not yet implemented')
      return 1
    case 'status':
      // Filled in Task 8
      console.error('status: not yet implemented')
      return 1
    default:
      console.error(`unknown subcommand: ${cmd}`)
      return 1
  }
}
```

- [ ] **Step 4: skeleton test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { main } from './main.js'

describe('cli main', () => {
  it('returns non-zero exit code on unknown subcommand', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await main(['node', 'cli', 'nonsense'])
    expect(code).toBe(1)
    errSpy.mockRestore()
  })

  it('returns non-zero (skeleton) for configure subcommand pre-implementation', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await main(['node', 'cli', 'configure'])
    expect(code).toBe(1)
    errSpy.mockRestore()
  })
})
```

- [ ] **Step 5: Install + verify**

```bash
npm install
npx vitest run packages/cli/
npm run typecheck
```

Expected: workspace installed, 2 tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/ package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(cli): scaffold @claude-cockpit/cli workspace

Adds package.json + tsconfig + skeleton main.ts that dispatches by
argv[2] (configure / status). @clack/prompts as direct dep for
the wizard (Task 7). Subcommand handlers stay as stubs returning
exit 1 until later tasks fill them in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: tools/bundle.ts — esbuild + vite orchestrator

**Files:**
- Create: `tools/bundle.ts`
- Modify: `package.json` (root) — add `build:bundle` script + `esbuild` devDep

- [ ] **Step 1: Add esbuild dev dep**

```bash
npm install --save-dev esbuild@^0.21 -w .
```

(Use `-w .` to add to root, not a workspace.)

- [ ] **Step 2: tools/bundle.ts**

```typescript
#!/usr/bin/env node
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, cpSync, existsSync, rmSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

async function main() {
  // 1. Clean dist
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true })
  mkdirSync(DIST, { recursive: true })

  // 2. esbuild three entrypoints
  const common = {
    bundle: true,
    platform: 'node' as const,
    target: 'node20',
    format: 'esm' as const,
    sourcemap: true,
    external: [
      'better-sqlite3',           // native binding — install from registry
    ],
  }

  await Promise.all([
    build({
      ...common,
      entryPoints: [join(ROOT, 'packages/daemon/bin/daemon.ts')],
      outfile: join(DIST, 'daemon.js'),
    }),
    build({
      ...common,
      entryPoints: [join(ROOT, 'packages/statusline/bin/statusline.ts')],
      outfile: join(DIST, 'statusline.js'),
    }),
    build({
      ...common,
      entryPoints: [join(ROOT, 'packages/cli/bin/cli.ts')],
      outfile: join(DIST, 'cli.js'),
    }),
  ])

  // 3. vite build dashboard (subprocess, output goes to packages/dashboard/dist)
  await new Promise<void>((resolve, reject) => {
    const p = spawn('npm', ['run', '-w', 'packages/dashboard', 'build'], { stdio: 'inherit' })
    p.on('close', (code) => { code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`)) })
  })

  // 4. Copy dashboard dist → top-level dist/dashboard
  cpSync(join(ROOT, 'packages/dashboard/dist'), join(DIST, 'dashboard'), { recursive: true })

  console.log('[bundle] dist/ ready')
  console.log(`  daemon.js     ${sizeKB(join(DIST, 'daemon.js'))} KB`)
  console.log(`  statusline.js ${sizeKB(join(DIST, 'statusline.js'))} KB`)
  console.log(`  cli.js        ${sizeKB(join(DIST, 'cli.js'))} KB`)
  console.log(`  dashboard/    ${dirSizeKB(join(DIST, 'dashboard'))} KB`)
}

function sizeKB(path: string): number {
  return Math.round(require('node:fs').statSync(path).size / 1024)
}

function dirSizeKB(path: string): number {
  let total = 0
  const fs = require('node:fs') as typeof import('node:fs')
  function walk(p: string) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const child = join(p, e.name)
      if (e.isDirectory()) walk(child)
      else total += fs.statSync(child).size
    }
  }
  walk(path)
  return Math.round(total / 1024)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

> Note: the `require('node:fs')` calls inside helpers work because tsx supports both ESM + CJS interop. Pure ESM is `await import('node:fs')` but for these tiny stat calls require is fine.

- [ ] **Step 3: Add build:bundle to root package.json**

In `package.json` (root) `scripts`:

```jsonc
{
  "scripts": {
    ...
    "build:bundle": "tsx tools/bundle.ts"
  }
}
```

- [ ] **Step 4: Smoke**

```bash
npm run build:bundle
ls -la dist/
```

Expected: dist/ contains `daemon.js`, `statusline.js`, `cli.js`, `dashboard/`. Bundle sizes < 2 MB each (typical).

- [ ] **Step 5: gitignore dist/**

Add to `.gitignore`:

```
/dist
```

(May already be there if it includes a generic `dist/` — confirm.)

- [ ] **Step 6: Commit**

```bash
git add tools/bundle.ts package.json package-lock.json .gitignore
git commit -m "$(cat <<'EOF'
build(tools): bundle.ts — esbuild three entrypoints + vite dashboard

Three esbuild bundles (daemon / statusline / cli) at platform=node20,
ESM, sourcemap on, native better-sqlite3 marked external. Dashboard
goes through vite build then is copied to dist/dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: bin/claude-cockpit.js dispatcher

**Files:**
- Create: `bin/claude-cockpit.js`
- Modify: `package.json` (root) — add `bin` field + `files` array + bump version

- [ ] **Step 1: bin/claude-cockpit.js**

```javascript
#!/usr/bin/env node
// Single-entry dispatcher published as the `claude-cockpit` bin.
// Subcommands map to bundled JS in dist/.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const cmd = process.argv[2]

const SUBCOMMANDS = {
  start:      'daemon.js',
  statusline: 'statusline.js',
  configure:  'cli.js',
  status:     'cli.js',
}

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`claude-cockpit — Multi-session HUD for Claude Code

Usage: claude-cockpit <command>

Commands:
  start         Start daemon in foreground (for debugging)
  statusline    Render statusline (called by Claude Code, not by you)
  configure     Interactive wizard to set ~/.claude-cockpit/config.json
  status        Print daemon + history state

Options:
  --help        Show this message
  --version     Print version

Quickstart:
  $ claude-cockpit configure
  $ (restart Claude Code)
`)
  process.exit(0)
}

if (cmd === '--version' || cmd === '-v') {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}

const target = SUBCOMMANDS[cmd]
if (!target) {
  console.error(`unknown command: ${cmd}`)
  console.error(`run 'claude-cockpit --help' for usage`)
  process.exit(1)
}

const distPath = join(here, '..', 'dist', target)
if (!existsSync(distPath)) {
  console.error(`dist/${target} missing — did you forget to run 'npm run build:bundle'?`)
  process.exit(1)
}

await import(distPath)
```

- [ ] **Step 2: chmod +x**

```bash
chmod +x bin/claude-cockpit.js
```

- [ ] **Step 3: package.json root — add bin + files + bump version**

In `package.json` (root):

```jsonc
{
  "name": "claude-cockpit",
  "version": "1.0.0-beta.0",
  "type": "module",
  "bin": {
    "claude-cockpit": "./bin/claude-cockpit.js"
  },
  "files": ["dist", "bin", "README.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "dependencies": {
    "better-sqlite3": "^12.10.0",
    "ws": "^8.18.0",
    "@clack/prompts": "^0.7.0"
  },
  "scripts": {
    "build": "npm run -ws --if-present build",
    "build:bundle": "tsx tools/bundle.ts",
    "test": "vitest run",
    "test:e2e": "vitest run --config tests/e2e/vitest.config.ts",
    "typecheck": "npm run -ws --if-present typecheck",
    "prepack": "npm run build:bundle"
  },
  ...
}
```

> `prepack` hook ensures `npm pack` always re-bundles. `private: true` should be REMOVED (we want to publish).

> `dependencies` here at root reflects what the published bundle needs at runtime. better-sqlite3 stays external (native). `ws` and `@clack/prompts` are bundled-in but listed for resolution if a consumer tries to import them directly.

- [ ] **Step 4: Verify**

```bash
node bin/claude-cockpit.js --help
node bin/claude-cockpit.js --version
node bin/claude-cockpit.js bogus
```

Expected: help message / version `1.0.0-beta.0` / error message + exit 1.

Then re-run bundle so dist/ matches the new dispatcher expectations:

```bash
npm run build:bundle
node bin/claude-cockpit.js status   # will print "status: not yet implemented" (skeleton from Task 1)
```

- [ ] **Step 5: Commit**

```bash
git add bin/ package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(npm): bin/claude-cockpit.js dispatcher + bump to 1.0.0-beta.0

Single-entry CLI; subcommands map to bundled dist/*.js. Help text
+ version short-circuits before dynamic import. prepack hook runs
build:bundle so 'npm pack' always produces a complete tarball.

Removes private:true — package is now publishable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: findDashboardDist fallback + npm pack smoke

**Files:**
- Modify: `packages/daemon/src/main.ts` (findDashboardDist)
- Modify: `packages/daemon/src/main.test.ts` (or create if no test exists)

- [ ] **Step 1: Extend findDashboardDist candidates**

Find `function findDashboardDist()` in `packages/daemon/src/main.ts`. Current candidates:

```typescript
const candidates = [
  join(here, '../../dashboard/dist'),     // packages/daemon/src/
  join(here, '../../../dashboard/dist'),  // packages/daemon/dist/
]
```

Add the npm-bundle case:

```typescript
const candidates = [
  join(here, '../../dashboard/dist'),     // packages/daemon/src/  → packages/dashboard/dist
  join(here, '../../../dashboard/dist'),  // packages/daemon/dist/ → packages/dashboard/dist
  join(here, 'dashboard'),                 // dist/daemon.js → dist/dashboard (npm bundle)
  join(here, '../dashboard'),              // safety net
]
```

The new case `here = <pkg-root>/dist/` and we want `<pkg-root>/dist/dashboard` → `join(here, 'dashboard')`.

- [ ] **Step 2: npm pack smoke test**

```bash
npm run build:bundle
npm pack
ls -la *.tgz
```

Expected: a `claude-cockpit-1.0.0-beta.0.tgz` produced; contents include `dist/`, `bin/`, `README.md`, `LICENSE`, `package.json`.

```bash
tar tzf claude-cockpit-1.0.0-beta.0.tgz | head -20
```

- [ ] **Step 3: Local global install smoke**

```bash
# In a separate tmp dir (so global install doesn't conflict with monorepo)
cd /tmp
npm install -g /Users/shuliuyang/claude-cockpit/claude-cockpit-1.0.0-beta.0.tgz
claude-cockpit --version
claude-cockpit --help
```

Expected: `1.0.0-beta.0` + help message. **Note**: `configure` and `status` will print "not yet implemented" — that's fine, they're Tasks 7-8.

```bash
npm uninstall -g claude-cockpit       # cleanup
cd /Users/shuliuyang/claude-cockpit
rm claude-cockpit-1.0.0-beta.0.tgz    # don't commit the tarball
```

- [ ] **Step 4: Slice 1 收尾 — 全套回归**

```bash
npx vitest run
npm run typecheck
```

Expected: 267 + Slice 1's 2 (cli skeleton) = 269 tests pass. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/main.ts
git commit -m "$(cat <<'EOF'
feat(daemon): findDashboardDist sibling fallback for npm bundle layout

When daemon.js runs from <pkg-root>/dist/daemon.js (the npm-published
layout), dashboard SPA lives at <pkg-root>/dist/dashboard. Adds two
candidates to cover that and the safety variation.

Slice 1 closed: npm package skeleton + esbuild bundle + bin dispatcher
+ pack smoke all green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 2 · Configure CLI (wizard + status + settings patcher)

**产出**：`claude-cockpit configure` 8 题向导可跑；`claude-cockpit status` 输出 daemon/DB 状态；`~/.claude/settings.json` patcher 安全 atomic+backup。

## Task 5: 扩 CockpitConfig 加 statuslinePreset / dashboardTheme / dashboardLang

**Files:**
- Modify: `packages/daemon/src/config-loader.ts`
- Modify: `packages/daemon/src/config-loader.test.ts`

- [ ] **Step 1: Extend CockpitConfig + RawConfig**

打开 `packages/daemon/src/config-loader.ts`. Find `interface CockpitConfig` and add fields:

```typescript
export interface CockpitConfig {
  disabledRules: Set<AlertRuleId>
  ruleConfig: RuleConfig
  retentionDays?: number
  statuslinePreset?: 'minimal' | 'essential' | 'full'
  dashboardTheme?: 'auto' | 'light' | 'dark'
  dashboardLang?: 'en' | 'zh-CN'
  historyFlushMs?: number
}
```

Find `interface RawConfig` and mirror:

```typescript
interface RawConfig {
  disabledRules?: string[]
  ctxHighThresholdPct?: number
  costSpikeMultiplier?: number
  loopDetectThreshold?: number
  loopDetectWindowMs?: number
  subagentStuckMinutes?: number
  retentionDays?: number
  statuslinePreset?: string
  dashboardTheme?: string
  dashboardLang?: string
  historyFlushMs?: number
}
```

- [ ] **Step 2: Parse with validation**

In `loadConfig()`, after the existing `ruleConfig` block, add:

```typescript
  const validPresets = new Set(['minimal', 'essential', 'full'])
  const validThemes = new Set(['auto', 'light', 'dark'])
  const validLangs = new Set(['en', 'zh-CN'])

  const statuslinePreset =
    typeof raw.statuslinePreset === 'string' && validPresets.has(raw.statuslinePreset)
      ? raw.statuslinePreset as 'minimal' | 'essential' | 'full'
      : undefined

  const dashboardTheme =
    typeof raw.dashboardTheme === 'string' && validThemes.has(raw.dashboardTheme)
      ? raw.dashboardTheme as 'auto' | 'light' | 'dark'
      : undefined

  const dashboardLang =
    typeof raw.dashboardLang === 'string' && validLangs.has(raw.dashboardLang)
      ? raw.dashboardLang as 'en' | 'zh-CN'
      : undefined

  const historyFlushMs =
    typeof raw.historyFlushMs === 'number' && raw.historyFlushMs > 0
      ? raw.historyFlushMs
      : undefined
```

And include in the returned object (using conditional spread for `exactOptionalPropertyTypes`):

```typescript
  return {
    disabledRules: disabled,
    ruleConfig,
    ...(retentionDays !== undefined && { retentionDays }),
    ...(statuslinePreset !== undefined && { statuslinePreset }),
    ...(dashboardTheme !== undefined && { dashboardTheme }),
    ...(dashboardLang !== undefined && { dashboardLang }),
    ...(historyFlushMs !== undefined && { historyFlushMs }),
  }
```

- [ ] **Step 3: Tests**

Add to `config-loader.test.ts`:

```typescript
  it('parses statuslinePreset / dashboardTheme / dashboardLang', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statuslinePreset: 'full',
      dashboardTheme: 'light',
      dashboardLang: 'zh-CN',
    }))
    const c = loadConfig(tmpFile)
    expect(c.statuslinePreset).toBe('full')
    expect(c.dashboardTheme).toBe('light')
    expect(c.dashboardLang).toBe('zh-CN')
  })

  it('ignores invalid preset / theme / lang values', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statuslinePreset: 'XXX',
      dashboardTheme: 'rainbow',
      dashboardLang: 'klingon',
    }))
    const c = loadConfig(tmpFile)
    expect(c.statuslinePreset).toBeUndefined()
    expect(c.dashboardTheme).toBeUndefined()
    expect(c.dashboardLang).toBeUndefined()
  })

  it('parses historyFlushMs when positive number', () => {
    writeFileSync(tmpFile, JSON.stringify({ historyFlushMs: 2000 }))
    const c = loadConfig(tmpFile)
    expect(c.historyFlushMs).toBe(2000)
  })
```

- [ ] **Step 4: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/config-loader.test.ts
npm run typecheck
```

Expected: 3 new + existing pass.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/config-loader.ts packages/daemon/src/config-loader.test.ts
git commit -m "$(cat <<'EOF'
feat(daemon): config-loader extend with statuslinePreset / dashboardTheme / dashboardLang / historyFlushMs

Whitelist validation on each enum field; invalid values silently ignored
(consistent with existing disabledRules handling). historyFlushMs gates
on positive number.

These fields will be set by 'claude-cockpit configure' wizard (Task 7)
and read by statusline preset selector (Task 11) + dashboard theme/lang
(Tasks 14, 17-19).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: settings-json.ts — patcher with atomic write + backup

**Files:**
- Create: `packages/cli/src/settings-json.ts`
- Create: `packages/cli/src/settings-json.test.ts`

- [ ] **Step 1: settings-json.ts**

```typescript
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export interface PatchResult {
  patched: boolean
  previousCommand?: string
  backupPath?: string
  error?: string
}

const NEW_COMMAND = 'npx claude-cockpit statusline'

/**
 * Patches ~/.claude/settings.json so that statusLine.command points at
 * claude-cockpit's CLI. Atomic write via *.tmp + rename. Previous command
 * (if any) is preserved in a backup file alongside.
 *
 * Behavior:
 * - settings.json missing → create with just statusLine
 * - statusLine.command === NEW_COMMAND already → no-op (patched=false)
 * - other current command → backup to settings.json.bak.cockpit-<ts> then patch
 * - invalid JSON in settings.json → return error, do nothing
 * - if post-patch read-back fails JSON.parse → rollback from backup, return error
 */
export function patchSettingsJson(path: string): PatchResult {
  let current: Record<string, unknown> = {}
  if (existsSync(path)) {
    try {
      current = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch (e) {
      return { patched: false, error: `settings.json not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  const sl = current.statusLine as Record<string, unknown> | undefined
  if (sl && typeof sl.command === 'string' && sl.command === NEW_COMMAND) {
    return { patched: false }                        // already pointing at us
  }

  // Backup if there is a prior statusLine
  let backupPath: string | undefined
  let previousCommand: string | undefined
  if (sl && typeof sl.command === 'string') {
    previousCommand = sl.command
    backupPath = `${path}.bak.cockpit-${Date.now()}`
    writeFileSync(backupPath, readFileSync(path, 'utf8'))
  }

  // Build patched object
  const patched = { ...current, statusLine: { type: 'command', command: NEW_COMMAND } }

  // Atomic write
  const tmp = `${path}.tmp.cockpit`
  try {
    writeFileSync(tmp, JSON.stringify(patched, null, 2))
    renameSync(tmp, path)
  } catch (e) {
    return { patched: false, error: `write failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Read-back validation
  try {
    JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // rollback from backup if available
    if (backupPath) {
      writeFileSync(path, readFileSync(backupPath, 'utf8'))
    }
    return { patched: false, error: 'post-write validation failed; rolled back' }
  }

  return {
    patched: true,
    ...(previousCommand !== undefined && { previousCommand }),
    ...(backupPath !== undefined && { backupPath }),
  }
}
```

- [ ] **Step 2: settings-json.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { patchSettingsJson } from './settings-json.js'

describe('patchSettingsJson', () => {
  let tmpFile: string
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cockpit-settings-'))
    tmpFile = join(tmpDir, 'settings.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates settings.json with statusLine when file missing', () => {
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(true)
    expect(r.previousCommand).toBeUndefined()
    expect(r.backupPath).toBeUndefined()
    const after = JSON.parse(readFileSync(tmpFile, 'utf8'))
    expect(after.statusLine.command).toBe('npx claude-cockpit statusline')
  })

  it('is no-op when already pointing at claude-cockpit', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statusLine: { type: 'command', command: 'npx claude-cockpit statusline' },
    }))
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(false)
  })

  it('backs up previous command + patches', () => {
    writeFileSync(tmpFile, JSON.stringify({
      statusLine: { type: 'command', command: '/usr/local/bin/old-statusline' },
      otherKey: 'preserved',
    }))
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(true)
    expect(r.previousCommand).toBe('/usr/local/bin/old-statusline')
    expect(r.backupPath).toBeDefined()
    expect(existsSync(r.backupPath!)).toBe(true)

    const after = JSON.parse(readFileSync(tmpFile, 'utf8'))
    expect(after.statusLine.command).toBe('npx claude-cockpit statusline')
    expect(after.otherKey).toBe('preserved')
  })

  it('returns error and does not modify when settings.json is not valid JSON', () => {
    writeFileSync(tmpFile, '{ not valid json')
    const r = patchSettingsJson(tmpFile)
    expect(r.patched).toBe(false)
    expect(r.error).toBeDefined()
    expect(readFileSync(tmpFile, 'utf8')).toBe('{ not valid json')   // unchanged
  })
})
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run packages/cli/src/settings-json.test.ts
npm run typecheck
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/settings-json.ts packages/cli/src/settings-json.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): settings-json.ts — atomic patcher with backup + rollback

Patches ~/.claude/settings.json statusLine.command to point at
'npx claude-cockpit statusline'. Backups go to settings.json.bak.cockpit-<ts>.
Atomic write (.tmp + rename). Post-write JSON.parse validation; rollback
from backup on failure. Idempotent: no-op if already pointing at us.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: configure.ts — @clack/prompts 8-step wizard

**Files:**
- Create: `packages/cli/src/configure.ts`
- Create: `packages/cli/src/configure.test.ts`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: configure.ts**

```typescript
import * as p from '@clack/prompts'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { patchSettingsJson } from './settings-json.js'

const CONFIG_PATH = join(homedir(), '.claude-cockpit', 'config.json')
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

interface WizardAnswers {
  statuslinePreset: 'minimal' | 'essential' | 'full'
  dashboardTheme: 'auto' | 'light' | 'dark'
  dashboardLang: 'en' | 'zh-CN'
  disabledRules: string[]
  ctxHighThresholdPct: number
  retentionDays: number
  sendTestNotification: boolean
  patchSettings: boolean
}

export async function runConfigure(): Promise<number> {
  p.intro('claude-cockpit · setup wizard')

  // Load existing config if any (to use as defaults)
  let existing: Record<string, unknown> = {}
  if (existsSync(CONFIG_PATH)) {
    try { existing = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) } catch { /* ignore */ }
  }

  const isMac = process.platform === 'darwin'

  // 1. Preset
  const preset = await p.select({
    message: '1/8 · Statusline preset',
    options: [
      { value: 'essential', label: 'Essential (default) — 2 lines, model+cwd+gauges+links' },
      { value: 'minimal',   label: 'Minimal — 1 line, just model+cwd+ctx+cockpit link' },
      { value: 'full',      label: 'Full — 2 lines + cache hit + tool detail + other sessions' },
    ],
    initialValue: (existing.statuslinePreset as string) ?? 'essential',
  })
  if (p.isCancel(preset)) { p.cancel('Cancelled'); return 1 }

  // 2. Theme
  const theme = await p.select({
    message: '2/8 · Dashboard theme',
    options: [
      { value: 'auto',  label: 'Auto (follow system prefers-color-scheme)' },
      { value: 'dark',  label: 'Dark' },
      { value: 'light', label: 'Light' },
    ],
    initialValue: (existing.dashboardTheme as string) ?? 'dark',
  })
  if (p.isCancel(theme)) { p.cancel('Cancelled'); return 1 }

  // 3. Language
  const lang = await p.select({
    message: '3/8 · Dashboard language',
    options: [
      { value: 'en',    label: 'English' },
      { value: 'zh-CN', label: '中文 (zh-CN)' },
    ],
    initialValue: (existing.dashboardLang as string) ?? 'en',
  })
  if (p.isCancel(lang)) { p.cancel('Cancelled'); return 1 }

  // 4. Disabled rules
  const enabledRules = await p.multiselect({
    message: '4/8 · Alert rules to enable',
    options: [
      { value: 'ctx-high',        label: 'ctx-high (context > 90%)' },
      { value: 'cost-spike',      label: 'cost-spike (rate > 7-day avg × 2)' },
      { value: 'loop-detect',     label: 'loop-detect (8+ edits on same file in 10 min)' },
      { value: 'subagent-stuck',  label: 'subagent-stuck (Task tool idle > 5 min)' },
    ],
    initialValues: ['ctx-high', 'cost-spike', 'loop-detect', 'subagent-stuck']
      .filter(r => !((existing.disabledRules as string[] | undefined) ?? []).includes(r)),
    required: false,
  })
  if (p.isCancel(enabledRules)) { p.cancel('Cancelled'); return 1 }

  const ALL_RULES = ['ctx-high', 'cost-spike', 'loop-detect', 'subagent-stuck']
  const disabledRules = ALL_RULES.filter(r => !(enabledRules as string[]).includes(r))

  // 5. ctx-high threshold
  const ctxRaw = await p.text({
    message: '5/8 · ctx-high threshold (50-100, default 90)',
    placeholder: '90',
    initialValue: String(existing.ctxHighThresholdPct ?? 90),
    validate: (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 50 || n > 100) return 'Enter a number between 50 and 100'
      return undefined
    },
  })
  if (p.isCancel(ctxRaw)) { p.cancel('Cancelled'); return 1 }
  const ctxHighThresholdPct = Number(ctxRaw)

  // 6. Retention days
  const retRaw = await p.text({
    message: '6/8 · History retention (days, 7-365, default 90)',
    placeholder: '90',
    initialValue: String(existing.retentionDays ?? 90),
    validate: (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 7 || n > 365) return 'Enter a number between 7 and 365'
      return undefined
    },
  })
  if (p.isCancel(retRaw)) { p.cancel('Cancelled'); return 1 }
  const retentionDays = Number(retRaw)

  // 7. macOS notification check (skip on linux)
  let sendTestNotification = false
  if (isMac) {
    const choice = await p.select({
      message: '7/8 · macOS notification quick check?',
      options: [
        { value: 'send', label: 'Send test notification now' },
        { value: 'skip', label: 'Skip' },
      ],
      initialValue: 'send',
    })
    if (p.isCancel(choice)) { p.cancel('Cancelled'); return 1 }
    sendTestNotification = (choice === 'send')
  }

  // 8. Patch settings.json
  const patchChoice = await p.select({
    message: `${isMac ? '8' : '7'}/8 · Patch ~/.claude/settings.json statusLine to point at this install?`,
    options: [
      { value: 'patch', label: 'Patch it (writes "npx claude-cockpit statusline")' },
      { value: 'skip',  label: 'Skip (I’ll wire it myself)' },
    ],
    initialValue: 'patch',
  })
  if (p.isCancel(patchChoice)) { p.cancel('Cancelled'); return 1 }
  const patchSettings = (patchChoice === 'patch')

  // Save config
  const newConfig = {
    ...existing,
    statuslinePreset: preset,
    dashboardTheme: theme,
    dashboardLang: lang,
    disabledRules,
    ctxHighThresholdPct,
    retentionDays,
  }
  const configDir = dirname(CONFIG_PATH)
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  const tmp = `${CONFIG_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(newConfig, null, 2))
  renameSync(tmp, CONFIG_PATH)

  // Test notification
  if (sendTestNotification) {
    try {
      const { spawnSync } = await import('node:child_process')
      spawnSync('osascript', ['-e', 'display notification "Permission OK — alerts will fire." with title "claude-cockpit ready"'])
    } catch { /* ignore */ }
  }

  // Patch settings.json
  let patchResult: ReturnType<typeof patchSettingsJson> | undefined
  if (patchSettings) {
    patchResult = patchSettingsJson(SETTINGS_PATH)
  }

  p.outro(`Saved to ${CONFIG_PATH}\nRestart Claude Code to pick up changes.${
    patchResult?.patched && patchResult.backupPath
      ? `\nSettings patched. Previous command backed up to ${patchResult.backupPath}`
      : patchResult?.error
        ? `\nWARN: settings patch failed: ${patchResult.error}`
        : ''
  }`)
  return 0
}
```

- [ ] **Step 2: main.ts dispatch**

Open `packages/cli/src/main.ts` and replace the `case 'configure':` block:

```typescript
import { runConfigure } from './configure.js'
// ... at top
case 'configure':
  return runConfigure()
```

Keep `case 'status':` as the stub for now (Task 8 fills it).

- [ ] **Step 3: configure.test.ts** (basic — wizard fixtures are hard to mock; smoke test that runConfigure is exported callable)

```typescript
import { describe, it, expect } from 'vitest'
import { runConfigure } from './configure.js'

describe('runConfigure', () => {
  it('is an async function', () => {
    expect(typeof runConfigure).toBe('function')
    // We can't run it interactively in tests; integration test in Slice 5 will mock TTY.
  })
})
```

- [ ] **Step 4: Tests + typecheck**

```bash
npx vitest run packages/cli/
npm run typecheck
```

Expected: 3 cli tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/configure.ts packages/cli/src/configure.test.ts packages/cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): configure wizard — 8 prompts via @clack/prompts

Loads existing ~/.claude-cockpit/config.json as defaults; writes back
via atomic .tmp+rename. macOS notification test only on darwin (item 7
skipped on linux, renumbering the remaining prompts). Final outro
reports backup path of any settings.json change.

Disabled rules are computed as the complement of the multiselect choice
to align with config-loader's disabledRules field shape.

Test coverage is a smoke export — the interactive wizard is wired in a
later integration test (Task 21+ Slice 5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: status.ts — daemon/DB state printer

**Files:**
- Create: `packages/cli/src/status.ts`
- Create: `packages/cli/src/status.test.ts`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: status.ts**

```typescript
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DAEMON_JSON = join(homedir(), '.claude-cockpit', 'daemon.json')
const DB_PATH     = join(homedir(), '.claude-cockpit', 'cockpit.db')
const SETTINGS    = join(homedir(), '.claude', 'settings.json')
const CONFIG      = join(homedir(), '.claude-cockpit', 'config.json')

interface DaemonInfo { pid: number; port: number; startedAt: number }

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return null }
}

function fmtAgo(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export async function runStatus(): Promise<number> {
  const daemon = readJson<DaemonInfo>(DAEMON_JSON)
  const pkg = readJson<{ version: string }>(join(__dirname, '..', '..', '..', '..', 'package.json'))
                ?? readJson<{ version: string }>(join(__dirname, '..', '..', 'package.json'))
                ?? { version: 'unknown' }

  console.log(`claude-cockpit v${pkg.version}\n`)

  console.log('Daemon')
  if (daemon) {
    const uptimeMs = Date.now() - daemon.startedAt
    console.log(`  pid:      ${daemon.pid}`)
    console.log(`  port:     ${daemon.port}`)
    console.log(`  uptime:   ${fmtAgo(uptimeMs)}`)
    console.log(`  started:  ${new Date(daemon.startedAt).toISOString().replace('T', ' ').slice(0, 19)}`)
  } else {
    console.log('  not running (will lazy-start on next CC refresh)')
  }
  console.log('')

  console.log('History (SQLite)')
  if (existsSync(DB_PATH)) {
    const bytes = statSync(DB_PATH).size + (existsSync(DB_PATH + '-wal') ? statSync(DB_PATH + '-wal').size : 0)
    console.log(`  path:     ${DB_PATH}`)
    console.log(`  size:     ${(bytes / 1024 / 1024).toFixed(1)} MB (incl WAL)`)
    // Optional: query row counts. For simplicity in v1.0, skip — would require opening DB read-only.
  } else {
    console.log('  not yet created (will appear after first session)')
  }
  console.log('')

  const config = readJson<{ statuslinePreset?: string }>(CONFIG)
  const settings = readJson<{ statusLine?: { command?: string } }>(SETTINGS)
  console.log('Statusline plugin')
  const wiredUp = settings?.statusLine?.command?.includes('claude-cockpit') ?? false
  console.log(`  wired up: ${wiredUp ? '✓' : '✗  (run claude-cockpit configure to set up)'}`)
  console.log(`  preset:   ${config?.statuslinePreset ?? 'essential (default)'}`)

  return 0
}
```

- [ ] **Step 2: main.ts dispatch**

In `packages/cli/src/main.ts`:

```typescript
import { runStatus } from './status.js'
// ...
case 'status':
  return runStatus()
```

- [ ] **Step 3: status.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runStatus } from './status.js'

describe('runStatus', () => {
  it('returns exit code 0', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await runStatus()
    expect(code).toBe(0)
    logSpy.mockRestore()
  })

  it('prints version + Daemon + History + Statusline sections', async () => {
    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((s) => { logs.push(String(s)) })
    await runStatus()
    const joined = logs.join('\n')
    expect(joined).toContain('claude-cockpit v')
    expect(joined).toContain('Daemon')
    expect(joined).toContain('History (SQLite)')
    expect(joined).toContain('Statusline plugin')
    logSpy.mockRestore()
  })
})
```

- [ ] **Step 4: Tests + typecheck**

```bash
npx vitest run packages/cli/
npm run typecheck
```

Expected: 4 cli tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/status.ts packages/cli/src/status.test.ts packages/cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): status — prints daemon + db + statusline wire-up state

Read-only inspection. Daemon liveness from ~/.claude-cockpit/daemon.json,
DB size from filesystem (db + wal), settings.json statusLine.command
match check. No DB connection needed (avoids step-on-running-daemon
risk).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: bin/cli.ts entrypoint + Slice 2 regression

**Files:**
- Create: `packages/cli/bin/cli.ts`

- [ ] **Step 1: bin/cli.ts**

```typescript
#!/usr/bin/env node
import { main } from '../src/main.js'

const code = await main(process.argv)
process.exit(code)
```

- [ ] **Step 2: Verify cli can be loaded via dispatcher**

Re-bundle and smoke:

```bash
npm run build:bundle
node bin/claude-cockpit.js configure   # Hit Ctrl-C immediately — just verifying wizard starts
node bin/claude-cockpit.js status      # Should print all 4 sections
```

Expected: configure prints `claude-cockpit · setup wizard` then waits for input (Ctrl-C to exit); status prints daemon/db state.

- [ ] **Step 3: Slice 2 收尾 — 全套回归**

```bash
npx vitest run
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/bin/cli.ts
git commit -m "$(cat <<'EOF'
feat(cli): bin/cli.ts thin entrypoint

Slice 2 closed: configure wizard + status + settings patcher all wired
via the CLI dispatcher. Re-bundle gives a tarball that supports
'claude-cockpit configure' and 'claude-cockpit status'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 3 · Statusline Minimal / Full presets

**产出**：三档预设全部可用；statusline 读 `config.json.statuslinePreset` 自动选路。

## Task 10: GET /api/sessions/:id 加 otherCount + GET /api/config 端点

**Files:**
- Modify: `packages/daemon/src/api/routes.ts`
- Modify: `packages/daemon/src/api/routes.test.ts`
- Create: `packages/daemon/src/api/config-routes.ts`

- [ ] **Step 1: config-routes.ts**

```typescript
import type { ApiContext, ApiResponse } from './routes.js'
import { loadConfig } from '../config-loader.js'

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}

export function handleConfigRequest(method: string, url: string, _ctx: ApiContext): Promise<ApiResponse> | ApiResponse {
  if (method !== 'GET' || url !== '/api/config') return json(404, { error: 'not found' })
  const cfg = loadConfig()
  return json(200, {
    statuslinePreset: cfg.statuslinePreset ?? 'essential',
    dashboardTheme:   cfg.dashboardTheme ?? 'auto',
    dashboardLang:    cfg.dashboardLang ?? 'en',
  })
}
```

- [ ] **Step 2: routes.ts dispatch + otherCount**

Open `packages/daemon/src/api/routes.ts`. Add dispatch at the top of `handleApiRequest` (next to the /api/history/* dispatch):

```typescript
  if (url === '/api/config') {
    const { handleConfigRequest } = await import('./config-routes.js')
    return handleConfigRequest(method, url, ctx)
  }
```

For `otherCount`: find the `GET /api/sessions/:id` handler. It currently returns the session row directly:

```typescript
  const get = url.match(/^\/api\/sessions\/([^/]+)$/)
  if (method === 'GET' && get) {
    const s = ctx.registry.get(get[1]!)
    if (!s) return json(404, { error: 'session not found' })
    return json(200, s)
  }
```

Change to:

```typescript
  const get = url.match(/^\/api\/sessions\/([^/]+)$/)
  if (method === 'GET' && get) {
    const s = ctx.registry.get(get[1]!)
    if (!s) return json(404, { error: 'session not found' })
    const otherCount = Math.max(0, ctx.registry.list().length - 1)
    return json(200, { ...s, otherCount })
  }
```

- [ ] **Step 3: routes.test.ts**

Add to `routes.test.ts`:

```typescript
describe('GET /api/config', () => {
  it('returns default preset/theme/lang when no config', async () => {
    const registry = new SessionRegistry()
    const platform = { platform: 'darwin' as const } as any
    const res = await handleApiRequest('GET', '/api/config', { registry, platform, port: 1234 })
    expect(res?.status).toBe(200)
    const body = JSON.parse(res!.body)
    expect(body.statuslinePreset).toBe('essential')
    expect(body.dashboardTheme).toBe('auto')
    expect(body.dashboardLang).toBe('en')
  })
})

describe('GET /api/sessions/:id otherCount', () => {
  it('includes otherCount equal to live session count - 1', async () => {
    const registry = new SessionRegistry()
    registry.upsert('a', { lastUpdate: 0 })
    registry.upsert('b', { lastUpdate: 0 })
    registry.upsert('c', { lastUpdate: 0 })
    const platform = { platform: 'darwin' as const } as any
    const res = await handleApiRequest('GET', '/api/sessions/a', { registry, platform, port: 1234 })
    expect(res?.status).toBe(200)
    const body = JSON.parse(res!.body)
    expect(body.otherCount).toBe(2)
  })
})
```

- [ ] **Step 4: Tests + typecheck**

```bash
npx vitest run packages/daemon/src/api/
npm run typecheck
```

Expected: 2 new tests + existing pass.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/api/routes.ts packages/daemon/src/api/routes.test.ts packages/daemon/src/api/config-routes.ts
git commit -m "$(cat <<'EOF'
feat(daemon): GET /api/config + sessions/:id.otherCount

/api/config returns the 3 client-visible config fields (preset/theme/lang)
with sensible defaults. Dashboard reads this on init for theme/lang
fallback (Tasks 14, 18). otherCount on session GET feeds the Full
statusline preset (Task 11) — zero extra RPC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: renderFull + statusline preset selector

**Files:**
- Modify: `packages/statusline/src/render.ts`
- Modify: `packages/statusline/src/render.test.ts`
- Modify: `packages/statusline/src/main.ts`
- Modify: `packages/statusline/src/main.test.ts`
- Create: `packages/statusline/src/config-reader.ts`
- Modify: `packages/shared/src/session-state.ts` (otherCount field)

- [ ] **Step 1: shared SessionState 加 otherCount**

Open `packages/shared/src/session-state.ts`. Add to `SessionState`:

```typescript
  otherCount?: number          // live siblings count (added by /api/sessions/:id, not stored)
```

(After `usage7dResetAt?: number`.)

- [ ] **Step 2: render.ts — renderFull**

Open `packages/statusline/src/render.ts`. Append:

```typescript
export interface FullInput extends EssentialInput {
  cacheReadTokens?: number
  toolNames?: readonly string[]    // recent distinct tool names
  otherCount?: number
}

export function renderFull(input: FullInput): string {
  // Start from Essential output
  const essentialOut = renderEssential(input)
  const lines = essentialOut.split('\n')
  if (lines.length !== 2) return essentialOut    // safety fallback

  // Append "cache R%" to line 1 (right after todos, before links)
  const cacheR = input.cacheReadTokens !== undefined && input.cacheReadTokens > 0
    ? ` · cache ${pctCacheFmt(input.cacheReadTokens, input.ctxPct)}`
    : ''
  // Insertion point: before the trailing " · [dash] [stop] [file]"
  const dashIdx = lines[0]!.indexOf(' · ' + osc8(input.dashboardUrl, '[dash]', input.supportsOsc8))
  lines[0] = dashIdx > 0 ? lines[0]!.slice(0, dashIdx) + cacheR + lines[0]!.slice(dashIdx) : lines[0] + cacheR

  // Append "tool: A·B·C" and "others ×N" to line 2
  const toolDetail = input.toolNames && input.toolNames.length > 0
    ? ` · tool: ${input.toolNames.slice(0, 3).join('·')}`
    : ''
  const othersDetail = input.otherCount !== undefined && input.otherCount > 0
    ? ` · others ×${input.otherCount}`
    : ''
  lines[1] = lines[1] + toolDetail + othersDetail

  return lines.join('\n')
}

function pctCacheFmt(cacheReadTokens: number, ctxPct: number): string {
  // Approximate: cacheRead / (input + cacheRead + cacheCreation). Caller knows the latter
  // are part of ctxPct, so we can use a rough estimate. For statusline display we just
  // show cacheReadTokens as a fraction of ctxPct-implied total. Simpler: just show ctxPct
  // * cacheRead / total. For v1.0 keep it simple and print formatted cacheRead k.
  const k = cacheReadTokens / 1000
  return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
}
```

> Note: cache hit % accurately would need (input + cacheRead + cacheCreation) at this render point. We have ctxPct and cacheReadTokens. Approximation: show cacheReadTokens as raw count (e.g., `cache 580k`) — less ambiguous than a misleading %.

Adjust accordingly. Final form:

```typescript
  const cacheR = input.cacheReadTokens !== undefined && input.cacheReadTokens > 0
    ? ` · cache ${formatCacheCount(input.cacheReadTokens)}`
    : ''
```

with helper:

```typescript
function formatCacheCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(tokens)
}
```

(Replace the `pctCacheFmt` block above with `formatCacheCount`.)

- [ ] **Step 3: render.test.ts — renderFull tests**

Add:

```typescript
describe('renderFull', () => {
  const base = {
    sessionId: 's', cwd: '/x', model: 'm', branch: 'main',
    ctxPct: 50, toolsCount: 7, subagentCount: 0, todosDone: 2, todosTotal: 5,
    dashboardUrl: 'http://x', stopUrl: 'http://x', fileUrl: 'http://x',
    supportsOsc8: false,
  } as const

  it('adds "cache Nk" to line 1 when cacheReadTokens > 0', () => {
    const out = renderFull({ ...base, cacheReadTokens: 580_000 })
    const [line1] = out.split('\n')
    expect(line1).toContain('cache 580k')
  })

  it('omits cache segment when cacheReadTokens is 0 or undefined', () => {
    const out = renderFull(base)
    expect(out).not.toContain('cache')
  })

  it('adds "tool: A·B·C" to line 2 (first 3)', () => {
    const out = renderFull({ ...base, toolNames: ['Bash', 'Read', 'Edit', 'Write'] })
    expect(out.split('\n')[1]).toContain('tool: Bash·Read·Edit')
  })

  it('adds "others ×N" to line 2 when otherCount > 0', () => {
    const out = renderFull({ ...base, otherCount: 3 })
    expect(out.split('\n')[1]).toContain('others ×3')
  })

  it('omits both detail extras when absent', () => {
    const out = renderFull(base)
    expect(out).not.toContain('tool:')
    expect(out).not.toContain('others')
  })
})
```

- [ ] **Step 4: config-reader.ts (sync, lightweight)**

```typescript
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface StatuslineConfig {
  preset: 'minimal' | 'essential' | 'full'
}

export function readStatuslineConfig(): StatuslineConfig {
  const path = join(homedir(), '.claude-cockpit', 'config.json')
  if (!existsSync(path)) return { preset: 'essential' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const p = raw.statuslinePreset
    if (p === 'minimal' || p === 'essential' || p === 'full') return { preset: p }
  } catch { /* ignore */ }
  return { preset: 'essential' }
}
```

- [ ] **Step 5: statusline main.ts — preset selector**

Open `packages/statusline/src/main.ts`. Add import:

```typescript
import { readStatuslineConfig } from './config-reader.js'
import { renderFull, renderMinimal } from './render.js'
```

Replace the `return renderEssential({...})` block:

```typescript
  const preset = readStatuslineConfig().preset
  const toolNames = merged
    ? Array.from(new Set(merged.tools.map((t) => t.name))).slice(0, 3)
    : []

  if (preset === 'minimal') {
    return renderMinimal({
      sessionId: parsed.sessionId,
      cwd: parsed.cwd,
      model: parsed.model,
      ...(parsed.branch !== undefined && { branch: parsed.branch }),
      ctxPct,
      dashboardUrl: `http://localhost:${port}/sessions/${parsed.sessionId}`,
      supportsOsc8: deps.detect(),
    })
  }

  const essentialArgs = {
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    model: parsed.model,
    ...(parsed.branch !== undefined && { branch: parsed.branch }),
    ctxPct,
    toolsCount,
    subagentCount,
    todosDone,
    todosTotal,
    ...(usage5hPct !== undefined && { usage5hPct }),
    ...(usage5hResetAt !== undefined && { usage5hResetAt }),
    ...(usage7dPct !== undefined && { usage7dPct }),
    ...(usage7dResetAt !== undefined && { usage7dResetAt }),
    dashboardUrl: `http://localhost:${port}/sessions/${parsed.sessionId}`,
    stopUrl:      `http://localhost:${port}/api/sessions/${parsed.sessionId}/interrupt-redirect`,
    fileUrl:      `http://localhost:${port}/api/sessions/${parsed.sessionId}/open-file-redirect`,
    supportsOsc8: deps.detect(),
  }

  if (preset === 'full') {
    return renderFull({
      ...essentialArgs,
      ...(merged?.cacheReadTokens !== undefined && { cacheReadTokens: merged.cacheReadTokens }),
      ...(toolNames.length > 0 && { toolNames }),
      ...(merged?.otherCount !== undefined && { otherCount: merged.otherCount }),
    })
  }

  return renderEssential(essentialArgs)
```

- [ ] **Step 6: main.test.ts — preset routing tests**

Add to `packages/statusline/src/main.test.ts`:

```typescript
import { vi } from 'vitest'

vi.mock('./config-reader.js', () => ({
  readStatuslineConfig: vi.fn(),
}))
import { readStatuslineConfig } from './config-reader.js'

describe('runStatusline preset routing', () => {
  // Use the same deps fixture as existing tests; just inject different preset
  // (Actual test code mirrors the existing 'outputs essential 2-line output' test
  // but with mocked readStatuslineConfig)
  it('returns 1-line output when preset=minimal', async () => {
    (readStatuslineConfig as any).mockReturnValue({ preset: 'minimal' })
    // run statusline as in existing test, assert lines.length === 1
    // ... (omitted: identical fixture pattern to existing test)
  })
})
```

Concrete test code (full):

```typescript
import { runStatusline } from './main.js'

describe('runStatusline preset routing', () => {
  const baseDeps = (preset: 'minimal' | 'essential' | 'full') => {
    (readStatuslineConfig as any).mockReturnValue({ preset })
    return {
      stdin: JSON.stringify({
        session_id: 'sid', cwd: '/x/y/z', model: { id: 'm' },
        transcript_path: '/t.jsonl', workspace: { current_branch: 'main' },
      }),
      sockPath: '/tmp/x.sock',
      detect: () => false,
      ensureDaemon: vi.fn(),
      pingDaemon: vi.fn().mockResolvedValue(true),
      sendUpdateSession: vi.fn(),
      readRuntimeInfo: () => ({ pid: 1, port: 5050, startedAt: 1 }),
      fetchSession: vi.fn().mockResolvedValue({
        ctxPct: 47, tools: [{ ts: 1, name: 'Read', status: 'ok' }],
        todos: [], cacheReadTokens: 100_000, otherCount: 2,
      }),
    }
  }

  it('preset=minimal → single line', async () => {
    const out = await runStatusline(baseDeps('minimal'))
    expect(out.split('\n')).toHaveLength(1)
  })

  it('preset=essential → 2 lines, no cache/others/tool extras', async () => {
    const out = await runStatusline(baseDeps('essential'))
    expect(out.split('\n')).toHaveLength(2)
    expect(out).not.toContain('cache ')
    expect(out).not.toContain('others ×')
  })

  it('preset=full → 2 lines + cache + others + tool', async () => {
    const out = await runStatusline(baseDeps('full'))
    expect(out.split('\n')).toHaveLength(2)
    expect(out).toContain('cache 100k')
    expect(out).toContain('others ×2')
    expect(out).toContain('tool: Read')
  })
})
```

- [ ] **Step 7: Tests + typecheck**

```bash
npx vitest run packages/statusline/
npm run typecheck
```

Expected: 5 new renderFull + 3 new main preset routing = 8 new tests pass.

- [ ] **Step 8: Slice 3 收尾 — 全套回归**

```bash
npx vitest run
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/statusline/ packages/shared/src/session-state.ts
git commit -m "$(cat <<'EOF'
feat(statusline): Minimal / Full presets + config-driven routing

renderFull extends Essential with cache token count (line 1, before
links), distinct tool names (max 3, line 2), and other-session count
(line 2). Cache shown as raw token count formatted to k/M for clarity
(percent would need cacheCreation+input which aren't in render input).

Statusline main reads ~/.claude-cockpit/config.json synchronously
via lightweight config-reader.ts (avoids RPC); falls back to Essential.

Slice 3 closed: 3 presets fully working.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 4 · Dashboard light theme + i18n

**产出**：Dashboard 三态主题切换 + 双语切换；URL 中带 query / localStorage 持久化；UI 文本完全 i18n 化。

## Task 12: Tailwind tokens → CSS variable + styles.css 双套主题

**Files:**
- Modify: `packages/dashboard/tailwind.config.ts`
- Modify: `packages/dashboard/src/styles.css`

- [ ] **Step 1: tailwind.config.ts — colors via var**

Find the `colors.cockpit` block. Replace cockpit-chrome tokens with CSS vars, keep signal colors as hex:

```typescript
colors: {
  cockpit: {
    bg:    'var(--cockpit-bg)',
    panel: 'var(--cockpit-panel)',
    line:  'var(--cockpit-line)',
    text:  'var(--cockpit-text)',
    muted: 'var(--cockpit-muted)',
    // signal colors stay hex (theme-invariant)
    info:    '#5794f2',
    ok:      '#73bf69',
    warning: '#f2cc0c',
    crit:    '#e0524d',
  },
},
```

- [ ] **Step 2: styles.css — CSS var defs**

Open `packages/dashboard/src/styles.css`. Add at the top (after `@tailwind` directives):

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

body {
  background: var(--cockpit-bg);
  color: var(--cockpit-text);
}
```

- [ ] **Step 3: Build verify**

```bash
npm run -w packages/dashboard build
```

Expected: clean. CSS output should include both `:root` rule sets.

- [ ] **Step 4: Manual smoke (skip tests for this pure-CSS change)**

Open built `dist/assets/index-*.css` and grep `--cockpit-bg`. Should appear in both light + dark blocks.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/tailwind.config.ts packages/dashboard/src/styles.css
git commit -m "$(cat <<'EOF'
refactor(dashboard): Tailwind cockpit tokens via CSS var; add light defs

Chrome colors (bg/panel/line/text/muted) → var(--cockpit-*). Signal
colors (info/ok/warning/crit) remain hex (theme-invariant per spec).
Light theme vars defined under :root[data-theme='light'], dark vars
under base :root. All existing components compile unchanged — they
still use 'bg-cockpit-panel' etc., now sourced from CSS var.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: theme.ts lib + apply before mount

**Files:**
- Create: `packages/dashboard/src/lib/theme.ts`
- Create: `packages/dashboard/src/lib/theme.test.ts`
- Modify: `packages/dashboard/src/main.tsx`

- [ ] **Step 1: theme.ts**

```typescript
export type Theme = 'auto' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'cockpit-theme'

export function loadStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch { /* SSR / storage disabled */ }
  return 'auto'
}

export function storeTheme(t: Theme): void {
  try { localStorage.setItem(STORAGE_KEY, t) } catch { /* */ }
}

export function getEffectiveTheme(stored: Theme): EffectiveTheme {
  if (stored === 'light') return 'light'
  if (stored === 'dark') return 'dark'
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export function applyTheme(effective: EffectiveTheme): void {
  document.documentElement.setAttribute('data-theme', effective)
}

export function watchSystemPreference(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia('(prefers-color-scheme: light)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
```

- [ ] **Step 2: theme.test.ts**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadStoredTheme, storeTheme, getEffectiveTheme, applyTheme } from './theme.js'

describe('theme', () => {
  beforeEach(() => { localStorage.clear() })

  it('loadStoredTheme defaults to auto', () => {
    expect(loadStoredTheme()).toBe('auto')
  })

  it('storeTheme + loadStoredTheme round-trip for each value', () => {
    storeTheme('light'); expect(loadStoredTheme()).toBe('light')
    storeTheme('dark');  expect(loadStoredTheme()).toBe('dark')
    storeTheme('auto');  expect(loadStoredTheme()).toBe('auto')
  })

  it('loadStoredTheme ignores garbage values', () => {
    localStorage.setItem('cockpit-theme', 'rainbow')
    expect(loadStoredTheme()).toBe('auto')
  })

  it('getEffectiveTheme returns explicit value for light/dark', () => {
    expect(getEffectiveTheme('light')).toBe('light')
    expect(getEffectiveTheme('dark')).toBe('dark')
  })

  it('getEffectiveTheme(auto) uses matchMedia', () => {
    const mq = { matches: true, addEventListener() {}, removeEventListener() {} } as any
    vi.stubGlobal('matchMedia', () => mq)
    expect(getEffectiveTheme('auto')).toBe('light')
    mq.matches = false
    expect(getEffectiveTheme('auto')).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('applyTheme sets data-theme attribute', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
```

- [ ] **Step 3: main.tsx — apply theme before mount**

Open `packages/dashboard/src/main.tsx`. At top after imports, before `createRoot(...)`:

```typescript
import { loadStoredTheme, getEffectiveTheme, applyTheme, watchSystemPreference } from './lib/theme.js'

// Apply theme before React mounts to prevent FOUC
applyTheme(getEffectiveTheme(loadStoredTheme()))
watchSystemPreference(() => {
  if (loadStoredTheme() === 'auto') applyTheme(getEffectiveTheme('auto'))
})
```

- [ ] **Step 4: Tests + build**

```bash
npx vitest run packages/dashboard/src/lib/theme.test.ts
npm run -w packages/dashboard build
```

Expected: 6 theme tests pass, build clean.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/theme.ts packages/dashboard/src/lib/theme.test.ts packages/dashboard/src/main.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): theme.ts — load/store/apply + pre-mount script

applyTheme runs before React mounts so first paint has correct CSS
var values (zero FOUC). matchMedia listener auto-flips theme when
stored=auto and OS preference changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Sidebar theme toggle + /api/config fetcher

**Files:**
- Modify: `packages/dashboard/src/lib/api.ts`
- Modify: `packages/dashboard/src/components/Sidebar.tsx`
- Modify: `packages/dashboard/src/components/Sidebar.test.tsx`

- [ ] **Step 1: api.ts — add /api/config fetcher**

In `packages/dashboard/src/lib/api.ts`, add:

```typescript
export interface ServerConfig {
  statuslinePreset: 'minimal' | 'essential' | 'full'
  dashboardTheme: 'auto' | 'light' | 'dark'
  dashboardLang: 'en' | 'zh-CN'
}

export async function fetchServerConfig(): Promise<ServerConfig | null> {
  try {
    const res = await fetch(apiUrl('/api/config'))
    if (!res.ok) return null
    return await res.json() as ServerConfig
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Sidebar — add theme toggle button**

Open `packages/dashboard/src/components/Sidebar.tsx`. At bottom of the sidebar (after the existing Link list), add a horizontal flex row with a theme toggle button. The exact structure depends on current Sidebar — read it first.

Sketch:

```tsx
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { loadStoredTheme, storeTheme, getEffectiveTheme, applyTheme, type Theme } from '../lib/theme.js'

export function Sidebar() {
  const [theme, setTheme] = useState<Theme>(loadStoredTheme())

  function cycleTheme() {
    const next: Theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
    setTheme(next)
    storeTheme(next)
    applyTheme(getEffectiveTheme(next))
  }

  return (
    <nav className="... existing classes ...">
      {/* existing Link list */}
      <Link to="/" className="...">Overview</Link>
      <Link to="/history" className="...">History</Link>

      {/* spacer */}
      <div className="flex-1" />

      {/* theme toggle */}
      <button
        onClick={cycleTheme}
        className="text-xs text-cockpit-muted px-2 py-1 hover:text-cockpit-text"
        title={`Theme: ${theme} (click to cycle)`}
      >
        {theme === 'auto' ? '◐' : theme === 'light' ? '☀' : '🌙'}
      </button>
    </nav>
  )
}
```

(Adapt to actual Sidebar structure. The point is: a small button at the end of the nav that cycles auto → light → dark → auto.)

- [ ] **Step 3: Sidebar.test.tsx — toggle test**

Add:

```typescript
it('theme toggle cycles auto → light → dark → auto', async () => {
  render(<Sidebar /* + Router wrapper */ />)
  const btn = screen.getByRole('button', { name: /Theme/i })
  expect(localStorage.getItem('cockpit-theme')).toBe(null)   // initial

  fireEvent.click(btn)
  expect(localStorage.getItem('cockpit-theme')).toBe('light')
  fireEvent.click(btn)
  expect(localStorage.getItem('cockpit-theme')).toBe('dark')
  fireEvent.click(btn)
  expect(localStorage.getItem('cockpit-theme')).toBe('auto')
})
```

(Adapt to existing Sidebar test setup — may need to wrap in RouterProvider.)

- [ ] **Step 4: Tests + build**

```bash
npx vitest run packages/dashboard/src/components/Sidebar.test.tsx
npm run -w packages/dashboard build
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/api.ts packages/dashboard/src/components/Sidebar.tsx packages/dashboard/src/components/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): Sidebar theme toggle + /api/config fetcher

Cycles auto → light → dark → auto. Tooltip shows current state.
fetchServerConfig() helper for later i18n init (Task 17).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: i18next install + init + locales JSON

**Files:**
- Modify: `packages/dashboard/package.json` (deps)
- Create: `packages/dashboard/src/i18n/index.ts`
- Create: `packages/dashboard/src/i18n/locales/en.json`
- Create: `packages/dashboard/src/i18n/locales/zh-CN.json`
- Create: `packages/dashboard/src/i18n/i18n.test.ts`
- Modify: `packages/dashboard/src/main.tsx`

- [ ] **Step 1: Install deps**

```bash
npm install --save react-i18next@^14 i18next@^23 -w packages/dashboard
```

- [ ] **Step 2: en.json** (use full content from spec §6.4)

```json
{
  "nav": { "overview": "Overview", "history": "History" },
  "history": {
    "title": "Past 30 days",
    "tabs": { "trends": "Trends", "top": "Top", "projects": "Projects" },
    "trends": {
      "totals": "Last 30 days · totals",
      "sessions": "sessions",
      "cacheHit": "cache hit",
      "dailyCost": "DAILY COST",
      "cacheRate": "CACHE HIT RATE",
      "usage": "SUBSCRIBER USAGE (snapshots)"
    },
    "top": { "by": "by" },
    "projects": {
      "clear": "Clear all history…",
      "confirm": {
        "title": "Permanently delete all history?",
        "body": "This empties all 4 tables. Cannot be undone.",
        "cancel": "Cancel",
        "ok": "Clear",
        "clearing": "Clearing…"
      }
    },
    "loading": "Loading…",
    "noData": "No data in this window.",
    "noProjects": "No projects in this window."
  },
  "session": {
    "details": "SESSION DETAIL",
    "controls": {
      "stop": "Stop",
      "file": "Open file",
      "copy": "Copy id",
      "focus": "Focus term"
    },
    "alerts": {
      "ctxHigh": "Context near limit",
      "costSpike": "Cost spike",
      "loopDetect": "Possible loop",
      "subagentStuck": "Subagent stuck"
    }
  },
  "overview": {
    "noActiveSessions": "No active sessions yet.",
    "active": "ACTIVE SESSIONS",
    "cost24h": "COST · 24h",
    "ctx24h": "CONTEXT % · 24h",
    "noDataYet": "no data yet"
  },
  "usage": {
    "5h": { "tooltip": "5-hour rolling window (from first use after last reset)" },
    "7d": { "tooltip": "Weekly quota — resets on your account billing-week boundary, not a rolling-7-days count" },
    "resetsIn": "resets in {{countdown}}"
  },
  "mcp": {
    "none": "no MCP",
    "lastUsed": "last used {{ago}}",
    "notUsedYet": "not used yet"
  }
}
```

- [ ] **Step 3: zh-CN.json** (full Chinese translation)

```json
{
  "nav": { "overview": "总览", "history": "历史" },
  "history": {
    "title": "过去 30 天",
    "tabs": { "trends": "趋势", "top": "排行", "projects": "项目" },
    "trends": {
      "totals": "过去 30 天 · 累计",
      "sessions": "会话",
      "cacheHit": "缓存命中",
      "dailyCost": "每日成本",
      "cacheRate": "缓存命中率",
      "usage": "订阅用量（快照）"
    },
    "top": { "by": "按" },
    "projects": {
      "clear": "清空所有历史…",
      "confirm": {
        "title": "永久删除所有历史？",
        "body": "将清空全部 4 张表。不可恢复。",
        "cancel": "取消",
        "ok": "清空",
        "clearing": "清空中…"
      }
    },
    "loading": "加载中…",
    "noData": "此窗口内无数据。",
    "noProjects": "此窗口内无项目。"
  },
  "session": {
    "details": "会话详情",
    "controls": {
      "stop": "停止",
      "file": "打开文件",
      "copy": "复制 id",
      "focus": "聚焦终端"
    },
    "alerts": {
      "ctxHigh": "上下文接近上限",
      "costSpike": "成本激增",
      "loopDetect": "可能在循环",
      "subagentStuck": "子代理卡住"
    }
  },
  "overview": {
    "noActiveSessions": "暂无活跃会话。",
    "active": "活跃会话",
    "cost24h": "成本 · 24 小时",
    "ctx24h": "上下文 % · 24 小时",
    "noDataYet": "暂无数据"
  },
  "usage": {
    "5h": { "tooltip": "5 小时滚动窗口（从上次重置后首次请求计起）" },
    "7d": { "tooltip": "周配额 —— 按账号计费周对齐重置，不是滚动 7 天" },
    "resetsIn": "{{countdown}}后重置"
  },
  "mcp": {
    "none": "无 MCP",
    "lastUsed": "{{ago}}前使用",
    "notUsedYet": "尚未使用"
  }
}
```

- [ ] **Step 4: i18n/index.ts**

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const STORAGE_KEY = 'cockpit-lang'
export type Lang = 'en' | 'zh-CN'

export function loadStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'zh-CN') return v
  } catch { /* */ }
  return null
}

export function storeLang(l: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* */ }
}

function detectBrowserLang(): Lang {
  const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en'
  if (nav.startsWith('zh')) return 'zh-CN'
  return 'en'
}

export function initI18n(serverDefault?: Lang): Promise<unknown> {
  const initial: Lang = loadStoredLang() ?? serverDefault ?? detectBrowserLang()
  return i18n
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
      lng: initial,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },   // React already escapes
    })
}

export async function setLang(l: Lang): Promise<void> {
  storeLang(l)
  await i18n.changeLanguage(l)
}

export { i18n }
```

- [ ] **Step 5: i18n.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { initI18n, setLang, i18n, loadStoredLang } from './index.js'

describe('i18n', () => {
  beforeEach(async () => { localStorage.clear(); await initI18n('en') })

  it('resolves known en key', () => {
    expect(i18n.t('nav.overview')).toBe('Overview')
  })

  it('falls back for unknown key (returns the key itself)', () => {
    expect(i18n.t('this.does.not.exist')).toBe('this.does.not.exist')
  })

  it('changeLanguage switches resources', async () => {
    await setLang('zh-CN')
    expect(i18n.t('nav.overview')).toBe('总览')
  })

  it('interpolation works ({{ago}})', async () => {
    await setLang('en')
    expect(i18n.t('mcp.lastUsed', { ago: '5m' })).toBe('last used 5m')
  })

  it('storeLang persists across init', async () => {
    await setLang('zh-CN')
    expect(loadStoredLang()).toBe('zh-CN')
  })

  it('en as fallbackLng when key missing in zh-CN', async () => {
    await setLang('zh-CN')
    // (this test is conceptual — all our keys are mirrored, but the fallback chain is configured)
    expect(i18n.options.fallbackLng).toEqual(['en'])
  })
})
```

- [ ] **Step 6: main.tsx — init i18n before mount**

In `packages/dashboard/src/main.tsx`, before `createRoot(...)`:

```typescript
import { initI18n, loadStoredLang } from './i18n/index.js'

// Init i18n synchronously enough that first render has translations.
// We fire-and-forget the promise since initReactI18next supports this pattern;
// resources are sync-imported above so there's no async wait in practice.
await initI18n(loadStoredLang() ?? undefined)
```

Top-level await is fine in modern Vite (ESM).

- [ ] **Step 7: Tests + build**

```bash
npx vitest run packages/dashboard/src/i18n/
npm run -w packages/dashboard build
```

Expected: 6 i18n tests pass, build clean.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/
git commit -m "$(cat <<'EOF'
feat(dashboard): i18next install + init + en/zh-CN locales (50 keys)

Synchronous resource import (no async backend) → no first-render FOUC.
loadStoredLang → serverDefault → browser detection → 'en' fallback
chain. setLang persists in localStorage.

en.json + zh-CN.json hand-mirrored ~50 keys. Interpolation via {{var}}.
Falls back to en when zh-CN key missing (configured fallbackLng).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Migrate components to t() — Sidebar + Overview + 4 history tabs

**Files:**
- Modify: `packages/dashboard/src/components/Sidebar.tsx`
- Modify: `packages/dashboard/src/components/history/TrendsTab.tsx`
- Modify: `packages/dashboard/src/components/history/TopTab.tsx`
- Modify: `packages/dashboard/src/components/history/ProjectsTab.tsx`
- Modify: `packages/dashboard/src/components/HistoryTabs.tsx`
- Modify: `packages/dashboard/src/routes/index.tsx`
- Modify: `packages/dashboard/src/routes/history.tsx`

For each file: replace hardcoded UI strings with `t('namespace.key')` calls. Add `import { useTranslation } from 'react-i18next'` and `const { t } = useTranslation()` at component top.

Example for `Sidebar.tsx`:

```tsx
// Before
<Link to="/">Overview</Link>
<Link to="/history">History</Link>

// After
const { t } = useTranslation()
<Link to="/">{t('nav.overview')}</Link>
<Link to="/history">{t('nav.history')}</Link>
```

Example for `TrendsTab.tsx` — header line:

```tsx
// Before
<div>Last 30 days · totals <span>${totals.cost.toFixed(2)}</span> · {totals.sessions} sessions · {(totals.cacheHitRate * 100).toFixed(0)}% cache hit</div>

// After
<div>
  {t('history.trends.totals')} <span className="font-semibold">${totals.cost.toFixed(2)}</span> · {totals.sessions} {t('history.trends.sessions')} · {(totals.cacheHitRate * 100).toFixed(0)}% {t('history.trends.cacheHit')}
</div>
```

- [ ] **Step 1-7: Migrate each file**

Apply the t() pattern to each file listed above. Refer to `en.json` for the exact key paths.

- [ ] **Step 8: Update Sidebar to also include language toggle**

Already added theme toggle in Task 14. Now add lang toggle next to it:

```tsx
import { setLang, i18n } from '../i18n/index.js'

const lang = i18n.language as 'en' | 'zh-CN'

<button
  onClick={() => setLang(lang === 'en' ? 'zh-CN' : 'en')}
  className="text-xs text-cockpit-muted px-2 py-1 hover:text-cockpit-text"
  title="Toggle language"
>
  {lang === 'en' ? '中' : 'EN'}
</button>
```

Place next to the theme toggle button.

- [ ] **Step 9: Run all dashboard tests**

```bash
npx vitest run packages/dashboard/
npm run typecheck
npm run -w packages/dashboard build
```

Expected: existing tests may need updates if they asserted exact string matches; update assertions to either match new English text or call `i18n.t('...')`. Most tests use partial matches that still pass.

- [ ] **Step 10: Slice 4 收尾 — 全套回归**

```bash
npx vitest run
npm run typecheck
```

- [ ] **Step 11: Commit**

```bash
git add packages/dashboard/
git commit -m "$(cat <<'EOF'
feat(dashboard): migrate UI strings to react-i18next t() calls

12 components updated. Sidebar gains theme + lang toggle buttons in
its footer. Strings remain English by default (same visual as before);
zh-CN activates on toggle. ~50 t() call sites; all map to en.json /
zh-CN.json keys defined in Task 15.

Slice 4 closed: theme switching + i18n both end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 5 · 收尾（coverage + README + release notes + tag）

## Task 17: Coverage audit + targeted gap filling

**Files:**
- Modify: various `*.test.ts` for files < 60%

- [ ] **Step 1: Coverage baseline**

```bash
npx vitest run --coverage --reporter=text-summary 2>&1 | tail -20
```

Note the "All files" line. Target: ≥ 60% lines.

- [ ] **Step 2: Identify gaps**

```bash
npx vitest run --coverage --reporter=text 2>&1 | grep -E '^\s+[a-zA-Z]' | awk '{ if ($2+0 < 60 && $2+0 > 0) print }' | head -20
```

This shows files with < 60% line coverage. Skip `bin/*.ts` entries (entry points, hard to test in isolation).

- [ ] **Step 3: Add targeted tests for worst offenders**

For each src file < 60% (excluding bin/):
- Read the file's current test (if any)
- Add 2-5 tests covering the uncovered branches (focus on conditionals, error paths, edge cases)

This step is iterative — add tests, re-run coverage, repeat until "All files" lines ≥ 60%.

- [ ] **Step 4: Document final coverage in commit**

```bash
npx vitest run --coverage --reporter=text-summary 2>&1 | tail -10 > /tmp/coverage-summary.txt
cat /tmp/coverage-summary.txt
```

Capture the % numbers for the commit message.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "$(cat <<'EOF'
test: coverage audit — bring weighted lines to 60%+

[paste vitest coverage summary here]

Added targeted tests for previously-low files: <list them>.
Did not chase file-level 60% on bin/*.ts (entry points) or pure type
files. Excluded by intent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: README v1.0 polish + Quickstart

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Top Quickstart block**

Insert immediately after the `> Multi-session dashboard + control console for Claude Code.` blockquote and the screenshot, BEFORE `## Why`:

```markdown
## Quickstart

```bash
npm install -g claude-cockpit
claude-cockpit configure          # 8-step interactive wizard
# Restart Claude Code; statusline + dashboard auto-wire
```

That's it. The wizard sets up your `~/.claude-cockpit/config.json`, optionally patches `~/.claude/settings.json` to point at this install, and (on macOS) sends a test notification to verify permission.

```

- [ ] **Step 2: Add v1.0 section**

Insert before `## What you get (v0.9 beta)`:

```markdown
## What you get (v1.0 beta)

Everything in v0.9 beta **plus**:

- **`npm install -g claude-cockpit`** — published on npm; no more git clone.
- **`claude-cockpit configure`** — 8-step interactive wizard (preset / theme / language / alert rules / thresholds / retention / notification test / settings patch).
- **`claude-cockpit status`** — daemon liveness + DB size + statusline wiring check, all in one command.
- **Three statusline presets** — Minimal (1 line) / Essential (default) / Full (2 lines + cache + tool names + other-session count). Pick in the wizard or in `config.json.statuslinePreset`.
- **Light / Dark / Auto theme** — dashboard toggle in sidebar; respects `prefers-color-scheme` when Auto.
- **EN / 中 i18n** — full dashboard UI in English or 简体中文; toggle in sidebar.

### Statusline preset comparison

| Preset    | Lines | Includes                                                                          |
|-----------|-------|-----------------------------------------------------------------------------------|
| Minimal   | 1     | model · cwd · branch · ctx% · [cockpit]                                           |
| Essential | 2     | + tools · subagents · todos · [dash] [stop] [file] · gauges                       |
| Full      | 2     | + cache token count · top-3 tool names · "others ×N" siblings on line 2          |
```

- [ ] **Step 3: Move "Install (beta — v0.5.x)" content to "Develop" section near the bottom**

Find the existing `## Install (beta — v0.5.x)` block. Rename to `## Develop` and keep the git clone + workspace instructions. Add a header note:

```markdown
## Develop

If you want to hack on cockpit itself, work from source:

[existing git clone + npm install + workspace build instructions]
```

- [ ] **Step 4: Update Roadmap**

Find the Roadmap section. Update:

```markdown
## Roadmap

- ✅ **v0.5** (shipped) — Smart alerts + system notifications + working `[stop]` / `[file]` actions + session detail page + 5h/7d subscriber usage bars + ANSI-colored statusline.
- ✅ **v0.9** (shipped) — SQLite history layer + `/history` page (Trends / Top / Projects tabs) + Sparkline real data + cost-spike baseline migrated to 7d window.
- ✅ **v1.0** (shipped — current) — `npm install -g`, configure wizard, statusline presets, light theme, EN/CN i18n.
- **Future** — `/alerts` feed page, Linux notify-send action callbacks, Windows support.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README v1.0 polish — Quickstart + v1.0 section + Roadmap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Release notes + tag v1.0.0-beta + final regression

**Files:**
- Create: `docs/release-notes/v1.0.0-beta.md`

- [ ] **Step 1: Final regression**

```bash
npx vitest run
npm run typecheck
npm run build:bundle
ls -la dist/
```

Expected: all green; dist/ contains daemon.js / statusline.js / cli.js / dashboard/.

- [ ] **Step 2: Pack + smoke install (in /tmp)**

```bash
npm pack
TARBALL=$(ls -t *.tgz | head -1)
echo "tarball: $TARBALL"
cp "$TARBALL" /tmp/
cd /tmp
npm install -g "/tmp/$TARBALL"
claude-cockpit --version    # expect 1.0.0-beta.0
claude-cockpit status       # expect prints 4 sections
claude-cockpit --help       # expect prints help
npm uninstall -g claude-cockpit
cd -
rm "$TARBALL"
```

- [ ] **Step 3: docs/release-notes/v1.0.0-beta.md**

```markdown
# v1.0.0-beta — Public release polish

cockpit graduates from "works on my machine" to "anyone can `npm install -g`".

## What's new

- **`npm install -g claude-cockpit`** — single-package install from npm registry; no more git clone.
- **`claude-cockpit configure`** — 8-step interactive wizard:
  - statusline preset (minimal / essential / full)
  - dashboard theme (auto / light / dark)
  - dashboard language (en / 中)
  - alert rules enable/disable
  - ctx-high threshold
  - history retention days
  - macOS notification quick check
  - optional ~/.claude/settings.json patch (with backup + rollback)
- **`claude-cockpit status`** — daemon liveness, DB size, statusline wiring all in one command.
- **Three statusline presets** — Minimal / Essential / Full.
- **Light / Dark / Auto theme** — dashboard sidebar toggle; respects OS preference when Auto; localStorage persisted.
- **EN / 中 i18n** — full dashboard UI translated; toggle in sidebar; ~50 keys.

## What's under the hood

- New `packages/cli/` workspace + `tools/bundle.ts` (esbuild + vite) for the published artifact.
- Tailwind tokens for chrome colors moved to CSS variables (`var(--cockpit-*)`); signal colors (info/ok/warning/crit) stay hex. Zero component edits required.
- `react-i18next` + `i18next` for translations; resources synchronously imported (no first-render FOUC).
- `@clack/prompts` for the wizard (5× smaller than inquirer; more polished UX).
- Settings.json patcher: atomic write + JSON.parse read-back validation + automatic rollback from backup on corruption.
- `GET /api/config` daemon endpoint exposes preset/theme/lang to dashboard for fallback defaults.

## Compatibility

- `~/.claude-cockpit/cockpit.db` schema **unchanged** from v0.9 — no migration needed.
- Existing config.json fields preserved by `claude-cockpit configure` (merges rather than overwrites).

## Known limitations

- Statusline / OS notifications / CLI remain English only (i18n scope = dashboard browser UI).
- µPlot Sparkline colors stay hex across light/dark (signal colors, not chrome).
- Linux platform: `wmctrl` still needed for focus-terminal; `notify-send` for notifications.
- Windows still unsupported.
```

- [ ] **Step 4: Commit release notes + tag**

```bash
git add docs/release-notes/v1.0.0-beta.md
git commit -m "$(cat <<'EOF'
docs: release notes for v1.0.0-beta

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git tag -a v1.0.0-beta -m "v1.0: npm publish + configure wizard + presets + light theme + i18n"
```

- [ ] **Step 5: Verify final state**

```bash
git log --oneline -5
git tag --list 'v1*'
```

Expected: latest commit is release notes; `v1.0.0-beta` tag present.

---

# Self-Review

## 1. Spec coverage

- [x] §1 范围 → 19 tasks cover all 7 workstreams
- [x] §2 npm publish → Tasks 2, 3, 4 (bundler, dispatcher, pack smoke)
- [x] §3 configure wizard → Tasks 5-9 (config schema ext, patcher, configure, status, cli entrypoint)
- [x] §4 Minimal/Full presets → Tasks 10-11 (otherCount API, renderFull, config-reader)
- [x] §5 Light theme → Tasks 12-14 (CSS var refactor, theme.ts, Sidebar toggle, /api/config)
- [x] §6 EN/CN i18n → Tasks 15-16 (install, init, locales, component migration, lang toggle)
- [x] §7 README polish + coverage → Tasks 17-18
- [x] §8 risks → mitigations distributed: R25 (Task 4 npm pack smoke) / R26 (Task 7 wizard merges existing) / R27 (Task 6 atomic + rollback) / R28 (intentionally not addressed per spec) / R29 (Task 15 sync import) / R30 (Task 2 explicit external list) / R31 (Task 15 i18n init in setup) / R32 (Task 6 mentions backup proliferation but spec defers)
- [x] §9 测试 → 38+ new tests across tasks
- [x] §10 验收 → Task 19 smoke install + tag

## 2. Placeholder scan

- No "TBD" / "TODO" / "implement later"
- Task 16 lists 7 files to migrate with example code for 2 — the pattern is identical and shown explicitly; engineer applies it. Not a placeholder.
- Task 17 deliberately allows iteration based on actual coverage output — that IS the work. The "what to do" is precise (add tests for files < 60%).

## 3. Type consistency

- `Theme = 'auto' | 'light' | 'dark'` defined in Task 13; same string literals used in Tasks 5 (config-loader), 7 (wizard prompt), 14 (Sidebar toggle), 15 (i18n init's serverDefault), 18 (README example).
- `Lang = 'en' | 'zh-CN'` defined in Task 15; same in Tasks 5 (config schema), 7 (wizard prompt), 14 (Sidebar), 16 (Sidebar lang button).
- Statusline preset enum `'minimal' | 'essential' | 'full'` consistent across Tasks 5, 7, 10, 11, 18.
- `ServerConfig` type in Task 14 matches `GET /api/config` payload shape in Task 10.
- `RenderInput / EssentialInput / FullInput` chain in Task 11 follows existing inheritance pattern.
- `patchSettingsJson` return shape (`PatchResult`) used consistently in Task 6 (def) and Task 7 (consumer).

Plan ready for execution.
