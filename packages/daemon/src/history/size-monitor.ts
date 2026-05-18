import type { HistoryStore } from './store.js'

const WARN_BYTES = 500 * 1024 * 1024   // 500 MB

export function dbSizeBytes(store: HistoryStore): number {
  const pageCount = (store.db.pragma('page_count', { simple: true }) as unknown as number) ?? 0
  const pageSize = (store.db.pragma('page_size', { simple: true }) as unknown as number) ?? 0
  return pageCount * pageSize
}

export function checkDbSize(store: HistoryStore): { bytes: number; warned: boolean } {
  const bytes = dbSizeBytes(store)
  const warned = bytes > WARN_BYTES
  if (warned) {
    console.warn(`[cockpit] DB size ${(bytes / 1024 / 1024).toFixed(0)}MB exceeds 500MB warn threshold — consider lowering retentionDays or POST /api/history/clear`)
  }
  return { bytes, warned }
}

export function scheduleSizeMonitor(store: HistoryStore): { cancel: () => void } {
  const HOUR = 60 * 60 * 1000
  const timer = setInterval(() => { try { checkDbSize(store) } catch (e) { console.error('[cockpit] size check failed:', e) } }, HOUR)
  return { cancel: () => clearInterval(timer) }
}
