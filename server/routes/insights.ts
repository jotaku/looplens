import { Router } from 'express';
import type { Request, Response } from 'express';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const router = Router();

const REPORT_PATH = join(homedir(), '.claude', 'usage-data', 'report.html');

/** Check if we're on macOS */
function isMacOS(): boolean {
  return platform() === 'darwin';
}

/** Find the claude CLI binary */
function findClaude(): string | null {
  const candidates = [
    '/usr/local/bin/claude',
    join(homedir(), '.nvm/versions/node', process.version, 'bin/claude'),
    'claude', // fallback to PATH
  ];
  for (const c of candidates) {
    try {
      if (c === 'claude' || existsSync(c)) return c;
    } catch { /* skip */ }
  }
  return null;
}

let generating = false;
let lastError: string | null = null;

// GET /api/insights/status — report existence + last modified
router.get('/status', (_req: Request, res: Response) => {
  if (!isMacOS()) {
    res.json({ available: false, reason: 'Insights is only supported on macOS for now.' });
    return;
  }

  const claudePath = findClaude();
  if (!claudePath) {
    res.json({ available: false, reason: 'Claude Code CLI not found. Install it first.' });
    return;
  }

  const reportExists = existsSync(REPORT_PATH);
  let lastModified: string | null = null;
  if (reportExists) {
    lastModified = statSync(REPORT_PATH).mtime.toISOString();
  }

  res.json({
    available: true,
    reportExists,
    lastModified,
    generating,
    lastError,
  });
});

// POST /api/insights/generate — run `claude -p "/insights"` in background
router.post('/generate', (_req: Request, res: Response) => {
  if (!isMacOS()) {
    res.status(400).json({ error: 'Insights is only supported on macOS for now.' });
    return;
  }

  if (generating) {
    res.status(409).json({ error: 'Insights generation is already in progress.' });
    return;
  }

  const claudePath = findClaude();
  if (!claudePath) {
    res.status(400).json({ error: 'Claude Code CLI not found.' });
    return;
  }

  generating = true;
  lastError = null;

  execFile(claudePath, ['-p', '/insights', '--output-format', 'json'], { timeout: 120_000 }, (err, stdout, stderr) => {
    generating = false;

    if (err) {
      const msg = err.message ?? 'Unknown error';
      console.error('Insights generation failed:', msg);
      lastError = msg;
      return;
    }

    // Parse JSON output from claude CLI to detect errors like rate limits
    try {
      const result = JSON.parse(stdout);
      if (result.is_error || result.result?.includes?.('limit')) {
        lastError = result.result ?? 'Claude Code reported an error during generation.';
        console.error('Insights CLI error:', lastError);
      }
    } catch {
      // Non-JSON output — check stderr
      if (stderr?.trim()) {
        lastError = stderr.trim();
        console.error('Insights stderr:', lastError);
      }
    }
  });

  // Return immediately — generation runs in background
  res.json({ ok: true, message: 'Insights generation started. This may take 30–60 seconds and will consume tokens.' });
});

// GET /api/insights/report — serve the HTML report
router.get('/report', (_req: Request, res: Response) => {
  if (!existsSync(REPORT_PATH)) {
    res.status(404).json({ error: 'No insights report found. Generate one first.' });
    return;
  }

  const html = readFileSync(REPORT_PATH, 'utf-8');
  res.type('html').send(html);
});

export { router as insightsRouter };
