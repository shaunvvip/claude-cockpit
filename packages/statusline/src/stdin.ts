export interface StatuslineInput {
  sessionId: string
  cwd: string
  model: string
  transcriptPath: string
  branch?: string
  projectDir?: string         // ← NEW (workspace.project_dir)
  cost?: number
  usage5hPct?: number
  usage5hResetAt?: number   // ms epoch
  usage7dPct?: number
  usage7dResetAt?: number
}

function parseResetAt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    // CC may emit either seconds or ms epoch; values < 1e12 are seconds
    return v < 1e12 ? v * 1000 : v
  }
  if (typeof v === 'string' && v.trim()) {
    const t = new Date(v).getTime()
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

function parsePct(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return Math.max(0, Math.min(100, v))
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

  let projectDir: string | undefined
  if (v.workspace && typeof v.workspace === 'object') {
    const pd = (v.workspace as Record<string, unknown>).project_dir
    if (typeof pd === 'string') projectDir = pd
  }

  // Claude Code stdin includes cost.total_cost_usd (Bug C: previously ignored)
  let cost: number | undefined
  if (v.cost && typeof v.cost === 'object') {
    const c = (v.cost as Record<string, unknown>).total_cost_usd
    if (typeof c === 'number' && Number.isFinite(c)) cost = c
  }

  // Subscriber usage limits (5h + 7d windows). Optional — older CC versions don't emit.
  let usage5hPct: number | undefined
  let usage5hResetAt: number | undefined
  let usage7dPct: number | undefined
  let usage7dResetAt: number | undefined
  const rl = v.rate_limits
  if (rl && typeof rl === 'object') {
    const five = (rl as Record<string, unknown>).five_hour as Record<string, unknown> | undefined
    if (five) {
      usage5hPct = parsePct(five.used_percentage)
      usage5hResetAt = parseResetAt(five.resets_at)
    }
    const seven = (rl as Record<string, unknown>).seven_day as Record<string, unknown> | undefined
    if (seven) {
      usage7dPct = parsePct(seven.used_percentage)
      usage7dResetAt = parseResetAt(seven.resets_at)
    }
  }

  return {
    sessionId, cwd, model, transcriptPath,
    ...(branch !== undefined && { branch }),
    ...(projectDir !== undefined && { projectDir }),
    ...(cost !== undefined && { cost }),
    ...(usage5hPct !== undefined && { usage5hPct }),
    ...(usage5hResetAt !== undefined && { usage5hResetAt }),
    ...(usage7dPct !== undefined && { usage7dPct }),
    ...(usage7dResetAt !== undefined && { usage7dResetAt }),
  }
}
