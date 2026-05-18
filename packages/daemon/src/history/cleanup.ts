import type { HistoryStore } from './store.js'

export function runCleanup(store: HistoryStore, retentionDays: number): { deleted: Record<string, number> } {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const deleted: Record<string, number> = { sessions: 0, tool_calls: 0, events: 0, usage_snapshots: 0 }
  store.db.transaction(() => {
    deleted.sessions        = store.db.prepare('DELETE FROM sessions        WHERE started_at < ?').run(cutoff).changes
    deleted.tool_calls      = store.db.prepare('DELETE FROM tool_calls      WHERE ts         < ?').run(cutoff).changes
    deleted.events          = store.db.prepare('DELETE FROM events          WHERE ts         < ?').run(cutoff).changes
    deleted.usage_snapshots = store.db.prepare('DELETE FROM usage_snapshots WHERE ts         < ?').run(cutoff).changes
  })()
  return { deleted }
}

export function msUntilNextLocalMidnight(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime() - now
}

export function scheduleDailyCleanup(store: HistoryStore, retentionDays: number): { cancel: () => void } {
  let timer: NodeJS.Timeout | undefined
  function tick() {
    try {
      const result = runCleanup(store, retentionDays)
      const total = Object.values(result.deleted).reduce((a, b) => a + b, 0)
      if (total > 0) console.log('[cockpit] daily cleanup:', result.deleted)
    } catch (e) {
      console.error('[cockpit] cleanup failed:', e)
    }
    timer = setTimeout(tick, msUntilNextLocalMidnight())
  }
  timer = setTimeout(tick, msUntilNextLocalMidnight())
  return { cancel: () => { if (timer) clearTimeout(timer) } }
}
