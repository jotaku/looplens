import { useState } from 'react';
import { useCommits } from '@/api/hooks';
import { StatCard } from '@/components/StatCard';
import { formatCost, formatTokens, formatDuration, timeAgo } from '@/lib/utils';
import { useLocation } from 'wouter';

export function CommitsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCommits(page, 30);
  const [, setLocation] = useLocation();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading commits...</div>;
  }

  const agentBreakdown = Object.entries(data.agentBreakdown)
    .sort((a, b) => b[1].commits - a[1].commits);

  const totalCost = agentBreakdown.reduce((sum, [, s]) => sum + s.cost, 0);
  const totalTokens = agentBreakdown.reduce((sum, [, s]) => sum + s.tokens, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text">Commits</h2>
        <span className="text-xs text-text2">
          {data.total} commit{data.total !== 1 ? 's' : ''} · {data.repos.length} repo{data.repos.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Commits" value={data.total} accent="purple" />
        <StatCard label="Total Cost" value={formatCost(totalCost)} accent="yellow" />
        <StatCard label="Total Tokens" value={formatTokens(totalTokens)} accent="cyan" />
        <StatCard label="Repos" value={data.repos.length} accent="accent" />
      </div>

      {/* Agent breakdown — single unified table */}
      {agentBreakdown.length > 0 && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden mb-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text2">
                <th className="text-left px-3 py-2 font-medium">Agent</th>
                <th className="text-right px-3 py-2 font-medium">Commits</th>
                <th className="text-left px-3 py-2 font-medium">Model</th>
                <th className="text-right px-3 py-2 font-medium">Cost</th>
                <th className="text-right px-3 py-2 font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {agentBreakdown.map(([agent, stats]) => (
                <tr key={agent} className="border-b border-border/50 hover:bg-surface2">
                  <td className="px-3 py-2 text-purple font-medium truncate max-w-[200px]">{agent}</td>
                  <td className="px-3 py-2 text-right text-text tabular-nums">{stats.commits}</td>
                  <td className="px-3 py-2 text-text2">{stats.model || '—'}</td>
                  <td className="px-3 py-2 text-right text-yellow tabular-nums">
                    {stats.cost > 0 ? formatCost(stats.cost) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-cyan tabular-nums">
                    {stats.tokens > 0 ? formatTokens(stats.tokens) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Commit list */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text2">
              <th className="text-left px-3 py-2 font-medium">Hash</th>
              <th className="text-left px-3 py-2 font-medium">Subject</th>
              <th className="text-left px-3 py-2 font-medium">Author</th>
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
              <th className="text-right px-3 py-2 font-medium">Tokens</th>
              <th className="text-left px-3 py-2 font-medium">Repo</th>
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Session</th>
            </tr>
          </thead>
          <tbody>
            {data.commits.map(c => {
              const model = c.sessionModel ?? c.agentModel;

              return (
                <tr key={c.hash} className="border-b border-border/50 hover:bg-surface2">
                  <td className="px-3 py-2 font-mono text-accent">{c.shortHash}</td>
                  <td className="px-3 py-2 text-text truncate max-w-[320px]">{c.subject}</td>
                  <td className="px-3 py-2 text-text2">{c.author}</td>
                  <td className="px-3 py-2 text-text2">{model ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-yellow tabular-nums">
                    {c.sessionCostUsd ? formatCost(c.sessionCostUsd) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-cyan tabular-nums">
                    {(c.sessionInputTokens || c.sessionOutputTokens) ? formatTokens((c.sessionInputTokens ?? 0) + (c.sessionOutputTokens ?? 0)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-text2 font-mono text-[10px]">{c.repo}</td>
                  <td className="px-3 py-2 text-text2">{timeAgo(c.date)}</td>
                  <td className="px-3 py-2">
                    {c.sessionId ? (
                      <button
                        onClick={() => setLocation(`/sessions/${c.sessionId}`)}
                        className="text-accent hover:underline font-mono"
                        title="View session"
                      >
                        {c.sessionId.slice(0, 8)}
                      </button>
                    ) : (
                      <span className="text-text2">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!data.commits.length && (
          <div className="text-text2 text-xs py-8 text-center">
            No commits found. Commits made during Claude Code sessions will appear here.
          </div>
        )}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded text-xs bg-surface2 text-text2 border border-border hover:bg-border disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-text2">
            Page {page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1 rounded text-xs bg-surface2 text-text2 border border-border hover:bg-border disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
