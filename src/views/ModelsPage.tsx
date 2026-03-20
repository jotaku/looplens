import { useStats } from '@/api/hooks';
import { StatCard } from '@/components/StatCard';
import { BarChart } from '@/components/Chart';
import { formatCost, formatTokens } from '@/lib/utils';

export function ModelsPage() {
  const { data, isLoading } = useStats();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading models...</div>;
  }

  const models = Object.entries(data.modelBreakdown)
    .sort((a, b) => b[1].costUsd - a[1].costUsd);

  const costChartData = models.map(([label, s]) => ({ label, value: Math.round(s.costUsd * 10000) / 100 }));
  const sessionChartData = models.map(([label, s]) => ({ label, value: s.sessions }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text">Model Usage</h2>
        <span className="text-xs text-text2">{models.length} models across {data.totalSessions} sessions</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Cost" value={formatCost(data.totalCostUsd)} accent="yellow" />
        <StatCard
          label="Total Tokens"
          value={formatTokens(data.totalInputTokens + data.totalOutputTokens)}
          accent="cyan"
        />
        <StatCard label="Models Used" value={models.length} accent="purple" />
        <StatCard label="Avg Cost/Session" value={formatCost(data.avgCostPerSession)} accent="yellow" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Cost by Model (cents)</h3>
          {costChartData.length ? (
            <BarChart data={costChartData} height={160} barColor="var(--color-yellow)" />
          ) : (
            <div className="text-text2 text-xs py-4">No data</div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Sessions by Model</h3>
          {sessionChartData.length ? (
            <BarChart data={sessionChartData} height={160} barColor="var(--color-accent)" />
          ) : (
            <div className="text-text2 text-xs py-4">No data</div>
          )}
        </div>
      </div>

      {/* Detailed table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text2">
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-right px-3 py-2 font-medium">Sessions</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
              <th className="text-right px-3 py-2 font-medium">Cost/Session</th>
              <th className="text-right px-3 py-2 font-medium">Input Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Output Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Total Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Cost/1K Tok</th>
            </tr>
          </thead>
          <tbody>
            {models.map(([model, stats]) => {
              const totalTok = stats.inputTokens + stats.outputTokens;
              const costPerK = totalTok > 0 ? (stats.costUsd / totalTok) * 1000 : 0;
              const costPerSession = stats.sessions > 0 ? stats.costUsd / stats.sessions : 0;
              return (
                <tr key={model} className="border-b border-border/50">
                  <td className="px-3 py-2 text-accent font-medium">{model}</td>
                  <td className="px-3 py-2 text-right text-text tabular-nums">{stats.sessions}</td>
                  <td className="px-3 py-2 text-right text-yellow tabular-nums">{formatCost(stats.costUsd)}</td>
                  <td className="px-3 py-2 text-right text-yellow/70 tabular-nums">{formatCost(costPerSession)}</td>
                  <td className="px-3 py-2 text-right text-cyan tabular-nums">{formatTokens(stats.inputTokens)}</td>
                  <td className="px-3 py-2 text-right text-cyan/70 tabular-nums">{formatTokens(stats.outputTokens)}</td>
                  <td className="px-3 py-2 text-right text-text2 tabular-nums">{formatTokens(totalTok)}</td>
                  <td className="px-3 py-2 text-right text-text2 tabular-nums">{formatCost(costPerK)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!models.length && (
          <div className="text-text2 text-xs py-8 text-center">
            No model data yet. SessionStart hooks and statusline data will populate this.
          </div>
        )}
      </div>
    </div>
  );
}
