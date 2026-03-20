import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { setupTestDb, teardownTestDb } from './helpers.js';
import { ingestRouter } from '../routes/ingest.js';
import { sessionsRouter } from '../routes/sessions.js';
import { statsRouter } from '../routes/stats.js';
import {
  getSessions,
  getSession,
  getEvents,
  getEventsForSession,
  upsertSession,
  appendEvent,
} from '../store.js';

// Minimal HTTP helper — no external test deps needed
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ingest', ingestRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/stats', statsRouter);
  return app;
}

async function request(app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}${path}`;

  try {
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

// ─── Ingest Routes ───────────────────────────────────────────────

describe('routes — POST /api/ingest/hook', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { setupTestDb(); app = createApp(); });
  afterEach(() => teardownTestDb());

  it('returns 400 if session_id is missing', async () => {
    const res = await request(app, 'POST', '/api/ingest/hook', {
      hook_event_name: 'SessionStart',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('returns 400 if hook_event_name is missing', async () => {
    const res = await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
    });
    expect(res.status).toBe(400);
  });

  it('creates session on SessionStart', async () => {
    const res = await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
      model: 'claude-sonnet-4-20250514',
      cwd: '/projects/test',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const session = getSession('s1');
    expect(session).toBeDefined();
    expect(session!.model_id).toBe('claude-sonnet-4-20250514');
    expect(session!.cwd).toBe('/projects/test');
  });

  it('tracks tool usage on PostToolUse', async () => {
    // First create the session
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
      cwd: '/projects/test',
    });

    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/src/app.ts' },
    });

    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
    });

    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/src/app.ts' },
    });

    const session = getSession('s1')!;
    expect(session.tools_used['Read']).toBe(2);
    expect(session.tools_used['Edit']).toBe(1);
    expect(session.files_changed).toContain('/src/app.ts');
  });

  it('records stop reason on Stop', async () => {
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
    });
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'Stop',
      reason: 'completed',
      last_assistant_message: 'Done!',
    });

    const session = getSession('s1')!;
    expect(session.stop_reason).toBe('completed');
    expect(session.last_assistant_message).toBe('Done!');
  });

  it('records error on StopFailure', async () => {
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
    });
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'StopFailure',
      error: 'context_limit',
      last_assistant_message: 'Ran out of context',
    });

    const session = getSession('s1')!;
    expect(session.stop_reason).toBe('error:context_limit');
  });

  it('sets ended_at on SessionEnd', async () => {
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
    });
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionEnd',
      reason: 'user_exit',
    });

    const session = getSession('s1')!;
    expect(session.ended_at).toBeDefined();
    expect(session.end_reason).toBe('user_exit');
  });

  it('stores agent_id and transcript_path from hook data', async () => {
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
      agent_id: 'agent-abc',
      agent_type: 'main',
      transcript_path: '/home/user/.claude/projects/test/s1.jsonl',
    });

    const session = getSession('s1')!;
    expect(session.agent_id).toBe('agent-abc');
    expect(session.agent_type).toBe('main');
    expect(session.transcript_path).toBe('/home/user/.claude/projects/test/s1.jsonl');
  });

  it('appends events to the events table', async () => {
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'SessionStart',
    });
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
    });
    await request(app, 'POST', '/api/ingest/hook', {
      session_id: 's1',
      hook_event_name: 'Stop',
    });

    const events = getEventsForSession('s1');
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.map(e => e.event)).toContain('SessionStart');
    expect(events.map(e => e.event)).toContain('PostToolUse');
    expect(events.map(e => e.event)).toContain('Stop');
  });
});

describe('routes — POST /api/ingest/statusline', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { setupTestDb(); app = createApp(); });
  afterEach(() => teardownTestDb());

  it('returns 400 if session_id is missing', async () => {
    const res = await request(app, 'POST', '/api/ingest/statusline', {
      cost: { total_cost_usd: 1.00 },
    });
    expect(res.status).toBe(400);
  });

  it('upserts session with statusline data', async () => {
    const res = await request(app, 'POST', '/api/ingest/statusline', {
      session_id: 's1',
      cost: {
        total_cost_usd: 0.75,
        total_duration_ms: 45000,
        total_api_duration_ms: 30000,
        total_lines_added: 20,
        total_lines_removed: 5,
      },
      context_window: {
        total_input_tokens: 15000,
        total_output_tokens: 7000,
        context_window_size: 200000,
        used_percentage: 11,
        current_usage: {
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 2000,
        },
      },
      model: {
        id: 'claude-sonnet-4-20250514',
        display_name: 'Claude Sonnet',
      },
      cwd: '/projects/test',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const session = getSession('s1')!;
    expect(session.total_cost_usd).toBe(0.75);
    expect(session.total_input_tokens).toBe(15000);
    expect(session.total_output_tokens).toBe(7000);
    expect(session.cache_read_tokens).toBe(5000);
    expect(session.cache_creation_tokens).toBe(2000);
    expect(session.model_id).toBe('claude-sonnet-4-20250514');
    expect(session.model_name).toBe('Claude Sonnet');
    expect(session.total_lines_added).toBe(20);
    expect(session.context_window_size).toBe(200000);
  });
});

// ─── Sessions Routes ─────────────────────────────────────────────

describe('routes — GET /api/sessions', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { setupTestDb(); app = createApp(); });
  afterEach(() => teardownTestDb());

  it('returns empty list when no sessions', async () => {
    const res = await request(app, 'GET', '/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns sessions sorted by started_at desc', async () => {
    upsertSession('s1', { session_id: 's1', started_at: '2025-03-20T01:00:00Z' });
    upsertSession('s2', { session_id: 's2', started_at: '2025-03-20T03:00:00Z' });
    upsertSession('s3', { session_id: 's3', started_at: '2025-03-20T02:00:00Z' });

    const res = await request(app, 'GET', '/api/sessions');
    expect(res.body.sessions).toHaveLength(3);
    expect(res.body.sessions[0].session_id).toBe('s2');
    expect(res.body.sessions[1].session_id).toBe('s3');
    expect(res.body.sessions[2].session_id).toBe('s1');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      upsertSession(`s${i}`, {
        session_id: `s${i}`,
        started_at: new Date(Date.now() + i * 60000).toISOString(),
      });
    }

    const page1 = await request(app, 'GET', '/api/sessions?page=1&limit=2');
    expect(page1.body.sessions).toHaveLength(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.totalPages).toBe(3);

    const page2 = await request(app, 'GET', '/api/sessions?page=2&limit=2');
    expect(page2.body.sessions).toHaveLength(2);

    const page3 = await request(app, 'GET', '/api/sessions?page=3&limit=2');
    expect(page3.body.sessions).toHaveLength(1);
  });
});

describe('routes — GET /api/sessions/:id', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { setupTestDb(); app = createApp(); });
  afterEach(() => teardownTestDb());

  it('returns 404 for missing session', async () => {
    const res = await request(app, 'GET', '/api/sessions/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns session with events and quality signals', async () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      ended_at: '2025-03-20T01:30:00Z',
      total_cost_usd: 0.50,
      total_output_tokens: 5000,
      total_lines_added: 25,
      total_lines_removed: 5,
    });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:00:01Z', event: 'SessionStart' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:15:00Z', event: 'PostToolUse', tool_name: 'Read' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:29:00Z', event: 'Stop' });

    const res = await request(app, 'GET', '/api/sessions/s1');
    expect(res.status).toBe(200);
    expect(res.body.session.session_id).toBe('s1');
    expect(res.body.events).toHaveLength(3);
    expect(res.body.quality).toBeDefined();
    expect(res.body.quality.completionStatus).toBe('success');
    expect(res.body.quality.toolCalls).toBe(1);
    expect(res.body.quality.linesChanged).toBe(30);
    expect(res.body.quality.costPerLine).toBeCloseTo(0.50 / 30, 5);
  });

  it('quality signals report failure when only StopFailure events', async () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      ended_at: '2025-03-20T01:10:00Z',
    });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:05:00Z', event: 'StopFailure', error: 'context_limit' });

    const res = await request(app, 'GET', '/api/sessions/s1');
    expect(res.body.quality.completionStatus).toBe('failure');
  });
});

// ─── Stats Routes ────────────────────────────────────────────────

describe('routes — GET /api/stats', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { setupTestDb(); app = createApp(); });
  afterEach(() => teardownTestDb());

  it('returns aggregate stats', async () => {
    upsertSession('s1', {
      session_id: 's1',
      model_id: 'sonnet',
      started_at: '2025-03-20T01:00:00Z',
      total_cost_usd: 1.00,
      total_input_tokens: 10000,
      total_output_tokens: 5000,
      tools_used: { Read: 5 },
    });

    const res = await request(app, 'GET', '/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.totalSessions).toBe(1);
    expect(res.body.totalCostUsd).toBe(1.00);
    expect(res.body.modelBreakdown['sonnet']).toBeDefined();
    expect(res.body.toolBreakdown['Read']).toBe(5);
  });
});

describe('routes — GET /api/stats/quality', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { setupTestDb(); app = createApp(); });
  afterEach(() => teardownTestDb());

  it('returns null signals when no sessions', async () => {
    const res = await request(app, 'GET', '/api/stats/quality');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toBe(0);
    expect(res.body.signals).toBeNull();
  });

  it('returns quality signals with sessions', async () => {
    upsertSession('s1', {
      session_id: 's1',
      started_at: '2025-03-20T01:00:00Z',
      ended_at: '2025-03-20T01:30:00Z',
      total_cost_usd: 1.00,
      total_output_tokens: 5000,
      total_lines_added: 50,
      total_lines_removed: 10,
      tools_used: { Read: 5, Edit: 2 },
    });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:10:00Z', event: 'PostToolUse', tool_name: 'Read' });
    appendEvent({ session_id: 's1', timestamp: '2025-03-20T01:20:00Z', event: 'Stop' });

    const res = await request(app, 'GET', '/api/stats/quality');
    expect(res.body.sessions).toBe(1);
    expect(res.body.signals).toBeDefined();
    expect(res.body.signals.completionRate).toBe(1);
    expect(res.body.signals.totalToolCalls).toBe(1);
    expect(res.body.signals.totalLinesChanged).toBe(60);
    expect(res.body.perSession).toHaveLength(1);
  });
});
