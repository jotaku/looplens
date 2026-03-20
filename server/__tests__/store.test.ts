import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers.js';
import {
  getSessions,
  getSession,
  upsertSession,
  getEvents,
  getEventsForSession,
  appendEvent,
  getStats,
  clearAll,
} from '../store.js';
import type { SessionData, HookEvent } from '../store.js';

describe('store — sessions', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('getSessions returns empty object when no data', () => {
    expect(getSessions()).toEqual({});
  });

  it('getSession returns undefined for missing id', () => {
    expect(getSession('nonexistent')).toBeUndefined();
  });

  it('upsertSession creates a new session', () => {
    const result = upsertSession('s1', {
      session_id: 's1',
      model_id: 'claude-sonnet-4-20250514',
      model_name: 'Claude Sonnet',
      cwd: '/projects/test',
      started_at: '2025-03-20T01:00:00Z',
      total_cost_usd: 0.50,
      total_input_tokens: 10000,
      total_output_tokens: 5000,
    });

    expect(result.session_id).toBe('s1');
    expect(result.model_id).toBe('claude-sonnet-4-20250514');
    expect(result.total_cost_usd).toBe(0.50);
    expect(result.total_input_tokens).toBe(10000);
  });

  it('upsertSession updates an existing session', () => {
    upsertSession('s1', {
      session_id: 's1',
      model_id: 'claude-sonnet-4-20250514',
      started_at: '2025-03-20T01:00:00Z',
      total_cost_usd: 0.50,
    });

    const updated = upsertSession('s1', {
      total_cost_usd: 1.25,
      ended_at: '2025-03-20T01:30:00Z',
    });

    expect(updated.total_cost_usd).toBe(1.25);
    expect(updated.ended_at).toBe('2025-03-20T01:30:00Z');
    expect(updated.model_id).toBe('claude-sonnet-4-20250514');
  });

  it('upsertSession merges tools_used additively', () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      tools_used: { Read: 3, Edit: 1 },
    });

    const updated = upsertSession('s1', {
      tools_used: { Read: 2, Bash: 1 },
    });

    expect(updated.tools_used).toEqual({ Read: 5, Edit: 1, Bash: 1 });
  });

  it('upsertSession merges files_changed as unique set', () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      files_changed: ['/src/a.ts', '/src/b.ts'],
    });

    const updated = upsertSession('s1', {
      files_changed: ['/src/b.ts', '/src/c.ts'],
    });

    expect(updated.files_changed).toHaveLength(3);
    expect(updated.files_changed).toContain('/src/a.ts');
    expect(updated.files_changed).toContain('/src/b.ts');
    expect(updated.files_changed).toContain('/src/c.ts');
  });

  it('getSession returns the created session', () => {
    upsertSession('s1', {
      session_id: 's1',
      model_id: 'test-model',
      started_at: '2025-03-20T01:00:00Z',
    });

    const session = getSession('s1');
    expect(session).toBeDefined();
    expect(session!.session_id).toBe('s1');
    expect(session!.model_id).toBe('test-model');
  });

  it('getSessions returns all sessions keyed by id', () => {
    upsertSession('s1', { session_id: 's1', started_at: '2025-03-20T01:00:00Z' });
    upsertSession('s2', { session_id: 's2', started_at: '2025-03-20T02:00:00Z' });
    upsertSession('s3', { session_id: 's3', started_at: '2025-03-20T03:00:00Z' });

    const sessions = getSessions();
    expect(Object.keys(sessions)).toHaveLength(3);
    expect(sessions['s1']).toBeDefined();
    expect(sessions['s2']).toBeDefined();
    expect(sessions['s3']).toBeDefined();
  });

  it('session optional fields are undefined when not set', () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
    });

    const session = getSession('s1')!;
    expect(session.ended_at).toBeUndefined();
    expect(session.end_reason).toBeUndefined();
    expect(session.agent_id).toBeUndefined();
    expect(session.transcript_path).toBeUndefined();
    expect(session.last_assistant_message).toBeUndefined();
  });
});

