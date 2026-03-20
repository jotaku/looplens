import { useStats } from '@/api/hooks';
import { StatCard } from '@/components/StatCard';
import { BarChart, SparkArea } from '@/components/Chart';
import { formatCost, formatTokens, formatDuration, timeAgo } from '@/lib/utils';
import { useLocation } from 'wouter';

export function OverviewPage() {
  const { data, isLoading } = useStats();
  const [, setLocation] = useLocation();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading analytics...</div>;
  }

  const agentData = Object.entries(data.agentBreakdown)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 5);

  const modelData = Object.entries(data.modelBreakdown)
    .sort((a, b) => b[1].costUsd - a[1].costUsd)
    .slice(0, 8);

  const toolData = Object.entries(data.toolBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, value]) => ({ label, value }));

  // Build cost sparkline from recent sessions
  const costSeries = data.recentSessions
    .slice()
    .reverse()
    .map(s => s.total_cost_usd);

  const tokenSeries = data.recentSessions
    .slice()
    .reverse()
    .map(s => s.total_input_tokens + s.total_output_tokens);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text">Overview</h2>
        <div className="flex items-center gap-2 text-[10px] text-text2">
          <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse inline-block" />
          Auto-refreshing
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total Cost" value={formatCost(data.totalCostUsd)} accent="yellow" />
        <StatCard label="Sessions" value={data.totalSessions} accent="accent" />
        <StatCard
          label="Tokens"
          value={formatTokens(data.totalInputTokens + data.totalOutputTokens)}
          sub={`${formatTokens(data.totalInputTokens)} in / ${formatTokens(data.totalOutputTokens)} out`}
          accent="cyan"
        />
        <StatCard label="Avg Cost/Session" value={formatCost(data.avgCostPerSession)} accent="yellow" />
        <StatCard label="Total Duration" value={formatDuration(data.totalDurationMs)} />
        <StatCard
          label="Lines Changed"
          value={`+${data.totalLinesAdded} / -${data.totalLinesRemoved}`}
          accent="green"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Cost trend */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Cost per Session (recent)</h3>
          {costSeries.length >= 2 ? (
            <SparkArea values={costSeries} width={500} height={80} color="var(--color-yellow)" />
          ) : (
            <div className="text-text2 text-xs py-4">Need 2+ sessions for trend</div>
          )}
        </div>

        {/* Token trend */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Tokens per Session (recent)</h3>
          {tokenSeries.length >= 2 ? (
            <SparkArea values={tokenSeries} width={500} height={80} color="var(--color-cyan)" />
          ) : (
            <div className="text-text2 text-xs py-4">Need 2+ sessions for trend</div>
          )}
        </div>
      </div>

      {/* Top Agents, Models, Tools */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Top Agents */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-text2">Top Agents</h3>
            <button onClick={() => setLocation('/agents')} className="text-[10px] text-accent hover:underline">View all →</button>
          </div>
          {agentData.length ? (
            <div className="space-y-2">
              {agentData.map(([agent, stats]) => (
                <div key={agent} className="flex items-center justify-between text-xs">
                  <span className="text-purple font-medium truncate flex-1">{agent}</span>
                  <span className="text-text2 mx-2">{stats.sessions}s</span>
                  <span className="text-yellow tabular-nums">{formatCost(stats.costUsd)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-text2 text-xs py-4">No agent data yet</div>
          )}
        </div>

        {/* Top Models */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-text2">Top Models</h3>
            <button onClick={() => setLocation('/models')} className="text-[10px] text-accent hover:underline">View all →</button>
          </div>
          {modelData.length ? (
            <div className="space-y-2">
              {modelData.map(([model, stats]) => (
                <div key={model} className="flex items-center justify-between text-xs">
                  <span className="text-text truncate flex-1">{model}</span>
                  <span className="text-text2 mx-2">{stats.sessions}s</span>
                  <span className="text-yellow font-medium tabular-nums">{formatCost(stats.costUsd)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-text2 text-xs py-4">No model data yet</div>
          )}
        </div>

        {/* Top Tools */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-text2">Top Tools</h3>
            <button onClick={() => setLocation('/tools')} className="text-[10px] text-accent hover:underline">View all →</button>
          </div>
          {toolData.length ? (
            <BarChart data={toolData} height={140} barColor="var(--color-purple)" />
          ) : (
            <div className="text-text2 text-xs py-4">No tool data yet</div>
          )}
        </div>
      </div>

      {/* Recent sessions */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-text2">Recent Sessions</h3>
          <button
            onClick={() => setLocation('/sessions')}
            className="text-[10px] text-accent hover:underline"
          >
            View all →
          </button>
        </div>

        {data.recentSessions.length ? (
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-2 py-1 text-[10px] text-text2 uppercase tracking-wider font-medium">
              <span className="w-14 shrink-0">Time</span>
              <span className="w-20 shrink-0">Session</span>
              <span className="flex-1">Model</span>
              <span className="shrink-0">Cost</span>
              <span className="shrink-0">Tokens</span>
              <span className="shrink-0">Duration</span>
            </div>
            {data.recentSessions.slice(0, 10).map(s => (
              <button
                key={s.session_id}
                onClick={() => setLocation(`/sessions/${s.session_id}`)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-surface2 text-left transition-colors"
              >
                <span className="text-[10px] text-text2 w-14 shrink-0">{timeAgo(s.started_at)}</span>
                <span className="text-xs text-accent font-mono truncate w-20 shrink-0">
                  {s.session_id.slice(0, 8)}
                </span>
                <span className="text-xs text-text truncate flex-1">
                  {s.model_name || s.model_id || '—'}
                </span>
                <span className="text-xs text-yellow tabular-nums shrink-0">
                  {formatCost(s.total_cost_usd)}
                </span>
                <span className="text-xs text-cyan tabular-nums shrink-0">
                  {formatTokens(s.total_input_tokens + s.total_output_tokens)}
                </span>
                <span className="text-xs text-text2 tabular-nums shrink-0">
                  {formatDuration(s.total_duration_ms)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-text2 text-xs py-4 text-center">
            No sessions yet. Start the Claude Code plugin to begin collecting data.
          </div>
        )}
      </div>
    </div>
  );
}
