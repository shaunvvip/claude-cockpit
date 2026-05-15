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
