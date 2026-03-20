import { Router } from 'express';
import type { Request, Response } from 'express';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSessions } from '../store.js';
import type { SessionData } from '../store.js';

const router = Router();

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
  // From trailers
  agentId?: string;
  agentModel?: string;
  agentProvider?: string;
  agentCost?: string;
  agentTokens?: string;
  agentConfidence?: string;
  // From session correlation
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

function parseTrailer(body: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'mi');
  const match = body.match(re);
  return match?.[1]?.trim();
}

function findGitRoot(dirPath: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: resolve(dirPath),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function parseGitLog(gitPath: string, maxCount: number): Omit<CommitData, 'repo' | 'repoPath' | 'isAgentCommit'>[] {
  if (!existsSync(gitPath)) return [];

  try {
    const SEP = '---COMMIT_SEP---';
    const FMT = `%H%n%h%n%an%n%ae%n%aI%n%s%n%b${SEP}`;
    const raw = execSync(
      `git log --all --format="${FMT}" -n ${maxCount}`,
      { cwd: resolve(gitPath), encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const commits: Omit<CommitData, 'repo' | 'repoPath' | 'isAgentCommit'>[] = [];
    const chunks = raw.split(SEP).filter(c => c.trim());

    for (const chunk of chunks) {
      const lines = chunk.trim().split('\n');
      if (lines.length < 6) continue;

      const [hash, shortHash, author, email, date, subject, ...bodyLines] = lines;
      const body = bodyLines.join('\n');

      commits.push({
        hash, shortHash, author, email, date, subject, body,
        agentId: parseTrailer(body, 'Agent-Id'),
        agentModel: parseTrailer(body, 'Agent-Model'),
        agentProvider: parseTrailer(body, 'Agent-Provider'),
        agentCost: parseTrailer(body, 'Agent-Cost'),
        agentTokens: parseTrailer(body, 'Agent-Tokens'),
        agentConfidence: parseTrailer(body, 'Agent-Confidence'),
      });
    }

    return commits;
  } catch {
    return [];
  }
}

// Match a commit to a session: same repo + commit time falls within session window (with 60s buffer)
function correlateCommit(
  commitDate: string,
  repoRoot: string,
  sessions: SessionData[],
  repoRootCache: Map<string, string | null>,
): SessionData | undefined {
  const commitTime = new Date(commitDate).getTime();
  const BUFFER_MS = 60_000; // 60s grace period after session end

  for (const s of sessions) {
    const cwd = s.cwd;
    if (!cwd) continue;

    // Resolve the git root for this session's cwd (cached)
    if (!repoRootCache.has(cwd)) {
      repoRootCache.set(cwd, findGitRoot(cwd));
    }
    const sessionRoot = repoRootCache.get(cwd);
    if (sessionRoot !== repoRoot) continue;

    const startTime = new Date(s.started_at).getTime();
    const endTime = s.ended_at ? new Date(s.ended_at).getTime() + BUFFER_MS : Date.now() + BUFFER_MS;

    if (commitTime >= startTime && commitTime <= endTime) {
      return s;
    }
  }
  return undefined;
}

// GET /api/commits — scans all repos from sessions, correlates with session data
router.get('/', (req: Request, res: Response) => {
  const page = parseInt((req.query.page as string) ?? '1', 10);
  const limit = parseInt((req.query.limit as string) ?? '50', 10);

  const sessionsMap = getSessions();
  const allSessions = Object.values(sessionsMap).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  // Collect unique git roots from all session cwds
  const repoRootCache = new Map<string, string | null>();
  const gitRoots = new Map<string, string>(); // root → display name

  for (const s of allSessions) {
    if (!s.cwd) continue;
    if (repoRootCache.has(s.cwd)) {
      const root = repoRootCache.get(s.cwd);
      if (root && !gitRoots.has(root)) {
        gitRoots.set(root, root.split('/').filter(Boolean).pop() ?? 'unknown');
      }
      continue;
    }
    const root = findGitRoot(s.cwd);
    repoRootCache.set(s.cwd, root);
    if (root && !gitRoots.has(root)) {
      gitRoots.set(root, root.split('/').filter(Boolean).pop() ?? 'unknown');
    }
  }

  // Parse commits from all discovered repos
  const allCommits: CommitData[] = [];
  const seenHashes = new Set<string>();

  for (const [rootPath, repoName] of gitRoots) {
    const rawCommits = parseGitLog(rootPath, 200);

    for (const rc of rawCommits) {
      if (seenHashes.has(rc.hash)) continue;
      seenHashes.add(rc.hash);

      const session = correlateCommit(rc.date, rootPath, allSessions, repoRootCache);

      // Detect Claude Code commits:
      // 1. Co-Authored-By line from Anthropic (Claude Code adds this automatically)
      const hasClaudeCoAuthor = /Co-Authored-By:.*claude.*<.*@anthropic\.com>/i.test(rc.body);
      // 2. Commit made during a tracked Claude Code session
      const hasSession = !!session;

      const isAgentCommit = hasClaudeCoAuthor || hasSession;

      allCommits.push({
        ...rc,
        repo: repoName,
        repoPath: rootPath,
        isAgentCommit,
        // Enrich from session
        sessionId: session?.session_id,
        sessionCostUsd: session?.total_cost_usd,
        sessionInputTokens: session?.total_input_tokens,
        sessionOutputTokens: session?.total_output_tokens,
        sessionModel: session?.model_name || session?.model_id,
        sessionAgentId: session?.agent_id,
        sessionDurationMs: session?.total_duration_ms,
        sessionTaskLabel: session?.task_label,
      });
    }
  }

  // Sort all commits by date descending
  allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Only Claude Code commits
  const filtered = allCommits.filter(c => c.isAgentCommit);

  const total = filtered.length;
  const start = (page - 1) * limit;
  const paginated = filtered.slice(start, start + limit);

  // Compute agent breakdown from agent commits
  // Track seen session IDs to avoid counting session cost/tokens multiple times
  const agentBreakdown: Record<string, { commits: number; cost: number; tokens: number; model: string }> = {};
  const seenSessionsPerAgent = new Map<string, Set<string>>();

  for (const c of filtered) {
    const key = c.sessionAgentId ?? c.agentId ?? c.sessionModel ?? 'Claude Code';
    if (!agentBreakdown[key]) agentBreakdown[key] = { commits: 0, cost: 0, tokens: 0, model: '' };
    if (!seenSessionsPerAgent.has(key)) seenSessionsPerAgent.set(key, new Set());
    agentBreakdown[key].commits++;

    // Only add session cost/tokens once per unique session to avoid accumulation
    const sessionKey = c.sessionId ?? c.hash;
    if (!seenSessionsPerAgent.get(key)!.has(sessionKey)) {
      seenSessionsPerAgent.get(key)!.add(sessionKey);
      agentBreakdown[key].cost += c.sessionCostUsd ?? (parseFloat(c.agentCost ?? '0') || 0);
      agentBreakdown[key].tokens += ((c.sessionInputTokens ?? 0) + (c.sessionOutputTokens ?? 0)) || (parseInt(c.agentTokens ?? '0', 10) || 0);
    }
    if (c.sessionModel && !agentBreakdown[key].model) agentBreakdown[key].model = c.sessionModel;
  }

  res.json({
    commits: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    agentBreakdown,
    repos: [...gitRoots.entries()].map(([path, name]) => ({ path, name })),
  });
});

export { router as commitsRouter };
