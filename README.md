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
- **MCP detection**: tells you which MCP servers Claude has configured (per-session health indicator on each card).
- **Lazy daemon**: spawns on first statusline refresh, auto-exits after 30 min idle. No services to install.

## How it works

Three layers, all on `localhost`, zero external requests.

```mermaid
flowchart LR
    subgraph CC["Collection · per Claude Code instance"]
        direction TB
        S1["Claude Code #1"] -->|stdin JSON| SL1["statusline plugin<br/>fork each refresh"]
        S2["Claude Code #2"] -->|stdin JSON| SL2["statusline plugin"]
        S3["Claude Code #3"] -->|stdin JSON| SL3["statusline plugin"]
    end

    subgraph D["Coordination · cockpit daemon (lazy, 1 per user)"]
        direction TB
        Reg["SessionRegistry<br/>Map&lt;sid, SessionState&gt;"]
        Watcher["TranscriptWatcher<br/>tail JSONL"]
        WSB["WsBroadcaster"]
        API["HTTP /api/sessions"]
        IC["IdleChecker · 30min<br/>auto-shutdown"]

        JSONL[("~/.claude/projects/<br/>**.jsonl")] -->|fs.watch| Watcher
        Watcher -->|TOOL_USE / USAGE| Reg
        Reg --> WSB
        Reg --> API
        Reg -.-> IC
    end

    subgraph P["Presentation · browser"]
        DASH["Vite + React Dashboard<br/>µPlot Sparklines"]
    end

    SL1 -->|Unix socket<br/>UPDATE_SESSION| Reg
    SL2 -->|Unix socket| Reg
    SL3 -->|Unix socket| Reg
    SL1 <-->|HTTP GET /api/sessions/:id| API

    WSB -->|WebSocket<br/>SESSION_UPSERT diff| DASH
    API -->|initial GET| DASH
    DASH -.->|OSC 8 click [dash]| SL1
```

**Why two data sources into SessionRegistry?** The statusline plugin gives us low-latency "session is alive" signals on every refresh (~300ms cadence). The `TranscriptWatcher` tails the actual `*.jsonl` transcript and gives us ground-truth `tool_use` events and `usage` token counts. They cross-check each other — if one drops a beat the other catches it.

**Why lazy daemon?** Nothing to install, nothing to launchctl. First statusline refresh detects the missing Unix socket, double-fork-spawns a detached daemon, then 30 min after the last session update the daemon exits on its own. `~/.claude-cockpit/daemon.json` carries the random HTTP port between processes.

### One refresh, end to end

```mermaid
sequenceDiagram
    autonumber
    participant CC as Claude Code
    participant SL as statusline (subprocess)
    participant D as daemon
    participant W as TranscriptWatcher
    participant B as Dashboard (browser)

    CC->>SL: stdin JSON
    SL->>D: ping unix socket (80ms)
    opt daemon not running
        SL->>D: spawn detached + double-fork
        Note over D: 200ms wait; SL exits, daemon survives
    end
    SL->>D: UPDATE_SESSION { sid, cwd, model, ... }
    D->>D: SessionRegistry.upsert(sid)
    opt first sight of this sid
        D->>W: start watcher on transcript_path
    end
    W-->>D: TOOL_USE / USAGE events (async)
    D->>D: compute ctxPct, append tool, persist
    D->>B: WebSocket SESSION_UPSERT
    SL->>D: GET /api/sessions/:sid
    D-->>SL: merged SessionState
    SL-->>CC: 2-line rendered output<br/>with OSC 8 links
```

The hot path (statusline refresh) is ~50–80ms once the daemon is warm. Cold start (first refresh of a session) is ~500ms — dominated by `tsx` warmup of the daemon.

### File layout

```
claude-cockpit/
├── packages/
│   ├── shared/         # cross-package types: SessionState, RpcFrame
│   ├── statusline/     # Claude Code statusline plugin (fork per refresh)
│   │   ├── bin/        # CLI entry
│   │   └── src/        # stdin parse, render, OSC 8, RPC client, lazy spawn
│   ├── daemon/         # long-running coordinator
│   │   ├── bin/        # CLI entry (top-level await + signal handlers)
│   │   └── src/
│   │       ├── socket-server.ts       # Unix socket RPC
│   │       ├── http-server.ts         # HTTP + WebSocket + static SPA
│   │       ├── session-registry.ts    # in-memory state
│   │       ├── transcript-watcher.ts  # tail JSONL → events
│   │       ├── mcp-inspector.ts       # parse ~/.claude/settings.json
│   │       ├── lifecycle.ts           # idle check + graceful shutdown
│   │       ├── api/                   # /api/sessions routes + WS
│   │       └── platform/              # macOS + Linux abstraction
│   └── dashboard/      # Vite + React + TanStack Router + Tailwind + µPlot
└── tests/e2e/          # full lifecycle integration (spawn → register → API)
```

## Roadmap

- v0.5 — Smart alerts (ctx 90% / cost spike / loop detection) + system notifications + working `[stop]` action.
- v0.9 — SQLite history: 30-day trends, top sessions, project cost ranking, real (non-mock) Sparklines.
- v1.0 — Minimal / Full presets, configure wizard, light theme, EN/CN i18n.

## Install (alpha)

```bash
git clone https://github.com/shaunvvip/claude-cockpit
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

Restart Claude Code. First refresh lazy-starts the daemon. Click `[dash]` to open the dashboard.

## Supported terminals (OSC 8 clickable links)

- iTerm2, Ghostty, WezTerm, Kitty, VS Code integrated, Warp, Alacritty
- macOS Terminal.app falls back to plain text (no clickable links)
- Use `/cockpit:open` slash command as a universal fallback (Phase 4)

## Privacy

The daemon stores **only session metadata** (cwd, model, tokens, tool names — NOT transcript content). Everything is local — zero external requests. Code is auditable.

## Platforms

Tested on macOS and Linux (matrix CI). Windows support is community-vendored — see `packages/daemon/src/platform/` for the abstraction.

## Development

```bash
npm install
npm test              # 87 unit tests
npm run test:e2e      # 2 end-to-end tests
npm run typecheck     # type-check across workspaces
npm run -w packages/dashboard dev    # vite dev server
npm run -w packages/dashboard build  # production build
```

## License

MIT
