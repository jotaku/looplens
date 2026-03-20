import { getDb } from './db.js';

export interface SessionData {
  session_id: string;
  model_id: string;
  model_name: string;
  cwd: string;
  started_at: string;
  ended_at?: string;
  end_reason?: string;
  total_cost_usd: number;
  total_duration_ms: number;
  total_api_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_lines_added: number;
  total_lines_removed: number;
  context_window_size: number;
  used_percentage: number;
  tools_used: Record<string, number>;
  files_changed: string[];
  last_assistant_message?: string;
  version?: string;
  stop_reason?: string;
  agent_id?: string;
  agent_type?: string;
  transcript_path?: string;
  task_label?: string;
}

export interface HookEvent {
  session_id: string;
  timestamp: string;
  event: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  model?: string;
  source?: string;
  reason?: string;
  error?: string;
  error_details?: string;
  last_assistant_message?: string;
  agent_id?: string;
  agent_type?: string;
  transcript_path?: string;
}

interface SessionRow {
  session_id: string;
  model_id: string;
  model_name: string;
  cwd: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  total_cost_usd: number;
  total_duration_ms: number;
  total_api_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_lines_added: number;
  total_lines_removed: number;
  context_window_size: number;
  used_percentage: number;
  tools_used: string;
  files_changed: string;
  last_assistant_message: string | null;
  version: string | null;
  stop_reason: string | null;
  agent_id: string | null;
  agent_type: string | null;
  transcript_path: string | null;
  task_label: string | null;
}

interface EventRow {
  id: number;
  session_id: string;
  timestamp: string;
  event: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_response: string | null;
  model: string | null;
  source: string | null;
  reason: string | null;
  error: string | null;
  error_details: string | null;
  last_assistant_message: string | null;
  agent_id: string | null;
  agent_type: string | null;
  transcript_path: string | null;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToSession(row: SessionRow): SessionData {
  return {
    ...row,
    ended_at: row.ended_at ?? undefined,
    end_reason: row.end_reason ?? undefined,
    tools_used: safeJsonParse<Record<string, number>>(row.tools_used, {}),
    files_changed: safeJsonParse<string[]>(row.files_changed, []),
    last_assistant_message: row.last_assistant_message ?? undefined,
    version: row.version ?? undefined,
    stop_reason: row.stop_reason ?? undefined,
    agent_id: row.agent_id ?? undefined,
    agent_type: row.agent_type ?? undefined,
    transcript_path: row.transcript_path ?? undefined,
    task_label: row.task_label ?? undefined,
  };
}

function rowToEvent(row: EventRow): HookEvent {
  return {
    session_id: row.session_id,
    timestamp: row.timestamp,
    event: row.event,
    tool_name: row.tool_name ?? undefined,
    tool_input: row.tool_input ? JSON.parse(row.tool_input) : undefined,
    tool_response: row.tool_response ? JSON.parse(row.tool_response) : undefined,
    model: row.model ?? undefined,
    source: row.source ?? undefined,
    reason: row.reason ?? undefined,
    error: row.error ?? undefined,
    error_details: row.error_details ?? undefined,
    last_assistant_message: row.last_assistant_message ?? undefined,
    agent_id: row.agent_id ?? undefined,
    agent_type: row.agent_type ?? undefined,
    transcript_path: row.transcript_path ?? undefined,
  };
}

export function getSessions(): Record<string, SessionData> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as SessionRow[];
  const result: Record<string, SessionData> = {};
  for (const row of rows) {
    result[row.session_id] = rowToSession(row);
  }
  return result;
}

export function getSession(id: string): SessionData | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}

