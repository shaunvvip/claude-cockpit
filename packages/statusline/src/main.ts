import { parseStatuslineInput } from './stdin.js'
import { renderMinimal } from './render.js'
import type { RuntimeInfo } from '../../daemon/src/runtime-info.js'

export interface RunStatuslineDeps {
  stdin: string
  sockPath: string
  detect: () => boolean
  ensureDaemon: (opts: { command: string; args: string[]; sockPath: string; waitMs: number }) => Promise<void>
  pingDaemon: (sock: string, timeoutMs: number) => Promise<boolean>
  sendUpdateSession: (sock: string, sid: string, payload: object) => Promise<void>
  readRuntimeInfo: (path: string) => RuntimeInfo | null
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

  const supports = deps.detect()
  const rt = deps.readRuntimeInfo(`${process.env.HOME}/.claude-cockpit/daemon.json`)
  const port = rt?.port ?? 0
  const dashboardUrl = port ? `http://localhost:${port}/sessions/${parsed.sessionId}` : 'http://localhost'

  return renderMinimal({
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    model: parsed.model,
    ...(parsed.branch !== undefined && { branch: parsed.branch }),
    ctxPct: 0,
    cost: 0,
    dashboardUrl,
    supportsOsc8: supports,
  })
}
