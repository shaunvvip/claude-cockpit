export const palette = {
  ok: '#73bf69', warn: '#f2cc0c', near: '#f4a261', crit: '#e0524d',
  info: '#5794f2', muted: '#7a8794',
}

export function ctxColor(pct: number): string {
  if (pct < 60) return palette.ok
  if (pct < 85) return palette.warn
  if (pct < 95) return palette.near
  return palette.crit
}
