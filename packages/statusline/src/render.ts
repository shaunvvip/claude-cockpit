import { basename } from 'node:path'
import { osc8 } from './osc8.js'
import { coloredBar, colorize, DIM, getCtxColor, getQuotaColor } from './ansi.js'

export interface RenderInput {
  sessionId: string
  cwd: string
  model: string
  branch?: string
  ctxPct: number
  dashboardUrl: string
  supportsOsc8: boolean
}

export function renderMinimal(input: RenderInput): string {
  const cwdShort = basename(input.cwd) || input.cwd
  const ctxColored = colorize(`${Math.round(input.ctxPct)}%`, getCtxColor(input.ctxPct))
  const link = osc8(input.dashboardUrl, '[cockpit]', input.supportsOsc8)
  const parts = [`● ${input.model}`, cwdShort]
  if (input.branch) parts.push(input.branch)
  parts.push(`ctx ${ctxColored}`, link)
  return parts.join(' · ')
}

export interface EssentialInput extends RenderInput {
  toolsCount: number
  subagentCount: number
  todosDone: number
  todosTotal: number
  stopUrl: string
  fileUrl: string
  usage5hPct?: number
  usage5hResetAt?: number
  usage7dPct?: number
  usage7dResetAt?: number
  now?: number   // injectable for tests
}

// Plain monochrome bar — kept for backwards compatibility / tests that match
// substrings like "[████░░░░░░]". Prefer coloredBar() from ansi.ts for live output.
function progressBar(pct: number, width = 10): string {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`
}

/**
 * Compact countdown:  "2h 30m" / "5d 12h" / "25m" / "<1m"
 * Returns empty string if resetAt is in the past or undefined.
 */
export function formatCountdown(resetAt: number | undefined, now: number): string {
  if (resetAt === undefined) return ''
  const diffMs = resetAt - now
  if (diffMs <= 0) return ''
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const remMin = m - h * 60
  if (h < 24) return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`
  const d = Math.floor(h / 24)
  const remH = h - d * 24
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`
}

function renderUsageSegment(label: '5h' | '7d', pct: number | undefined, resetAt: number | undefined, now: number): string | null {
  if (pct === undefined) return null
  const bar = coloredBar(pct, 5, getQuotaColor)        // 5-cell inline mini-bar
  const pctText = colorize(`${Math.round(pct)}%`, getQuotaColor(pct))
  const cd = formatCountdown(resetAt, now)
  // bar→% order matches ctx; countdown in dim parens so it reads as secondary
  return cd ? `${label} ${bar} ${pctText} ${colorize(`(${cd})`, DIM)}` : `${label} ${bar} ${pctText}`
}

export function renderEssential(input: EssentialInput): string {
  // Line 1 — identity + active work + actionable links
  //   ● model · cwd · branch? · tools N↑ · todos a/b · [dash] [stop] [file]
  const cwdShort = basename(input.cwd) || input.cwd
  const dash = osc8(input.dashboardUrl, '[dash]', input.supportsOsc8)
  const stop = osc8(input.stopUrl,      '[stop]', input.supportsOsc8)
  const file = osc8(input.fileUrl,      '[file]', input.supportsOsc8)
  const line1Parts = [`● ${input.model}`, cwdShort]
  if (input.branch) line1Parts.push(input.branch)
  line1Parts.push(`tools ${input.toolsCount}↑`)
  if (input.subagentCount > 0) line1Parts.push(`subagents ×${input.subagentCount}`)
  line1Parts.push(`todos ${input.todosDone}/${input.todosTotal}`)
  const line1 = `${line1Parts.join(' · ')} · ${dash} ${stop} ${file}`

  // Line 2 — usage gauges, bar→% consistent across all three; 4-space gaps for breathing room
  //   ctx ████░░░░░░ N%    5h ▓▓░░░ X% (Hh Mm)    7d ▓░░░░ Y% (Dd Hh)
  const now = input.now ?? Date.now()
  const ctxBar = coloredBar(input.ctxPct, 10, getCtxColor)
  const ctxPctColored = colorize(`${Math.round(input.ctxPct)}%`, getCtxColor(input.ctxPct))
  const seg5h = renderUsageSegment('5h', input.usage5hPct, input.usage5hResetAt, now)
  const seg7d = renderUsageSegment('7d', input.usage7dPct, input.usage7dResetAt, now)
  const line2Parts = [`ctx ${ctxBar} ${ctxPctColored}`, seg5h, seg7d]
    .filter((s): s is string => s !== null && s.length > 0)
  const line2 = line2Parts.join('    ')   // 4-space separator (no dot) for chunkier segments

  return `${line1}\n${line2}`
}
