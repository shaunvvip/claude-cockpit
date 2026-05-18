import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'

export interface PatchResult {
  patched: boolean
  previousCommand?: string
  backupPath?: string
  error?: string
}

const NEW_COMMAND = 'npx claude-cockpit statusline'

/**
 * Patches ~/.claude/settings.json so that statusLine.command points at
 * claude-cockpit's CLI. Atomic write via *.tmp + rename. Previous command
 * (if any) is preserved in a backup file alongside.
 *
 * Behavior:
 * - settings.json missing → create with just statusLine
 * - statusLine.command === NEW_COMMAND already → no-op (patched=false)
 * - other current command → backup to settings.json.bak.cockpit-<ts> then patch
 * - invalid JSON in settings.json → return error, do nothing
 * - if post-patch read-back fails JSON.parse → rollback from backup, return error
 */
export function patchSettingsJson(path: string): PatchResult {
  let current: Record<string, unknown> = {}
  if (existsSync(path)) {
    try {
      current = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch (e) {
      return { patched: false, error: `settings.json not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  const sl = current.statusLine as Record<string, unknown> | undefined
  if (sl && typeof sl.command === 'string' && sl.command === NEW_COMMAND) {
    return { patched: false }                        // already pointing at us
  }

  // Backup if there is a prior statusLine
  let backupPath: string | undefined
  let previousCommand: string | undefined
  if (sl && typeof sl.command === 'string') {
    previousCommand = sl.command
    backupPath = `${path}.bak.cockpit-${Date.now()}`
    writeFileSync(backupPath, readFileSync(path, 'utf8'))
  }

  // Build patched object
  const patched = { ...current, statusLine: { type: 'command', command: NEW_COMMAND } }

  // Atomic write
  const tmp = `${path}.tmp.cockpit`
  try {
    writeFileSync(tmp, JSON.stringify(patched, null, 2))
    renameSync(tmp, path)
  } catch (e) {
    return { patched: false, error: `write failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Read-back validation
  try {
    JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // rollback from backup if available
    if (backupPath) {
      writeFileSync(path, readFileSync(backupPath, 'utf8'))
    }
    return { patched: false, error: 'post-write validation failed; rolled back' }
  }

  return {
    patched: true,
    ...(previousCommand !== undefined && { previousCommand }),
    ...(backupPath !== undefined && { backupPath }),
  }
}
