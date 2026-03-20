import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSessions, getSession, getEventsForSession } from '../store.js';
import {
  enrichSessionFromTranscript,
  findTranscript,
  countUserTurns,
  parseTranscriptPrompts,
} from '../transcript.js';

const router = Router();

// GET /api/sessions — list all sessions, sorted by started_at desc
router.get('/', (_req: Request, res: Response) => {
  const sessions = getSessions();
  const list = Object.values(sessions).sort((a, b) =>
    new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  const page = parseInt((_req.query.page as string) ?? '1', 10);
  const limit = parseInt((_req.query.limit as string) ?? '50', 10);
  const start = (page - 1) * limit;
  const paginated = list.slice(start, start + limit);

  res.json({
    sessions: paginated,
    total: list.length,
    page,
    limit,
    totalPages: Math.ceil(list.length / limit),
  });
});

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

function computeQuality(session: ReturnType<typeof getSession>, events: ReturnType<typeof getEventsForSession>): QualitySignals {
  const s = session!;
  const stopEvents = events.filter(e => e.event === 'Stop');
  const stopFailures = events.filter(e => e.event === 'StopFailure');
  const toolUseEvents = events.filter(e => e.event === 'PostToolUse');
  const totalStops = stopEvents.length + stopFailures.length;

  const linesChanged = s.total_lines_added + s.total_lines_removed;
  const costPerLine = linesChanged > 0 ? s.total_cost_usd / linesChanged : null;
  const tokensPerLine = linesChanged > 0 ? s.total_output_tokens / linesChanged : null;

  // Completion: ended normally = success, StopFailure with no subsequent Stop = failure
  let completionStatus: 'success' | 'failure' | 'unknown' = 'unknown';
  if (s.ended_at) {
    completionStatus = stopFailures.length > 0 && stopEvents.length === 0 ? 'failure' : 'success';
  }

  // Turn count from transcript (user prompts)
  const transcriptFile = findTranscript(s.session_id, s.cwd, s.transcript_path);
  const turnCount = transcriptFile ? countUserTurns(transcriptFile) : 0;

  return {
    completionStatus,
    stopFailures: stopFailures.length,
    totalStops,
    retryRate: totalStops > 0 ? stopFailures.length / totalStops : 0,
    toolCalls: toolUseEvents.length,
    toolErrors: stopFailures.length,
    toolErrorRate: toolUseEvents.length > 0 ? stopFailures.length / toolUseEvents.length : 0,
    linesChanged,
    costPerLine,
    tokensPerLine,
    turnCount,
    hasCommit: false, // enriched by frontend if needed
  };
}

// GET /api/sessions/:id — single session with events + quality signals
router.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;

  // Try to enrich from transcript if session has no token data
  enrichSessionFromTranscript(id);

  const session = getSession(id);
  if (!session) {
    res.status(404).json({ error: 'session not found' });
    return;
  }

  const events = getEventsForSession(id);
  const quality = computeQuality(session, events);

  res.json({ session, events, quality });
});

// GET /api/sessions/:id/transcript — read conversation from Claude Code transcript
router.get('/:id/transcript', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const session = getSession(id);
  if (!session) {
    res.status(404).json({ error: 'session not found' });
    return;
  }

  // Try stored transcript_path first, then discover it
  const transcriptFile = findTranscript(id, session.cwd, session.transcript_path);

  if (!transcriptFile) {
    res.json({ messages: [], source: null });
    return;
  }

  const messages = parseTranscriptPrompts(transcriptFile);
  res.json({ messages, source: transcriptFile });
});

export { router as sessionsRouter };
