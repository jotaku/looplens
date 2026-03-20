import { Router } from 'express';
import type { Request, Response } from 'express';
import { getStats, getSessions, getEventsForSession } from '../store.js';

const router = Router();

// GET /api/stats — aggregate analytics
router.get('/', (_req: Request, res: Response) => {
  res.json(getStats());
});

// GET /api/stats/quality — aggregate quality signals across all sessions
router.get('/quality', (_req: Request, res: Response) => {
  const sessions = Object.values(getSessions());
  if (!sessions.length) {
    res.json({ sessions: 0, signals: null });
    return;
  }

  let totalCompleted = 0;
  let totalFailed = 0;
  let totalToolCalls = 0;
  let totalToolErrors = 0;
  let totalLinesChanged = 0;
  let totalCost = 0;
  let totalOutputTokens = 0;
  let sessionsWithLines = 0;
  let totalTurns = 0;

  const perSession: {
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
  }[] = [];

  for (const s of sessions) {
    const events = getEventsForSession(s.session_id);
    const stopEvents = events.filter(e => e.event === 'Stop');
    const stopFailures = events.filter(e => e.event === 'StopFailure');
    const toolUses = events.filter(e => e.event === 'PostToolUse');

    const linesChanged = s.total_lines_added + s.total_lines_removed;
    const costPerLine = linesChanged > 0 ? s.total_cost_usd / linesChanged : null;
    const tokensPerLine = linesChanged > 0 ? s.total_output_tokens / linesChanged : null;

    let completionStatus = 'unknown';
    if (s.ended_at) {
      completionStatus = stopFailures.length > 0 && stopEvents.length === 0 ? 'failure' : 'success';
      if (completionStatus === 'success') totalCompleted++;
      else totalFailed++;
    }

    totalToolCalls += toolUses.length;
    totalToolErrors += stopFailures.length;
    totalLinesChanged += linesChanged;
    totalCost += s.total_cost_usd;
    totalOutputTokens += s.total_output_tokens;
    if (linesChanged > 0) sessionsWithLines++;

    // Rough turn count from tools_used (each PostToolUse implies activity)
    const turns = Object.values(s.tools_used).reduce((a, b) => a + b, 0);
    totalTurns += turns;

    perSession.push({
      sessionId: s.session_id,
      model: s.model_name || s.model_id || 'unknown',
      completionStatus,
      costPerLine,
      tokensPerLine,
      toolCalls: toolUses.length,
      toolErrors: stopFailures.length,
      linesChanged,
      cost: s.total_cost_usd,
      turns,
    });
  }

  const avgCostPerLine = totalLinesChanged > 0 ? totalCost / totalLinesChanged : null;
  const avgTokensPerLine = totalLinesChanged > 0 ? totalOutputTokens / totalLinesChanged : null;

  res.json({
    sessions: sessions.length,
    signals: {
      completionRate: sessions.length > 0 ? totalCompleted / sessions.length : 0,
      failureRate: sessions.length > 0 ? totalFailed / sessions.length : 0,
      toolErrorRate: totalToolCalls > 0 ? totalToolErrors / totalToolCalls : 0,
      avgCostPerLine,
      avgTokensPerLine,
      totalLinesChanged,
      totalToolCalls,
      totalToolErrors,
      sessionsWithOutput: sessionsWithLines,
      avgTurnsPerSession: sessions.length > 0 ? totalTurns / sessions.length : 0,
    },
    perSession: perSession.sort((a, b) => (b.costPerLine ?? 0) - (a.costPerLine ?? 0)),
  });
});

export { router as statsRouter };
