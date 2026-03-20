import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { getSession, getEventsForSession, upsertSession } from './store.js';
import type { SessionData } from './store.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Approximate pricing per million tokens (as of early 2025)
// Source: https://docs.anthropic.com/en/docs/about-claude/models
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Opus
  'claude-opus-4':        { input: 15,  output: 75,  cacheRead: 1.5,  cacheWrite: 18.75 },
  // Sonnet
  'claude-sonnet-4':      { input: 3,   output: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  'claude-3-5-sonnet':    { input: 3,   output: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  'claude-3-7-sonnet':    { input: 3,   output: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  // Haiku
  'claude-haiku-4-5':     { input: 0.8, output: 4,   cacheRead: 0.08, cacheWrite: 1 },
  'claude-3-5-haiku':     { input: 0.8, output: 4,   cacheRead: 0.08, cacheWrite: 1 },
  'claude-3-haiku':       { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-opus-4': 'Opus 4',
  'claude-sonnet-4': 'Sonnet 4',
  'claude-3-7-sonnet': 'Sonnet 3.7',
  'claude-3-5-sonnet': 'Sonnet 3.5',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-3-5-haiku': 'Haiku 3.5',
  'claude-3-haiku': 'Haiku 3',
};

export function deriveModelDisplayName(modelId: string): string {
  for (const [prefix, name] of Object.entries(MODEL_DISPLAY_NAMES)) {
    if (modelId.startsWith(prefix)) return name;
  }
  // Fallback: strip date suffix, humanize
  return modelId
    .replace(/-\d{8}$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function lookupPricing(modelId: string): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  // Try exact match first, then prefix match
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return pricing;
  }
  // Default fallback: Sonnet pricing
  return { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
}

export interface TranscriptStats {
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  startedAt: string | null;
  endedAt: string | null;
  turnCount: number;
}

interface TranscriptMessage {
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface TranscriptEntry {
  type: string;
  timestamp?: string;
  sessionId?: string;
  message?: TranscriptMessage & {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
}

/**
 * Extract plain text from a transcript message's content field.
 * Handles both string and content-block array formats.
 */
export function extractMessageText(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text' && b.text).map(b => b.text).join('\n');
  }
  return '';
}

/** Returns true if the text is a real user prompt (not a system/command message). */
export function isUserPrompt(text: string): boolean {
  return !!text && !text.startsWith('<local-command') && !text.startsWith('<command-name>');
}

/**
 * Count user turns (real prompts) in a transcript file.
 */
export function countUserTurns(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  let turns = 0;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry: TranscriptEntry = JSON.parse(line);
        if (entry.type !== 'user' || entry.message?.role !== 'user') continue;
        const text = extractMessageText(entry.message.content);
        if (isUserPrompt(text)) turns++;
      } catch { /* skip malformed */ }
    }
  } catch { /* ignore */ }
  return turns;
}

/**
 * Parse a transcript JSONL file and extract aggregate stats.
 * Works for all Claude Code clients (terminal, app, VS Code).
 */
export function parseTranscriptStats(filePath: string): TranscriptStats | null {
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());

    let model = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let firstTimestamp: string | null = null;
    let lastTimestamp: string | null = null;
    let turnCount = 0;

    // Track which message IDs we've already counted (assistant messages
    // appear multiple times in the transcript — once per content block).
    // Only count usage from the LAST entry per message ID.
    const usageByMsgId = new Map<string, TranscriptMessage['usage']>();
    const modelByMsgId = new Map<string, string>();

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);

        // Track timestamps
        if (entry.timestamp) {
          if (!firstTimestamp) firstTimestamp = entry.timestamp;
          lastTimestamp = entry.timestamp;
        }

        // Count user turns
        if (entry.type === 'user' && entry.message?.role === 'user') {
          const text = extractMessageText(entry.message.content);
          if (isUserPrompt(text)) turnCount++;
        }

        // Collect assistant message usage (last entry per message ID wins)
        if (entry.type === 'assistant' && entry.message) {
          const msg = entry.message as TranscriptMessage & { id?: string };
          const msgId = msg.id ?? '';
          if (msg.usage) {
            usageByMsgId.set(msgId, msg.usage);
          }
          if (msg.model) {
            modelByMsgId.set(msgId, msg.model);
          }
        }
      } catch { /* skip malformed lines */ }
    }

    // Aggregate usage from deduplicated messages
    for (const [msgId, usage] of usageByMsgId) {
      if (!usage) continue;
      totalInputTokens += usage.input_tokens ?? 0;
      totalOutputTokens += usage.output_tokens ?? 0;
      cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;

      // Use the model from the last message
      const m = modelByMsgId.get(msgId);
      if (m) model = m;
    }

    // Calculate duration
    let durationMs = 0;
    if (firstTimestamp && lastTimestamp) {
      durationMs = new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime();
    }

    // Estimate cost
    const pricing = lookupPricing(model);
    const estimatedCostUsd =
      (totalInputTokens / 1_000_000) * pricing.input +
      (totalOutputTokens / 1_000_000) * pricing.output +
      (cacheReadTokens / 1_000_000) * pricing.cacheRead +
      (cacheCreationTokens / 1_000_000) * pricing.cacheWrite;

    return {
      model,
      totalInputTokens,
      totalOutputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      estimatedCostUsd,
      durationMs,
      startedAt: firstTimestamp,
      endedAt: lastTimestamp,
      turnCount,
    };
  } catch {
    return null;
  }
}

