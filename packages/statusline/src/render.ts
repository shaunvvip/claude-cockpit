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
}

function progressBar(pct: number, width = 10): string {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`
}

export function renderEssential(input: EssentialInput): string {
  const line1Base = renderMinimal(input).replace(/ · \S*\[cockpit\]\S*$/, '').replace(/ · \[cockpit\]$/, '')
  const line1 = `${line1Base} ${progressBar(input.ctxPct)}`
  const dash = osc8(input.dashboardUrl, '[dash]', input.supportsOsc8)
  const stop = osc8(input.stopUrl,      '[stop]', input.supportsOsc8)
  const file = osc8(input.fileUrl,      '[file]', input.supportsOsc8)
  const line2 = `tools ${input.toolsCount}↑ · subagents ×${input.subagentCount} · todos ${input.todosDone}/${input.todosTotal} · ${dash} ${stop} ${file}`
  return `${line1}\n${line2}`
}
