const BASE = '';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function getStats() {
  return fetchJSON<StatsResponse>('/api/stats');
}

export function getSessions(page = 1, limit = 50) {
  return fetchJSON<SessionsResponse>(`/api/sessions?page=${page}&limit=${limit}`);
}

export function getSession(id: string) {
  return fetchJSON<SessionDetailResponse>(`/api/sessions/${id}`);
}

export function getCommits(page = 1, limit = 50) {
  return fetchJSON<CommitsResponse>(`/api/commits?page=${page}&limit=${limit}`);
}

export function resetData() {
  return postJSON('/api/reset');
}

export function getTranscript(sessionId: string) {
  return fetchJSON<TranscriptResponse>(`/api/sessions/${sessionId}/transcript`);
}

export function getQuality() {
  return fetchJSON<QualityResponse>('/api/stats/quality');
}

// Types

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
}

export interface StatsResponse {
  totalSessions: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  avgCostPerSession: number;
  avgDurationPerSession: number;
  modelBreakdown: Record<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number }>;
  toolBreakdown: Record<string, number>;
  agentBreakdown: Record<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number; toolCalls: number; models: string[] }>;
  recentSessions: SessionData[];
}

export interface SessionsResponse {
  sessions: SessionData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QualitySignals {
  completionStatus: 'success' | 'failure' | 'unknown';
  stopFailures: number;
  totalStops: number;
  retryRate: number;
  toolCalls: number;
  toolErrors: number;
  toolErrorRate: number;
  linesChanged: number;
  costPerLine: number | null;
  tokensPerLine: number | null;
  turnCount: number;
  hasCommit: boolean;
}

export interface SessionDetailResponse {
  session: SessionData;
  events: HookEvent[];
  quality: QualitySignals;
}

export interface QualitySessionRow {
  sessionId: string;
  model: string;
  completionStatus: string;
  costPerLine: number | null;
  tokensPerLine: number | null;
  toolCalls: number;
  toolErrors: number;
  linesChanged: number;
  cost: number;
  turns: number;
}

export interface QualityResponse {
  sessions: number;
  signals: {
    completionRate: number;
    failureRate: number;
    toolErrorRate: number;
    avgCostPerLine: number | null;
    avgTokensPerLine: number | null;
    totalLinesChanged: number;
    totalToolCalls: number;
    totalToolErrors: number;
    sessionsWithOutput: number;
    avgTurnsPerSession: number;
  } | null;
  perSession: QualitySessionRow[];
}

export interface TranscriptMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface TranscriptResponse {
  messages: TranscriptMessage[];
  source: string | null;
}

export interface CommitData {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
  repo: string;
  repoPath: string;
  agentId?: string;
  agentModel?: string;
  agentProvider?: string;
  agentCost?: string;
  agentTokens?: string;
  agentConfidence?: string;
  sessionId?: string;
  sessionCostUsd?: number;
  sessionInputTokens?: number;
  sessionOutputTokens?: number;
  sessionModel?: string;
  sessionAgentId?: string;
  sessionDurationMs?: number;
  sessionTaskLabel?: string;
  isAgentCommit: boolean;
}

export interface CommitsResponse {
  commits: CommitData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  agentBreakdown: Record<string, { commits: number; cost: number; tokens: number; model: string }>;
  repos: { path: string; name: string }[];
}
