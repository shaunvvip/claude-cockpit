import { parseStatuslineInput } from './stdin.js'
import { renderEssential } from './render.js'
import type { RuntimeInfo } from '../../daemon/src/runtime-info.js'
import type { SessionState } from '@claude-cockpit/shared'

export interface RunStatuslineDeps {
  stdin: string
  sockPath: string
  detect: () => boolean
  ensureDaemon: (opts: { command: string; args: string[]; sockPath: string; waitMs: number }) => Promise<void>
  pingDaemon: (sock: string, timeoutMs: number) => Promise<boolean>
  sendUpdateSession: (sock: string, sid: string, payload: object) => Promise<void>
  readRuntimeInfo: (path: string) => RuntimeInfo | null
  fetchSession: (port: number, sid: string) => Promise<SessionState | undefined>
}

export async function runStatusline(deps: RunStatuslineDeps): Promise<string> {
  const parsed = parseStatuslineInput(deps.stdin)
  if (!parsed) return 'claude-cockpit · waiting for valid Claude Code stdin'

  const ping = await deps.pingDaemon(deps.sockPath, 100)
  if (ping) {
    void deps.sendUpdateSession(deps.sockPath, parsed.sessionId, {
      cwd: parsed.cwd,
      model: parsed.model,
      transcriptPath: parsed.transcriptPath,
      pid: process.pid,
      ppid: process.ppid,         // statusline subprocess's parent — Claude Code main
      ...(parsed.branch !== undefined && { branch: parsed.branch }),
      ...(parsed.projectDir !== undefined && { projectDir: parsed.projectDir }),
      ...(parsed.cost !== undefined && { cost: parsed.cost }),
      ...(parsed.usage5hPct !== undefined && { usage5hPct: parsed.usage5hPct }),
      ...(parsed.usage5hResetAt !== undefined && { usage5hResetAt: parsed.usage5hResetAt }),
      ...(parsed.usage7dPct !== undefined && { usage7dPct: parsed.usage7dPct }),
      ...(parsed.usage7dResetAt !== undefined && { usage7dResetAt: parsed.usage7dResetAt }),
      lastUpdate: Date.now(),
    })
  }

  const rt = deps.readRuntimeInfo(`${process.env.HOME}/.claude-cockpit/daemon.json`)
  const port = rt?.port ?? 0
  let merged: SessionState | undefined
  if (port && ping) {
    try { merged = await deps.fetchSession(port, parsed.sessionId) }
    catch { /* daemon race; fall back to local-only */ }
  }

  const ctxPct = merged?.ctxPct ?? 0
  const toolsCount = merged?.tools.length ?? 0
  const subagentCount = merged?.taskCount ?? 0
  const todosDone = merged?.todos.filter((t) => t.completed).length ?? 0
  const todosTotal = merged?.todos.length ?? 0

  // Prefer fresh stdin values over the daemon's cached copy (same rationale as cost)
  const usage5hPct = parsed.usage5hPct ?? merged?.usage5hPct
  const usage5hResetAt = parsed.usage5hResetAt ?? merged?.usage5hResetAt
  const usage7dPct = parsed.usage7dPct ?? merged?.usage7dPct
  const usage7dResetAt = parsed.usage7dResetAt ?? merged?.usage7dResetAt

  return renderEssential({
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    model: parsed.model,
    ...(parsed.branch !== undefined && { branch: parsed.branch }),
    ctxPct,
    toolsCount,
    subagentCount,
    todosDone,
    todosTotal,
    ...(usage5hPct !== undefined && { usage5hPct }),
    ...(usage5hResetAt !== undefined && { usage5hResetAt }),
    ...(usage7dPct !== undefined && { usage7dPct }),
    ...(usage7dResetAt !== undefined && { usage7dResetAt }),
    dashboardUrl: `http://localhost:${port}/sessions/${parsed.sessionId}`,
    stopUrl:      `http://localhost:${port}/api/sessions/${parsed.sessionId}/interrupt-redirect`,
    fileUrl:      `http://localhost:${port}/api/sessions/${parsed.sessionId}/open-file-redirect`,
    supportsOsc8: deps.detect(),
  })
}
