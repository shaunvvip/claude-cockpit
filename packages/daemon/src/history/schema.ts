import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 1

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id                     TEXT    PRIMARY KEY,
    cwd                    TEXT    NOT NULL,
    project_dir            TEXT,
    model                  TEXT    NOT NULL,
    branch                 TEXT,
    started_at             INTEGER NOT NULL,
    ended_at               INTEGER,
    last_update            INTEGER NOT NULL,
    total_cost             REAL    DEFAULT 0,
    input_tokens           INTEGER DEFAULT 0,
    output_tokens          INTEGER DEFAULT 0,
    cache_read_tokens      INTEGER DEFAULT 0,
    cache_creation_tokens  INTEGER DEFAULT 0,
    task_count             INTEGER DEFAULT 0,
    transcript_path        TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_started_at  ON sessions(started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_project_dir ON sessions(project_dir)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_cwd         ON sessions(cwd)`,

  `CREATE TABLE IF NOT EXISTS tool_calls (
    session_id  TEXT    NOT NULL,
    ts          INTEGER NOT NULL,
    tool_name   TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'ok',
    PRIMARY KEY (session_id, ts, tool_name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tool_calls_ts        ON tool_calls(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name)`,

  `CREATE TABLE IF NOT EXISTS events (
    session_id   TEXT    NOT NULL,
    ts           INTEGER NOT NULL,
    event_type   TEXT    NOT NULL,
    payload_json TEXT    NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type)`,

  `CREATE TABLE IF NOT EXISTS usage_snapshots (
    ts                  INTEGER PRIMARY KEY,
    five_hour_pct       REAL,
    seven_day_pct       REAL,
    five_hour_reset_at  INTEGER,
    seven_day_reset_at  INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_snapshots_ts ON usage_snapshots(ts)`,

  `CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
]

export function ensureSchema(db: Database.Database): void {
  db.transaction(() => {
    for (const sql of DDL_STATEMENTS) db.prepare(sql).run()
    db.prepare('INSERT OR IGNORE INTO schema_meta(key, value) VALUES (?, ?)')
      .run('schema_version', String(SCHEMA_VERSION))
  })()
}

export function getSchemaVersion(db: Database.Database): number | null {
  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_meta'")
    .get()
  if (!tableExists) return null
  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get('schema_version') as { value: string } | undefined
  return row ? Number(row.value) : null
}
