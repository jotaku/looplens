import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA_DIR = join(homedir(), '.looplens');
const DB_PATH = join(DATA_DIR, 'analytics.db');
const SESSIONS_JSON = join(DATA_DIR, 'sessions.json');
const EVENTS_JSON = join(DATA_DIR, 'events.json');

let _db: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (_db) return _db;

  const dbPath = customPath ?? DB_PATH;
  const dbDir = customPath ? undefined : DATA_DIR;

  if (dbDir && !existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(dbPath);

  // Enable WAL mode for concurrent read/write safety
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  createSchema(_db);
  migrateSchema(_db);
  if (!customPath) {
    migrateFromJson(_db);
  }

  return _db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id            TEXT PRIMARY KEY,
      model_id              TEXT DEFAULT '',
      model_name            TEXT DEFAULT '',
      cwd                   TEXT DEFAULT '',
      started_at            TEXT NOT NULL,
      ended_at              TEXT,
      end_reason            TEXT,
      total_cost_usd        REAL DEFAULT 0,
      total_duration_ms     INTEGER DEFAULT 0,
      total_api_duration_ms INTEGER DEFAULT 0,
      total_input_tokens    INTEGER DEFAULT 0,
      total_output_tokens   INTEGER DEFAULT 0,
      cache_read_tokens     INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      total_lines_added     INTEGER DEFAULT 0,
      total_lines_removed   INTEGER DEFAULT 0,
      context_window_size   INTEGER DEFAULT 0,
      used_percentage       REAL DEFAULT 0,
      tools_used            TEXT DEFAULT '{}',
      files_changed         TEXT DEFAULT '[]',
      last_assistant_message TEXT,
      version               TEXT,
      stop_reason           TEXT,
      agent_id              TEXT,
      agent_type            TEXT,
      transcript_path       TEXT,
      task_label            TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);

    CREATE TABLE IF NOT EXISTS events (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id            TEXT NOT NULL,
      timestamp             TEXT NOT NULL,
      event                 TEXT NOT NULL,
      tool_name             TEXT,
      tool_input            TEXT,
      tool_response         TEXT,
      model                 TEXT,
      source                TEXT,
      reason                TEXT,
      error                 TEXT,
      error_details         TEXT,
      last_assistant_message TEXT,
      agent_id              TEXT,
      agent_type            TEXT,
      transcript_path       TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
  `);
}

function migrateSchema(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('task_label')) {
    db.exec('ALTER TABLE sessions ADD COLUMN task_label TEXT');
  }
}

function migrateFromJson(db: Database.Database): void {
  // Only migrate if JSON files exist and DB tables are empty
  const count = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
  if (count.c > 0) return;

  let migrated = false;

  // Migrate sessions.json
  if (existsSync(SESSIONS_JSON)) {
    try {
      const raw = readFileSync(SESSIONS_JSON, 'utf-8');
      const sessions: Record<string, Record<string, unknown>> = JSON.parse(raw);
      const entries = Object.values(sessions);

      if (entries.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO sessions (
            session_id, model_id, model_name, cwd, started_at, ended_at, end_reason,
            total_cost_usd, total_duration_ms, total_api_duration_ms,
            total_input_tokens, total_output_tokens, cache_read_tokens, cache_creation_tokens,
            total_lines_added, total_lines_removed, context_window_size, used_percentage,
            tools_used, files_changed, last_assistant_message, version, stop_reason,
            agent_id, agent_type, transcript_path
          ) VALUES (
            @session_id, @model_id, @model_name, @cwd, @started_at, @ended_at, @end_reason,
            @total_cost_usd, @total_duration_ms, @total_api_duration_ms,
            @total_input_tokens, @total_output_tokens, @cache_read_tokens, @cache_creation_tokens,
            @total_lines_added, @total_lines_removed, @context_window_size, @used_percentage,
            @tools_used, @files_changed, @last_assistant_message, @version, @stop_reason,
            @agent_id, @agent_type, @transcript_path
          )
        `);

        const tx = db.transaction((rows: Record<string, unknown>[]) => {
          for (const s of rows) {
            insert.run({
              session_id: s.session_id ?? '',
              model_id: s.model_id ?? '',
              model_name: s.model_name ?? '',
              cwd: s.cwd ?? '',
              started_at: s.started_at ?? new Date().toISOString(),
              ended_at: s.ended_at ?? null,
              end_reason: s.end_reason ?? null,
              total_cost_usd: s.total_cost_usd ?? 0,
              total_duration_ms: s.total_duration_ms ?? 0,
              total_api_duration_ms: s.total_api_duration_ms ?? 0,
              total_input_tokens: s.total_input_tokens ?? 0,
              total_output_tokens: s.total_output_tokens ?? 0,
              cache_read_tokens: s.cache_read_tokens ?? 0,
              cache_creation_tokens: s.cache_creation_tokens ?? 0,
              total_lines_added: s.total_lines_added ?? 0,
              total_lines_removed: s.total_lines_removed ?? 0,
              context_window_size: s.context_window_size ?? 0,
              used_percentage: s.used_percentage ?? 0,
              tools_used: JSON.stringify(s.tools_used ?? {}),
              files_changed: JSON.stringify(s.files_changed ?? []),
              last_assistant_message: s.last_assistant_message ?? null,
              version: s.version ?? null,
              stop_reason: s.stop_reason ?? null,
              agent_id: s.agent_id ?? null,
              agent_type: s.agent_type ?? null,
              transcript_path: s.transcript_path ?? null,
            });
          }
        });

        tx(entries);
        console.log(`  Migrated ${entries.length} sessions from JSON to SQLite`);
        migrated = true;
      }
    } catch (err) {
      console.error('  Failed to migrate sessions.json:', err);
    }
  }

  // Migrate events.json
  if (existsSync(EVENTS_JSON)) {
    try {
      const raw = readFileSync(EVENTS_JSON, 'utf-8');
      const events: Record<string, unknown>[] = JSON.parse(raw);

      if (events.length > 0) {
        const insert = db.prepare(`
          INSERT INTO events (
            session_id, timestamp, event, tool_name, tool_input, tool_response,
            model, source, reason, error, error_details, last_assistant_message,
            agent_id, agent_type, transcript_path
          ) VALUES (
            @session_id, @timestamp, @event, @tool_name, @tool_input, @tool_response,
            @model, @source, @reason, @error, @error_details, @last_assistant_message,
            @agent_id, @agent_type, @transcript_path
          )
        `);

        const tx = db.transaction((rows: Record<string, unknown>[]) => {
          for (const e of rows) {
            insert.run({
              session_id: e.session_id ?? '',
              timestamp: e.timestamp ?? new Date().toISOString(),
              event: e.event ?? '',
              tool_name: e.tool_name ?? null,
              tool_input: e.tool_input ? JSON.stringify(e.tool_input) : null,
              tool_response: e.tool_response ? JSON.stringify(e.tool_response) : null,
              model: e.model ?? null,
              source: e.source ?? null,
              reason: e.reason ?? null,
              error: e.error ?? null,
              error_details: e.error_details ?? null,
              last_assistant_message: e.last_assistant_message ?? null,
              agent_id: e.agent_id ?? null,
              agent_type: e.agent_type ?? null,
              transcript_path: e.transcript_path ?? null,
            });
          }
        });

        tx(events);
        console.log(`  Migrated ${events.length} events from JSON to SQLite`);
        migrated = true;
      }
    } catch (err) {
      console.error('  Failed to migrate events.json:', err);
    }
  }

  // Rename old JSON files so migration doesn't run again
  if (migrated) {
    try {
      if (existsSync(SESSIONS_JSON)) renameSync(SESSIONS_JSON, SESSIONS_JSON + '.bak');
      if (existsSync(EVENTS_JSON)) renameSync(EVENTS_JSON, EVENTS_JSON + '.bak');
      console.log('  JSON files renamed to .bak');
    } catch { /* ignore rename errors */ }
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
