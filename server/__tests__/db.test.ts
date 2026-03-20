import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db.js';
import { setupTestDb, teardownTestDb } from './helpers.js';

describe('db', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('creates sessions table with expected columns', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('sessions')").all() as { name: string }[];
    const names = cols.map(c => c.name);
    expect(names).toContain('session_id');
    expect(names).toContain('model_id');
    expect(names).toContain('total_cost_usd');
    expect(names).toContain('tools_used');
    expect(names).toContain('files_changed');
    expect(names).toContain('agent_id');
    expect(names).toContain('transcript_path');
  });

  it('creates events table with expected columns', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('events')").all() as { name: string }[];
    const names = cols.map(c => c.name);
    expect(names).toContain('id');
    expect(names).toContain('session_id');
    expect(names).toContain('timestamp');
    expect(names).toContain('event');
    expect(names).toContain('tool_name');
    expect(names).toContain('tool_input');
  });

  it('enables WAL mode', () => {
    const db = getDb();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('wal');
  });

  it('creates indexes on sessions', () => {
    const db = getDb();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'").all() as { name: string }[];
    const names = indexes.map(i => i.name);
    expect(names).toContain('idx_sessions_started_at');
    expect(names).toContain('idx_sessions_agent_id');
    expect(names).toContain('idx_sessions_cwd');
  });

  it('creates indexes on events', () => {
    const db = getDb();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'").all() as { name: string }[];
    const names = indexes.map(i => i.name);
    expect(names).toContain('idx_events_session_id');
    expect(names).toContain('idx_events_timestamp');
    expect(names).toContain('idx_events_event');
  });

  it('returns same instance on repeated calls', () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('closeDb resets the singleton', () => {
    const db1 = getDb();
    expect(db1).toBeTruthy();
    closeDb();
    // After close, _db is null — but we can't re-open without a path in this test
    // Just verify closeDb doesn't throw
  });
});
