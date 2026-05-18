import type { HistoryStore } from './store.js'

export interface HistoryAvailability {
  available: boolean
  reason?: string
  store?: HistoryStore
}

/**
 * Try to instantiate a HistoryStore. If better-sqlite3 native binding fails
 * to load (e.g., on Alpine glibc, unsupported arch, or when prebuilt binary
 * is missing), return `available: false` with the underlying error — daemon
 * keeps running, /api/history/* returns a friendly fallback (Task 13).
 */
export async function tryOpenHistory(dbPath: string): Promise<HistoryAvailability> {
  try {
    // Dynamic import so a missing native binding doesn't crash module-level load
    const { HistoryStore } = await import('./store.js')
    const store = new HistoryStore(dbPath)
    return { available: true, store }
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
