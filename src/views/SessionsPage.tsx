import { useState } from 'react';
import { useSessions } from '@/api/hooks';
import { useLocation } from 'wouter';
import { formatCost, formatTokens, formatDuration, timeAgo } from '@/lib/utils';

export function SessionsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSessions(page, 25);
  const [, setLocation] = useLocation();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading sessions...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text">Sessions</h2>
        <span className="text-xs text-text2">{data.total} total</span>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text2">
              <th className="text-left px-3 py-2 font-medium">Session</th>
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
              <th className="text-right px-3 py-2 font-medium">Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Duration</th>
              <th className="text-right px-3 py-2 font-medium">Tools</th>
              <th className="text-right px-3 py-2 font-medium">Files</th>
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map(s => {
              const totalTokens = s.total_input_tokens + s.total_output_tokens;
              const toolCount = Object.values(s.tools_used ?? {}).reduce((a, b) => a + b, 0);
              const isActive = !s.ended_at;
              return (
                <tr
                  key={s.session_id}
                  onClick={() => setLocation(`/sessions/${s.session_id}`)}
                  className="border-b border-border/50 hover:bg-surface2 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-accent">
                    {s.session_id.slice(0, 10)}…
                  </td>
                  <td className="px-3 py-2 text-text">
                    {s.model_name || s.model_id || '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-yellow tabular-nums">
                    {formatCost(s.total_cost_usd)}
                  </td>
                  <td className="px-3 py-2 text-right text-cyan tabular-nums">
                    {formatTokens(totalTokens)}
                  </td>
                  <td className="px-3 py-2 text-right text-text2 tabular-nums">
                    {formatDuration(s.total_duration_ms)}
                  </td>
                  <td className="px-3 py-2 text-right text-purple tabular-nums">
                    {toolCount}
                  </td>
                  <td className="px-3 py-2 text-right text-text2 tabular-nums">
                    {s.files_changed?.length ?? 0}
                  </td>
                  <td className="px-3 py-2 text-text2">
                    {timeAgo(s.started_at)}
                  </td>
                  <td className="px-3 py-2">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-green">
                        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                        active
                      </span>
                    ) : (
                      <span className="text-text2">
                        {s.stop_reason?.startsWith('error:') ? '⚠ error' : 'done'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data.sessions.length === 0 && (
          <div className="text-text2 text-xs py-8 text-center">
            No sessions recorded yet.
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
