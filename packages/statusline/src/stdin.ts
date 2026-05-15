export interface StatuslineInput {
  sessionId: string
  cwd: string
  model: string
  transcriptPath: string
  branch?: string
  cost?: number
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

  // Claude Code stdin includes cost.total_cost_usd (Bug C: previously ignored)
  let cost: number | undefined
  if (v.cost && typeof v.cost === 'object') {
    const c = (v.cost as Record<string, unknown>).total_cost_usd
    if (typeof c === 'number' && Number.isFinite(c)) cost = c
  }

  return {
    sessionId, cwd, model, transcriptPath,
    ...(branch !== undefined && { branch }),
    ...(cost !== undefined && { cost }),
  }
}
