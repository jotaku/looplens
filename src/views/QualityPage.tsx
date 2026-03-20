import { useQuality } from '@/api/hooks';
import { StatCard } from '@/components/StatCard';
import { BarChart } from '@/components/Chart';
import { formatCost } from '@/lib/utils';
import { useLocation } from 'wouter';

export function QualityPage() {
  const { data, isLoading } = useQuality();
  const [, setLocation] = useLocation();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading quality data...</div>;
  }

  const { signals: sig, perSession } = data;

  if (!sig) {
    return (
      <div className="text-text2 text-sm py-8 text-center">
        No sessions yet. Quality signals will appear once sessions are recorded.
      </div>
    );
  }

  const completionChartData = [
    { label: 'Success', value: Math.round(sig.completionRate * data.sessions) },
    { label: 'Failed', value: Math.round(sig.failureRate * data.sessions) },
    { label: 'Unknown', value: data.sessions - Math.round(sig.completionRate * data.sessions) - Math.round(sig.failureRate * data.sessions) },
  ].filter(d => d.value > 0);

  const efficiencyData = perSession
    .filter(s => s.costPerLine != null)
    .slice(0, 15)
    .map(s => ({
      label: s.sessionId.slice(0, 6),
      value: Math.round((s.costPerLine! * 100) * 100) / 100,
    }));

  return (
    <div>
      <h2 className="text-lg font-semibold text-text mb-6">Quality Signals</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Completion Rate"
          value={`${(sig.completionRate * 100).toFixed(0)}%`}
          accent={sig.completionRate >= 0.8 ? 'green' : sig.completionRate >= 0.5 ? 'yellow' : 'red'}
        />
        <StatCard
          label="Tool Error Rate"
          value={`${(sig.toolErrorRate * 100).toFixed(1)}%`}
          accent={sig.toolErrorRate <= 0.05 ? 'green' : sig.toolErrorRate <= 0.2 ? 'yellow' : 'red'}
        />
        <StatCard
          label="Avg Cost / Line"
          value={sig.avgCostPerLine != null ? `${(sig.avgCostPerLine * 100).toFixed(2)}¢` : '—'}
          accent="yellow"
        />
        <StatCard
          label="Avg Tokens / Line"
          value={sig.avgTokensPerLine != null ? `${sig.avgTokensPerLine.toFixed(0)}` : '—'}
          accent="cyan"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Tool Calls" value={sig.totalToolCalls} />
        <StatCard label="Tool Errors" value={sig.totalToolErrors} accent={sig.totalToolErrors > 0 ? 'red' : 'green'} />
        <StatCard label="Lines Changed" value={sig.totalLinesChanged} accent="purple" />
        <StatCard label="Avg Turns / Session" value={sig.avgTurnsPerSession.toFixed(1)} accent="accent" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Session Completion</h3>
          <BarChart
            data={completionChartData}
            height={140}
            barColor="var(--color-green)"
          />
        </div>

        {efficiencyData.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-xs font-medium text-text2 mb-3">Cost per Line (¢) — by Session</h3>
            <BarChart
              data={efficiencyData}
              height={140}
              barColor="var(--color-yellow)"
            />
          </div>
        )}
      </div>

      {/* Per-session table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text2">
              <th className="text-left px-3 py-2 font-medium">Session</th>
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
              <th className="text-right px-3 py-2 font-medium">Lines</th>
              <th className="text-right px-3 py-2 font-medium">¢/line</th>
              <th className="text-right px-3 py-2 font-medium">tok/line</th>
              <th className="text-right px-3 py-2 font-medium">Tool Calls</th>
              <th className="text-right px-3 py-2 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {perSession.map(row => (
              <tr
                key={row.sessionId}
                className="border-b border-border/50 hover:bg-surface2 cursor-pointer"
                onClick={() => setLocation(`/sessions/${row.sessionId}`)}
              >
                <td className="px-3 py-2 font-mono text-accent">{row.sessionId.slice(0, 8)}</td>
                <td className="px-3 py-2 text-text2">{row.model}</td>
                <td className="px-3 py-2">
                  <span className={`font-medium ${
                    row.completionStatus === 'success' ? 'text-green' :
                    row.completionStatus === 'failure' ? 'text-red' : 'text-text2'
                  }`}>
                    {row.completionStatus === 'success' ? '✓' :
                     row.completionStatus === 'failure' ? '✗' : '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-yellow tabular-nums">{formatCost(row.cost)}</td>
                <td className="px-3 py-2 text-right text-purple tabular-nums">{row.linesChanged}</td>
                <td className="px-3 py-2 text-right text-yellow tabular-nums">
                  {row.costPerLine != null ? `${(row.costPerLine * 100).toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right text-cyan tabular-nums">
                  {row.tokensPerLine != null ? row.tokensPerLine.toFixed(0) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-text2 tabular-nums">{row.toolCalls}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={row.toolErrors > 0 ? 'text-red' : 'text-green'}>
                    {row.toolErrors}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!perSession.length && (
          <div className="text-text2 text-xs py-8 text-center">No sessions recorded yet.</div>
        )}
      </div>
    </div>
  );
}