export function upsertSession(id: string, update: Partial<SessionData>): SessionData {
  const db = getDb();

  // Get existing session or create defaults
  const existingRow = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(id) as SessionRow | undefined;
  const existing: SessionData = existingRow ? rowToSession(existingRow) : {
    session_id: id,
    model_id: '',
    model_name: '',
    cwd: '',
    started_at: new Date().toISOString(),
    total_cost_usd: 0,
    total_duration_ms: 0,
    total_api_duration_ms: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_lines_added: 0,
    total_lines_removed: 0,
    context_window_size: 0,
    used_percentage: 0,
    tools_used: {},
    files_changed: [],
  };

  const merged = { ...existing, ...update };

  // Merge tools_used additively
  if (update.tools_used) {
    merged.tools_used = { ...existing.tools_used };
    for (const [tool, count] of Object.entries(update.tools_used)) {
      merged.tools_used[tool] = (merged.tools_used[tool] ?? 0) + count;
    }
  }

  // Merge files_changed as unique set
  if (update.files_changed) {
    const set = new Set([...(existing.files_changed ?? []), ...update.files_changed]);
    merged.files_changed = [...set];
  }

  db.prepare(`
    INSERT INTO sessions (
      session_id, model_id, model_name, cwd, started_at, ended_at, end_reason,
      total_cost_usd, total_duration_ms, total_api_duration_ms,
      total_input_tokens, total_output_tokens, cache_read_tokens, cache_creation_tokens,
      total_lines_added, total_lines_removed, context_window_size, used_percentage,
      tools_used, files_changed, last_assistant_message, version, stop_reason,
      agent_id, agent_type, transcript_path, task_label
    ) VALUES (
      @session_id, @model_id, @model_name, @cwd, @started_at, @ended_at, @end_reason,
      @total_cost_usd, @total_duration_ms, @total_api_duration_ms,
      @total_input_tokens, @total_output_tokens, @cache_read_tokens, @cache_creation_tokens,
      @total_lines_added, @total_lines_removed, @context_window_size, @used_percentage,
      @tools_used, @files_changed, @last_assistant_message, @version, @stop_reason,
      @agent_id, @agent_type, @transcript_path, @task_label
    ) ON CONFLICT(session_id) DO UPDATE SET
      model_id = @model_id, model_name = @model_name, cwd = @cwd,
      started_at = @started_at, ended_at = @ended_at, end_reason = @end_reason,
      total_cost_usd = @total_cost_usd, total_duration_ms = @total_duration_ms,
      total_api_duration_ms = @total_api_duration_ms,
      total_input_tokens = @total_input_tokens, total_output_tokens = @total_output_tokens,
      cache_read_tokens = @cache_read_tokens, cache_creation_tokens = @cache_creation_tokens,
      total_lines_added = @total_lines_added, total_lines_removed = @total_lines_removed,
      context_window_size = @context_window_size, used_percentage = @used_percentage,
      tools_used = @tools_used, files_changed = @files_changed,
      last_assistant_message = @last_assistant_message, version = @version,
      stop_reason = @stop_reason, agent_id = @agent_id, agent_type = @agent_type,
      transcript_path = @transcript_path, task_label = @task_label
  `).run({
    session_id: merged.session_id,
    model_id: merged.model_id,
    model_name: merged.model_name,
    cwd: merged.cwd,
    started_at: merged.started_at,
    ended_at: merged.ended_at ?? null,
    end_reason: merged.end_reason ?? null,
    total_cost_usd: merged.total_cost_usd,
    total_duration_ms: merged.total_duration_ms,
    total_api_duration_ms: merged.total_api_duration_ms,
    total_input_tokens: merged.total_input_tokens,
    total_output_tokens: merged.total_output_tokens,
    cache_read_tokens: merged.cache_read_tokens,
    cache_creation_tokens: merged.cache_creation_tokens,
    total_lines_added: merged.total_lines_added,
    total_lines_removed: merged.total_lines_removed,
    context_window_size: merged.context_window_size,
    used_percentage: merged.used_percentage,
    tools_used: JSON.stringify(merged.tools_used),
    files_changed: JSON.stringify(merged.files_changed),
    last_assistant_message: merged.last_assistant_message ?? null,
    version: merged.version ?? null,
    stop_reason: merged.stop_reason ?? null,
    agent_id: merged.agent_id ?? null,
    agent_type: merged.agent_type ?? null,
    transcript_path: merged.transcript_path ?? null,
    task_label: merged.task_label ?? null,
  });

  return merged;
}

export function getEvents(): HookEvent[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM events ORDER BY timestamp ASC').all() as EventRow[];
  return rows.map(rowToEvent);
}

export function getEventsForSession(sessionId: string): HookEvent[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId) as EventRow[];
  return rows.map(rowToEvent);
}

export function appendEvent(event: HookEvent): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO events (
      session_id, timestamp, event, tool_name, tool_input, tool_response,
      model, source, reason, error, error_details, last_assistant_message,
      agent_id, agent_type, transcript_path
    ) VALUES (
      @session_id, @timestamp, @event, @tool_name, @tool_input, @tool_response,
      @model, @source, @reason, @error, @error_details, @last_assistant_message,
      @agent_id, @agent_type, @transcript_path
    )
  `).run({
    session_id: event.session_id,
    timestamp: event.timestamp,
    event: event.event,
    tool_name: event.tool_name ?? null,
    tool_input: event.tool_input ? JSON.stringify(event.tool_input) : null,
    tool_response: event.tool_response ? JSON.stringify(event.tool_response) : null,
    model: event.model ?? null,
    source: event.source ?? null,
    reason: event.reason ?? null,
    error: event.error ?? null,
    error_details: event.error_details ?? null,
    last_assistant_message: event.last_assistant_message ?? null,
    agent_id: event.agent_id ?? null,
    agent_type: event.agent_type ?? null,
    transcript_path: event.transcript_path ?? null,
  });
}

interface AggregateKpis {
  totalSessions: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}

function getAggregateKpis(): AggregateKpis {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) as totalSessions,
      COALESCE(SUM(total_cost_usd), 0) as totalCostUsd,
      COALESCE(SUM(total_input_tokens), 0) as totalInputTokens,
      COALESCE(SUM(total_output_tokens), 0) as totalOutputTokens,
      COALESCE(SUM(total_duration_ms), 0) as totalDurationMs,
      COALESCE(SUM(total_lines_added), 0) as totalLinesAdded,
      COALESCE(SUM(total_lines_removed), 0) as totalLinesRemoved
    FROM sessions
  `).get() as AggregateKpis;
}

