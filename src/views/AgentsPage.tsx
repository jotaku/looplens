import { useStats } from '@/api/hooks';
import { StatCard } from '@/components/StatCard';
import { BarChart } from '@/components/Chart';
import { formatCost, formatTokens } from '@/lib/utils';

export function AgentsPage() {
  const { data, isLoading } = useStats();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading agents...</div>;
  }

  const agents = Object.entries(data.agentBreakdown)
    .sort((a, b) => b[1].sessions - a[1].sessions);

  const totalAgents = agents.filter(([k]) => k !== 'unknown').length;
  const totalToolCalls = agents.reduce((sum, [, s]) => sum + s.toolCalls, 0);

  const sessionChartData = agents.slice(0, 10).map(([label, s]) => ({ label, value: s.sessions }));
  const costChartData = agents.slice(0, 10).map(([label, s]) => ({
    label,
    value: Math.round(s.costUsd * 10000) / 100,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text">Agents</h2>
        <span className="text-xs text-text2">{totalAgents} agents across {data.totalSessions} sessions</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Agents" value={totalAgents} accent="purple" />
        <StatCard label="Total Sessions" value={data.totalSessions} accent="accent" />
        <StatCard label="Total Cost" value={formatCost(data.totalCostUsd)} accent="yellow" />
        <StatCard label="Tool Calls" value={totalToolCalls} accent="cyan" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Sessions by Agent</h3>
          {sessionChartData.length ? (
            <BarChart data={sessionChartData} height={160} barColor="var(--color-purple)" />
          ) : (
            <div className="text-text2 text-xs py-4">No data</div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Cost by Agent (cents)</h3>
          {costChartData.length ? (
            <BarChart data={costChartData} height={160} barColor="var(--color-yellow)" />
          ) : (
            <div className="text-text2 text-xs py-4">No data</div>
          )}
        </div>
      </div>

      {/* Agent table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text2">
              <th className="text-left px-3 py-2 font-medium">Agent</th>
              <th className="text-right px-3 py-2 font-medium">Sessions</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
              <th className="text-right px-3 py-2 font-medium">Cost/Session</th>
              <th className="text-right px-3 py-2 font-medium">Input Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Output Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Tool Calls</th>
              <th className="text-left px-3 py-2 font-medium">Models Used</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(([agent, stats]) => {
              const costPerSession = stats.sessions > 0 ? stats.costUsd / stats.sessions : 0;
              return (
                <tr key={agent} className="border-b border-border/50">
                  <td className="px-3 py-2 text-purple font-medium">{agent}</td>
                  <td className="px-3 py-2 text-right text-text tabular-nums">{stats.sessions}</td>
                  <td className="px-3 py-2 text-right text-yellow tabular-nums">{formatCost(stats.costUsd)}</td>
                  <td className="px-3 py-2 text-right text-yellow/70 tabular-nums">{formatCost(costPerSession)}</td>
                  <td className="px-3 py-2 text-right text-cyan tabular-nums">{formatTokens(stats.inputTokens)}</td>
                  <td className="px-3 py-2 text-right text-cyan/70 tabular-nums">{formatTokens(stats.outputTokens)}</td>
                  <td className="px-3 py-2 text-right text-text2 tabular-nums">{stats.toolCalls}</td>
                  <td className="px-3 py-2 text-text2">
                    {stats.models.join(', ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!agents.length && (
          <div className="text-text2 text-xs py-8 text-center">
            No agent data yet. Hooks with agent_id will populate this page.
          </div>
        )}
      </div>
    </div>
  );
}
