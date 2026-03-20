import { useStats } from '@/api/hooks';
import { BarChart } from '@/components/Chart';

export function ToolsPage() {
  const { data, isLoading } = useStats();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading tools...</div>;
  }

  const sorted = Object.entries(data.toolBreakdown)
    .sort((a, b) => b[1] - a[1]);

  const chartData = sorted.map(([label, value]) => ({ label, value }));
  const totalCalls = sorted.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text">Tool Usage</h2>
        <span className="text-xs text-text2">{totalCalls} total calls across {data.totalSessions} sessions</span>
      </div>

      {/* Chart */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <h3 className="text-xs font-medium text-text2 mb-3">Call Frequency</h3>
        {chartData.length ? (
          <BarChart data={chartData} height={180} barColor="var(--color-purple)" />
        ) : (
          <div className="text-text2 text-xs py-8 text-center">No tool data yet</div>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text2">
              <th className="text-left px-3 py-2 font-medium w-8">#</th>
              <th className="text-left px-3 py-2 font-medium">Tool</th>
              <th className="text-right px-3 py-2 font-medium">Calls</th>
              <th className="text-right px-3 py-2 font-medium">% of Total</th>
              <th className="px-3 py-2 font-medium">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([tool, count], i) => {
              const pct = totalCalls > 0 ? (count / totalCalls) * 100 : 0;
              return (
                <tr key={tool} className="border-b border-border/50">
                  <td className="px-3 py-2 text-text2">{i + 1}</td>
                  <td className="px-3 py-2 text-purple font-medium">{tool}</td>
                  <td className="px-3 py-2 text-right text-text tabular-nums">{count}</td>
                  <td className="px-3 py-2 text-right text-text2 tabular-nums">{pct.toFixed(1)}%</td>
                  <td className="px-3 py-2">
                    <div className="w-full h-2 bg-surface2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!sorted.length && (
          <div className="text-text2 text-xs py-8 text-center">
            No tool usage data. PostToolUse hooks will populate this.
          </div>
        )}
      </div>
    </div>
  );
}