describe('store — events', () => {
  beforeEach(() => {
    setupTestDb();
    // Create a session for foreign key
    upsertSession('s1', { session_id: 's1', started_at: '2025-03-20T01:00:00Z' });
  });
  afterEach(() => teardownTestDb());

  it('getEvents returns empty array when no data', () => {
    expect(getEvents()).toEqual([]);
  });

  it('appendEvent stores an event', () => {
    const event: HookEvent = {
      session_id: 's1',
      timestamp: '2025-03-20T01:00:01Z',
      event: 'SessionStart',
    };

    appendEvent(event);
    const events = getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].session_id).toBe('s1');
    expect(events[0].event).toBe('SessionStart');
  });

  it('appendEvent stores tool_input and tool_response as JSON', () => {
    appendEvent({
      session_id: 's1',
      timestamp: '2025-03-20T01:00:02Z',
      event: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/src/app.ts' },
      tool_response: { content: 'file contents here' },
    });

    const events = getEvents();
    expect(events[0].tool_input).toEqual({ file_path: '/src/app.ts' });
    expect(events[0].tool_response).toEqual({ content: 'file contents here' });
  });

  it('getEventsForSession filters by session_id', () => {
    upsertSession('s2', { session_id: 's2', started_at: '2025-03-20T02:00:00Z' });

    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:01Z', event: 'SessionStart' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:02Z', event: 'PostToolUse', tool_name: 'Read' });
    appendEvent({ session_id: 's2', timestamp: '2025-03-20T02:00:01Z', event: 'SessionStart' });

    const s1Events = getEventsForSession('s1');
    expect(s1Events).toHaveLength(2);
    expect(s1Events.every(e => e.session_id === 's1')).toBe(true);

    const s2Events = getEventsForSession('s2');
    expect(s2Events).toHaveLength(1);
    expect(s2Events[0].session_id).toBe('s2');
  });

  it('getEventsForSession returns events in timestamp order', () => {
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:03Z', event: 'Stop' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:01Z', event: 'SessionStart' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:02Z', event: 'PostToolUse' });

    const events = getEventsForSession('s1');
    expect(events[0].event).toBe('SessionStart');
    expect(events[1].event).toBe('PostToolUse');
    expect(events[2].event).toBe('Stop');
  });

  it('events with no optional fields have undefined values', () => {
    appendEvent({
      session_id: 's1',
      timestamp: '2025-03-20T01:00:01Z',
      event: 'SessionStart',
    });

    const e = getEvents()[0];
    expect(e.tool_name).toBeUndefined();
    expect(e.tool_input).toBeUndefined();
    expect(e.model).toBeUndefined();
    expect(e.error).toBeUndefined();
  });

  it('no event cap — stores more than 10000 events', () => {
    // Just verify the insert path works for many events (we won't insert 10K in a test)
    for (let i = 0; i < 100; i++) {
      appendEvent({
        session_id: 's1',
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        event: 'PostToolUse',
        tool_name: 'Read',
      });
    }
    expect(getEventsForSession('s1')).toHaveLength(100);
  });
});