/**
 * Find the transcript file for a given session ID.
 * Checks the stored path first, then scans Claude's projects directory.
 */
export function findTranscript(sessionId: string, cwd?: string, storedPath?: string): string | null {
  // Try stored path first
  if (storedPath && existsSync(storedPath)) return storedPath;

  const claudeDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(claudeDir)) return null;

  // If we have the cwd, compute the expected folder name (/ → -)
  if (cwd) {
    const encoded = cwd.replace(/\//g, '-');
    const candidate = join(claudeDir, encoded, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }

  // Fallback: scan all project dirs for the session file
  try {
    for (const dir of readdirSync(claudeDir)) {
      const candidate = join(claudeDir, dir, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Extract a short task label from the first user prompt in a transcript.
 * Returns a truncated version of the prompt suitable for display.
 */
export function extractTaskLabel(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry: TranscriptEntry = JSON.parse(line);
        if (entry.type !== 'user' || entry.message?.role !== 'user') continue;

        let text = extractMessageText(entry.message.content);
        if (!isUserPrompt(text)) continue;

        // Clean up: remove leading prompt chars, trim whitespace
        text = text.replace(/^[❯>$#\s]+/, '').trim();
        if (!text) continue;

        // Truncate to a reasonable label length
        const MAX_LEN = 80;
        if (text.length > MAX_LEN) {
          return text.slice(0, MAX_LEN).replace(/\s+\S*$/, '') + '…';
        }
        return text;
      } catch { /* skip malformed */ }
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Parse a transcript JSONL file and extract user/assistant conversation messages.
 */
export function parseTranscriptPrompts(filePath: string): { role: string; content: string; timestamp: string }[] {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const prompts: { role: string; content: string; timestamp: string }[] = [];

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry: TranscriptEntry = JSON.parse(line);
        if (entry.type === 'user' && entry.message?.role === 'user') {
          const content = extractMessageText(entry.message.content);
          if (isUserPrompt(content)) {
            prompts.push({ role: 'user', content, timestamp: entry.timestamp ?? '' });
          }
        } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
          const content = extractMessageText(entry.message.content);
          if (content) {
            prompts.push({ role: 'assistant', content, timestamp: entry.timestamp ?? '' });
          }
        }
      } catch { /* skip malformed lines */ }
    }

    return prompts;
  } catch {
    return [];
  }
}

/**
 * Parse the transcript file for a session and backfill model, tokens, cost, duration, task label.
 * Only updates fields that are currently empty/zero (doesn't overwrite statusline data).
 */
export function enrichSessionFromTranscript(sessionId: string): void {
  try {
    const session = getSession(sessionId);
    if (!session) return;

    const transcriptPath = findTranscript(sessionId, session.cwd, session.transcript_path);
    if (!transcriptPath) return;

    const update: Record<string, unknown> = {};

    // Backfill cwd from files_changed if empty (Claude Code app may skip SessionStart)
    if (!session.cwd && session.files_changed?.length) {
      // Use the directory of the first changed file — findGitRoot in commits.ts
      // will resolve this to the correct repo root for commit correlation.
      const dir = session.files_changed[0].replace(/\/[^/]+$/, '');
      if (dir && dir !== '.') {
        update.cwd = dir;
      }
    }

    // Always try to extract task_label if missing
    if (!session.task_label) {
      const label = extractTaskLabel(transcriptPath);
      if (label) update.task_label = label;
    }

    // Always prefer hook-event timestamps for duration — transcript files
    // can span multiple conversations and produce wildly wrong durations.
    if (session.started_at && session.ended_at) {
      const computed = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
      if (computed > 0 && computed !== session.total_duration_ms) {
        update.total_duration_ms = computed;
      }
    }

    // Skip token enrichment if session already has token data (e.g. from statusline)
    if (!(session.total_input_tokens > 0 && session.total_output_tokens > 0)) {
      const stats = parseTranscriptStats(transcriptPath);
      if (stats) {
        // Only fill in what's missing
        if (!session.model_id && stats.model) {
          update.model_id = stats.model;
        }
        if (!session.model_name && stats.model) {
          update.model_name = deriveModelDisplayName(stats.model);
        }
        if (session.total_input_tokens === 0 && stats.totalInputTokens > 0) {
          update.total_input_tokens = stats.totalInputTokens;
        }
        if (session.total_output_tokens === 0 && stats.totalOutputTokens > 0) {
          update.total_output_tokens = stats.totalOutputTokens;
        }
        if (session.cache_read_tokens === 0 && stats.cacheReadTokens > 0) {
          update.cache_read_tokens = stats.cacheReadTokens;
        }
        if (session.cache_creation_tokens === 0 && stats.cacheCreationTokens > 0) {
          update.cache_creation_tokens = stats.cacheCreationTokens;
        }
        if (session.total_cost_usd === 0 && stats.estimatedCostUsd > 0) {
          update.total_cost_usd = stats.estimatedCostUsd;
        }
        // Only use transcript duration as fallback when no hook timestamps
        if (session.total_duration_ms === 0 && !update.total_duration_ms && stats.durationMs > 0) {
          update.total_duration_ms = stats.durationMs;
        }
        if (!session.started_at && stats.startedAt) {
          update.started_at = stats.startedAt;
        }
      }
    }

    // Derive lines changed from Edit/Write tool events when statusline absent
    if (session.total_lines_added === 0 && session.total_lines_removed === 0) {
      const events = getEventsForSession(sessionId);
      let linesAdded = 0;
      let linesRemoved = 0;
      for (const e of events) {
        if (e.event !== 'PostToolUse') continue;
        const input = e.tool_input as Record<string, string> | undefined;
        if (!input) continue;
        if (e.tool_name === 'Edit' || e.tool_name === 'MultiEdit') {
          const oldLines = (input.old_string ?? '').split('\n').length;
          const newLines = (input.new_string ?? '').split('\n').length;
          linesAdded += Math.max(0, newLines - oldLines);
          linesRemoved += Math.max(0, oldLines - newLines);
        } else if (e.tool_name === 'Write') {
          const content = input.content ?? input.code ?? '';
          if (content) linesAdded += content.split('\n').length;
        }
      }
      if (linesAdded > 0) update.total_lines_added = linesAdded;
      if (linesRemoved > 0) update.total_lines_removed = linesRemoved;
    }

    if (Object.keys(update).length > 0) {
      upsertSession(sessionId, update as Partial<SessionData>);
      if (update.task_label) {
        console.log(`  [transcript] Task label for ${sessionId.slice(0, 8)}: "${update.task_label}"`);
      }
    }
  } catch (err) {
    console.error(`  [transcript] Failed to enrich session ${sessionId}:`, err);
  }
}
