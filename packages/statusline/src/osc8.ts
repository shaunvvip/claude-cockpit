const SUPPORTED_TERM_PROGRAMS: ReadonlySet<string> = new Set([
  'iTerm.app',
  'vscode',
  'WarpTerminal',
  'ghostty',
  'tabby',
])

const NON_LOOPBACK_ENV_HINTS: ReadonlyArray<string> = [
  'WEZTERM_EXECUTABLE',
  'KITTY_WINDOW_ID',
  'GHOSTTY_RESOURCES_DIR',
  'WT_SESSION',
  'VSCODE_INJECTION',
  'ALACRITTY_LOG',
]

export function detectOsc8Support(): boolean {
  const tp = process.env.TERM_PROGRAM
  if (tp && SUPPORTED_TERM_PROGRAMS.has(tp)) return true
  for (const hint of NON_LOOPBACK_ENV_HINTS) {
    if (process.env[hint]) return true
  }
  return false
}

export function osc8(url: string, text: string, supported: boolean): string {
  if (!supported) return text
  const ESC = '\x1b'
  const BEL = '\x07'
  return `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`
}
