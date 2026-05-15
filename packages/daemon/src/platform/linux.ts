import { spawn } from 'node:child_process'

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

export const focusTerminal = (pid: number): Promise<void> => {
  return run('wmctrl', ['-i', '-a', String(pid)]).catch(() => undefined)
}
