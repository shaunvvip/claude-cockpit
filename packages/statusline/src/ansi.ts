// ANSI escape sequences for terminal coloring of the statusline.
// Color thresholds mirror claude-hud:
//   ctx:    >=85 red,  >=70 yellow, else green
//   quota:  >=90 red,  >=75 bright-magenta, else bright-blue

export const RESET = '\x1b[0m'
export const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BRIGHT_BLUE = '\x1b[94m'
const BRIGHT_MAGENTA = '\x1b[95m'

export function colorize(text: string, code: string): string {
  return `${code}${text}${RESET}`
}

export function getCtxColor(pct: number): string {
  if (pct >= 85) return RED
  if (pct >= 70) return YELLOW
  return GREEN
}

export function getQuotaColor(pct: number): string {
  if (pct >= 90) return RED
  if (pct >= 75) return BRIGHT_MAGENTA
  return BRIGHT_BLUE
}

/**
 * Colored progress bar — fills filled-section with the threshold-derived color,
 * dims the empty section. Returns a self-contained ANSI string ending in RESET.
 */
export function coloredBar(pct: number, width: number, getColor: (pct: number) => string): string {
  const safeWidth = Math.max(0, Math.round(width))
  const safePct = Math.max(0, Math.min(100, pct))
  const filled = Math.round((safePct / 100) * safeWidth)
  const empty = safeWidth - filled
  const color = getColor(safePct)
  return `${color}${'█'.repeat(filled)}${RESET}${DIM}${'░'.repeat(empty)}${RESET}`
}