function getModelBreakdown(): Record<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number }> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(model_id, ''), NULLIF(model_name, ''), 'unknown') as model_key,
      COUNT(*) as sessions,
      COALESCE(SUM(total_cost_usd), 0) as costUsd,
      COALESCE(SUM(total_input_tokens), 0) as inputTokens,
      COALESCE(SUM(total_output_tokens), 0) as outputTokens
    FROM sessions
    GROUP BY model_key
  `).all() as { model_key: string; sessions: number; costUsd: number; inputTokens: number; outputTokens: number }[];

  const result: Record<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number }> = {};
  for (const row of rows) {
    result[row.model_key] = { sessions: row.sessions, costUsd: row.costUsd, inputTokens: row.inputTokens, outputTokens: row.outputTokens };
  }
  return result;
}

function getToolBreakdown(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare('SELECT tools_used FROM sessions').all() as { tools_used: string }[];
  const result: Record<string, number> = {};
  for (const row of rows) {
    const tools = safeJsonParse<Record<string, number>>(row.tools_used, {});
    for (const [tool, count] of Object.entries(tools)) {
      result[tool] = (result[tool] ?? 0) + count;
    }
  }
  return result;
}

function getAgentBreakdown(): Record<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number; toolCalls: number; models: string[] }> {
  const db = getDb();

  const agentRows = db.prepare(`
    SELECT
      COALESCE(NULLIF(agent_id, ''), 'unknown') as agent_key,
      COUNT(*) as sessions,
      COALESCE(SUM(total_cost_usd), 0) as costUsd,
      COALESCE(SUM(total_input_tokens), 0) as inputTokens,
      COALESCE(SUM(total_output_tokens), 0) as outputTokens,
      GROUP_CONCAT(DISTINCT COALESCE(NULLIF(model_name, ''), NULLIF(model_id, ''), 'unknown')) as models_csv
    FROM sessions
    GROUP BY agent_key
  `).all() as { agent_key: string; sessions: number; costUsd: number; inputTokens: number; outputTokens: number; models_csv: string }[];

  // Compute tool calls per agent from individual rows
  const agentToolCalls = new Map<string, number>();
  const toolRows = db.prepare(`
    SELECT COALESCE(NULLIF(agent_id, ''), 'unknown') as agent_key, tools_used
    FROM sessions
  `).all() as { agent_key: string; tools_used: string }[];
  for (const row of toolRows) {
    const tools = safeJsonParse<Record<string, number>>(row.tools_used, {});
    const count = Object.values(tools).reduce((a, b) => a + b, 0);
    agentToolCalls.set(row.agent_key, (agentToolCalls.get(row.agent_key) ?? 0) + count);
  }

  const result: Record<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number; toolCalls: number; models: string[] }> = {};
  for (const row of agentRows) {
    result[row.agent_key] = {
      sessions: row.sessions,
      costUsd: row.costUsd,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      toolCalls: agentToolCalls.get(row.agent_key) ?? 0,
      models: row.models_csv ? row.models_csv.split(',') : [],
    };
  }
  return result;
}

function getRecentSessions(limit = 20): SessionData[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?').all(limit) as SessionRow[];
  return rows.map(rowToSession);
}

export function getStats() {
  const agg = getAggregateKpis();
  const n = agg.totalSessions || 1;

  return {
    ...agg,
    avgCostPerSession: agg.totalCostUsd / n,
    avgDurationPerSession: agg.totalDurationMs / n,
    modelBreakdown: getModelBreakdown(),
    toolBreakdown: getToolBreakdown(),
    agentBreakdown: getAgentBreakdown(),
    recentSessions: getRecentSessions(),
  };
}

export function clearAll(): void {
  const db = getDb();
  db.exec('DELETE FROM events');
  db.exec('DELETE FROM sessions');
}
