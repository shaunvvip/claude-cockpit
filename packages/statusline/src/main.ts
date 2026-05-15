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
      ...(parsed.branch !== undefined && { branch: parsed.branch }),
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
  const cost = merged?.cost ?? 0
  const toolsCount = merged?.tools.length ?? 0
  const todosDone = merged?.todos.filter((t) => t.completed).length ?? 0
  const todosTotal = merged?.todos.length ?? 0

  return renderEssential({
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    model: parsed.model,
    branch: parsed.branch ?? 'detached',
    ctxPct,
    cost,
    toolsCount,
    subagentCount: 0,
    todosDone,
    todosTotal,
    dashboardUrl: `http://localhost:${port}/sessions/${parsed.sessionId}`,
    stopUrl:      `http://localhost:${port}/api/sessions/${parsed.sessionId}/interrupt-redirect`,
    fileUrl:      `http://localhost:${port}/api/sessions/${parsed.sessionId}/open-file-redirect`,
    supportsOsc8: deps.detect(),
  })
}
