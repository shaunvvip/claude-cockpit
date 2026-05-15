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

## Roadmap

- v0.5 — Smart alerts (ctx 90% / cost spike / loop detection) + system notifications + working `[stop]` action.
- v0.9 — SQLite history: 30-day trends, top sessions, project cost ranking, real (non-mock) Sparklines.
- v1.0 — Minimal / Full presets, configure wizard, light theme, EN/CN i18n.

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
