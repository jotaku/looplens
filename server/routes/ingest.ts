import { Router } from 'express';
import type { Request, Response } from 'express';
import { dirname } from 'node:path';
import { upsertSession, getSession, appendEvent } from '../store.js';
import type { HookEvent, SessionData } from '../store.js';
import { enrichSessionFromTranscript } from '../transcript.js';

const router = Router();

// POST /api/ingest/statusline
// Receives the full statusline JSON from Claude Code's statusline script
router.post('/statusline', (req: Request, res: Response) => {
  try {
    const data = req.body;
    const sessionId = data.session_id;
    if (!sessionId) {
      res.status(400).json({ error: 'missing session_id' });
      return;
    }

    const cost = data.cost ?? {};
    const ctx = data.context_window ?? {};
    const currentUsage = ctx.current_usage ?? {};
    const model = data.model ?? {};

    upsertSession(sessionId, {
      session_id: sessionId,
      model_id: model.id ?? '',
      model_name: model.display_name ?? '',
      cwd: data.cwd ?? data.workspace?.current_dir ?? '',
      total_cost_usd: cost.total_cost_usd ?? 0,
      total_duration_ms: cost.total_duration_ms ?? 0,
      total_api_duration_ms: cost.total_api_duration_ms ?? 0,
      total_input_tokens: ctx.total_input_tokens ?? 0,
      total_output_tokens: ctx.total_output_tokens ?? 0,
      cache_read_tokens: currentUsage.cache_read_input_tokens ?? 0,
      cache_creation_tokens: currentUsage.cache_creation_input_tokens ?? 0,
      total_lines_added: cost.total_lines_added ?? 0,
      total_lines_removed: cost.total_lines_removed ?? 0,
      context_window_size: ctx.context_window_size ?? 0,
      used_percentage: ctx.used_percentage ?? 0,
      version: data.version,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Ingest statusline error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// POST /api/ingest/hook
// Receives hook event JSON from Claude Code HTTP hooks
router.post('/hook', (req: Request, res: Response) => {
  try {
    const data = req.body;
    const sessionId = data.session_id;
    const eventName = data.hook_event_name;

    if (!sessionId || !eventName) {
      res.status(400).json({ error: 'missing session_id or hook_event_name' });
      return;
    }

    // Ensure session row exists before inserting events (FK constraint)
    // Store agent identity and transcript path from any hook that carries them
    const sessionMeta: Record<string, unknown> = {};
    if (data.agent_id) {
      sessionMeta.agent_id = data.agent_id;
      sessionMeta.agent_type = data.agent_type;
    }
    if (data.transcript_path) {
      sessionMeta.transcript_path = data.transcript_path;
    }

    if (eventName === 'SessionStart') {
      upsertSession(sessionId, {
        session_id: sessionId,
        model_id: data.model ?? '',
        cwd: data.cwd ?? '',
        started_at: new Date().toISOString(),
        ...sessionMeta,
      });
    } else {
      // For non-SessionStart events, ensure session exists with at least the meta
      if (Object.keys(sessionMeta).length > 0) {
        upsertSession(sessionId, sessionMeta as Partial<SessionData>);
      } else {
        // Ensure session row exists even with no meta (for FK)
        upsertSession(sessionId, { session_id: sessionId });
      }
    }

    // Backfill cwd if still empty (Claude Code app may skip SessionStart)
    {
      const existing = getSession(sessionId);
      if (existing && !existing.cwd && data.tool_input?.file_path) {
        const derivedCwd = dirname(data.tool_input.file_path);
        if (derivedCwd) {
          upsertSession(sessionId, { cwd: derivedCwd } as Partial<SessionData>);
        }
      }
    }

    const event: HookEvent = {
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      event: eventName,
      tool_name: data.tool_name,
      tool_input: data.tool_input,
      tool_response: data.tool_response,
      model: data.model,
      source: data.source,
      reason: data.reason,
      error: data.error,
      error_details: data.error_details,
      last_assistant_message: data.last_assistant_message,
      agent_id: data.agent_id,
      agent_type: data.agent_type,
      transcript_path: data.transcript_path,
    };

    appendEvent(event);

    // Update session based on event type (session already exists at this point)
    if (eventName === 'PostToolUse') {
      const toolName = data.tool_name ?? 'unknown';
      const update: Record<string, unknown> = {
        tools_used: { [toolName]: 1 },
      };

      // Track files changed from Write/Edit tools
      const filePath = data.tool_input?.file_path;
      if (filePath && (toolName === 'Write' || toolName === 'Edit')) {
        update.files_changed = [filePath];
      }

      upsertSession(sessionId, update as Partial<SessionData>);
    } else if (eventName === 'Stop') {
      upsertSession(sessionId, {
        last_assistant_message: data.last_assistant_message,
        stop_reason: data.reason ?? 'completed',
      });
    } else if (eventName === 'StopFailure') {
      upsertSession(sessionId, {
        stop_reason: `error:${data.error ?? 'unknown'}`,
        last_assistant_message: data.last_assistant_message,
      });
    } else if (eventName === 'SessionEnd') {
      upsertSession(sessionId, {
        ended_at: new Date().toISOString(),
        end_reason: data.reason,
      });
    }

    // Enrich session from transcript on Stop/SessionEnd (or if session has no token data)
    if (eventName === 'Stop' || eventName === 'SessionEnd') {
      enrichSessionFromTranscript(sessionId);
    }

    // Return 200 with empty body (non-blocking for Claude Code)
    res.json({ ok: true });
  } catch (err) {
    console.error('Ingest hook error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

export { router as ingestRouter };
