import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { ensureSchema, getSchemaVersion, SCHEMA_VERSION } from './schema.js'

function freshDb(): Database.Database {
  return new Database(':memory:')
}

describe('ensureSchema', () => {
  it('creates all 4 tables + schema_meta from blank DB', () => {
    const db = freshDb()
    ensureSchema(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('sessions')
    expect(names).toContain('tool_calls')
    expect(names).toContain('events')
    expect(names).toContain('usage_snapshots')
    expect(names).toContain('schema_meta')
  })

  it('is idempotent (running twice does not throw)', () => {
    const db = freshDb()
    ensureSchema(db)
    expect(() => ensureSchema(db)).not.toThrow()
  })

  it('writes schema_version=1 to schema_meta', () => {
    const db = freshDb()
    ensureSchema(db)
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION)
    expect(getSchemaVersion(db)).toBe(1)
  })

  it('returns null version on totally fresh DB before ensureSchema', () => {
    const db = freshDb()
    expect(getSchemaVersion(db)).toBe(null)
  })

  it('creates required indexes', () => {
    const db = freshDb()
    ensureSchema(db)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all() as { name: string }[]
    const names = indexes.map(i => i.name)
    expect(names).toContain('idx_sessions_started_at')
    expect(names).toContain('idx_tool_calls_ts')
    expect(names).toContain('idx_events_session_ts')
    expect(names).toContain('idx_usage_snapshots_ts')
  })
})
