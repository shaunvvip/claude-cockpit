#!/usr/bin/env node
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, cpSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'

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
  return Math.round(statSync(path).size / 1024)
}

function dirSizeKB(path: string): number {
  let total = 0
  function walk(p: string) {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const child = join(p, e.name)
      if (e.isDirectory()) walk(child)
      else total += statSync(child).size
    }
  }
  walk(path)
  return Math.round(total / 1024)
}

main().catch((e) => { console.error(e); process.exit(1) })
