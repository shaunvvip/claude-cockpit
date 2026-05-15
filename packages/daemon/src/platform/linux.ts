import { spawn, execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(_execFile)

function run(cmd: string, args: string[], stdin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args)
    c.on('error', reject)
    c.on('close', () => resolve())
    if (stdin !== undefined) {
      c.stdin.write(stdin)
      c.stdin.end()
    }
  })
}

export const openUrl        = (url: string)  => run('xdg-open', [url])
export const openFile       = (path: string) => run(process.env.EDITOR ?? 'xdg-open', [path])
export const clipboardWrite = (text: string) => run('xclip', ['-selection', 'clipboard'], text)

export const notify = (args: { title: string; body: string; deepLink?: string }): Promise<void> => {
  const body = args.body + (args.deepLink ? ` — ${args.deepLink}` : '')
  return run('notify-send', ['--app-name=cockpit', args.title, body])
}

export const focusTerminal = async (pid: number): Promise<void> => {
  try {
    const { stdout } = await execFileP('wmctrl', ['-l', '-p'])
    for (const line of stdout.split('\n')) {
      const cols = line.trim().split(/\s+/)
      if (cols.length < 4) continue
      // cols: <xid> <desktop> <pid> <host> <title...>
      if (Number(cols[2]) === pid) {
        await run('wmctrl', ['-i', '-a', cols[0]!])
        return
      }
    }
  } catch { /* soft fail */ }
}
