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

export const openUrl        = (url: string)  => run('open', [url])
export const openFile       = (path: string) => run(process.env.EDITOR ?? 'open', [path])
export const clipboardWrite = (text: string) => run('pbcopy', [], text)

function escAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export const notify = (args: { title: string; body: string; deepLink?: string }): Promise<void> => {
  const body = escAppleScriptString(args.body + (args.deepLink ? ` — ${args.deepLink}` : ''))
  const title = escAppleScriptString(args.title)
  const script = `display notification "${body}" with title "${title}" sound name "Glass"`
  return run('osascript', ['-e', script])
}

export const focusTerminal = (pid: number): Promise<void> => {
  const script = `
    set found to ""
    try
      do shell script "ps -o ppid= -p ${pid} 2>/dev/null"
    end try
    tell application "System Events"
      try
        set frontmost of first process whose unix id is ${pid} to true
      end try
    end tell
  `
  return run('osascript', ['-e', script]).catch(() => undefined)
}
