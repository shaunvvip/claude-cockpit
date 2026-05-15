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
  const cd = formatCountdown(resetAt, now)
  return cd ? `${label} ${Math.round(pct)}% (${cd})` : `${label} ${Math.round(pct)}%`
}

export function renderEssential(input: EssentialInput): string {
  const line1Base = renderMinimal(input).replace(/ · \S*\[cockpit\]\S*$/, '').replace(/ · \[cockpit\]$/, '')
  const line1 = `${line1Base} ${progressBar(input.ctxPct)}`
  const dash = osc8(input.dashboardUrl, '[dash]', input.supportsOsc8)
  const stop = osc8(input.stopUrl,      '[stop]', input.supportsOsc8)
  const file = osc8(input.fileUrl,      '[file]', input.supportsOsc8)
  const now = input.now ?? Date.now()
  const seg5h = renderUsageSegment('5h', input.usage5hPct, input.usage5hResetAt, now)
  const seg7d = renderUsageSegment('7d', input.usage7dPct, input.usage7dResetAt, now)
  const middle = [
    `tools ${input.toolsCount}↑`,
    `todos ${input.todosDone}/${input.todosTotal}`,
    seg5h,
    seg7d,
  ].filter((s): s is string => s !== null).join(' · ')
  const line2 = `${middle} · ${dash} ${stop} ${file}`
  return `${line1}\n${line2}`
}
