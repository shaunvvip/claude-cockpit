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