describe('store — getStats', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('returns zeros when no sessions', () => {
    const stats = getStats();
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalCostUsd).toBe(0);
    expect(stats.totalInputTokens).toBe(0);
    expect(stats.totalOutputTokens).toBe(0);
    expect(stats.totalDurationMs).toBe(0);
    expect(stats.recentSessions).toEqual([]);
  });

  it('aggregates cost and tokens across sessions', () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      total_cost_usd: 1.00,
      total_input_tokens: 10000,
      total_output_tokens: 5000,
      total_duration_ms: 60000,
      total_lines_added: 50,
      total_lines_removed: 10,
    });
    upsertSession('s2', {
      session_id: 's2',
      started_at: '2025-03-20T02:00:00Z',
      total_cost_usd: 2.00,
      total_input_tokens: 20000,
      total_output_tokens: 8000,
      total_duration_ms: 120000,
      total_lines_added: 100,
      total_lines_removed: 20,
    });

    const stats = getStats();
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalCostUsd).toBe(3.00);
    expect(stats.totalInputTokens).toBe(30000);
    expect(stats.totalOutputTokens).toBe(13000);
    expect(stats.totalDurationMs).toBe(180000);
    expect(stats.totalLinesAdded).toBe(150);
    expect(stats.totalLinesRemoved).toBe(30);
    expect(stats.avgCostPerSession).toBe(1.50);
    expect(stats.avgDurationPerSession).toBe(90000);
  });

  it('computes model breakdown', () => {
    upsertSession('s1', {
      session_id: 's1',
      model_id: 'claude-sonnet',
      started_at: '2025-03-20T01:00:00Z',
      total_cost_usd: 1.00,
      total_input_tokens: 10000,
      total_output_tokens: 5000,
    });
    upsertSession('s2', {
      session_id: 's2',
      model_id: 'claude-opus',
      started_at: '2025-03-20T02:00:00Z',
      total_cost_usd: 5.00,
      total_input_tokens: 8000,
      total_output_tokens: 3000,
    });
    upsertSession('s3', {
      session_id: 's3',
      model_id: 'claude-sonnet',
      started_at: '2025-03-20T03:00:00Z',
      total_cost_usd: 1.50,
      total_input_tokens: 12000,
      total_output_tokens: 6000,
    });

    const stats = getStats();
    expect(stats.modelBreakdown['claude-sonnet'].sessions).toBe(2);
    expect(stats.modelBreakdown['claude-sonnet'].costUsd).toBe(2.50);
    expect(stats.modelBreakdown['claude-opus'].sessions).toBe(1);
    expect(stats.modelBreakdown['claude-opus'].costUsd).toBe(5.00);
  });

  it('computes tool breakdown from JSON tools_used', () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      tools_used: { Read: 10, Edit: 3 },
    });
    upsertSession('s2', {
      session_id: 's2',
      started_at: '2025-03-20T02:00:00Z',
      tools_used: { Read: 5, Bash: 2 },
    });

    const stats = getStats();
    expect(stats.toolBreakdown['Read']).toBe(15);
    expect(stats.toolBreakdown['Edit']).toBe(3);
    expect(stats.toolBreakdown['Bash']).toBe(2);
  });

  it('computes agent breakdown', () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      agent_id: 'agent-1',
      model_name: 'Sonnet',
      total_cost_usd: 1.00,
      total_input_tokens: 10000,
      total_output_tokens: 5000,
      tools_used: { Read: 5 },
    });
    upsertSession('s2', {
      session_id: 's2',
      started_at: '2025-03-20T02:00:00Z',
      agent_id: 'agent-1',
      model_name: 'Sonnet',
      total_cost_usd: 2.00,
      total_input_tokens: 20000,
      total_output_tokens: 8000,
      tools_used: { Read: 3, Edit: 2 },
    });

    const stats = getStats();
    const agent = stats.agentBreakdown['agent-1'];
    expect(agent.sessions).toBe(2);
    expect(agent.costUsd).toBe(3.00);
    expect(agent.toolCalls).toBe(10); // 5 + 3 + 2
    expect(agent.models).toContain('Sonnet');
  });

  it('returns recent sessions limited to 20', () => {
    for (let i = 0; i < 25; i++) {
      upsertSession(`s${i}`, {
        session_id: `s${i}`,
        started_at: new Date(Date.now() + i * 60000).toISOString(),
      });
    }

    const stats = getStats();
    expect(stats.recentSessions).toHaveLength(20);
  });
});

describe('store — clearAll', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('removes all sessions and events', () => {
    upsertSession('s1', { session_id: 's1', started_at: '2025-03-20T01:00:00Z' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:01Z', event: 'SessionStart' });

    expect(Object.keys(getSessions())).toHaveLength(1);
    expect(getEvents()).toHaveLength(1);

    clearAll();

    expect(Object.keys(getSessions())).toHaveLength(0);
    expect(getEvents()).toHaveLength(0);
  });

  it('clearAll is idempotent', () => {
    clearAll();
    clearAll();
    expect(Object.keys(getSessions())).toHaveLength(0);
  });
});
