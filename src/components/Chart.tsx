import { cn } from '@/lib/utils';

// Lightweight SVG bar chart
export function BarChart({
  data,
  height = 160,
  barColor = 'var(--color-accent)',
  className,
}: {
  data: { label: string; value: number }[];
  height?: number;
  barColor?: string;
  className?: string;
}) {
  if (!data.length) return <div className="text-text2 text-xs">No data</div>;

  const max = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(20, Math.min(60, 600 / data.length));
  const gap = 4;
  const svgWidth = data.length * (barWidth + gap);
  const chartH = height - 24;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <svg width={svgWidth} height={height} className="block">
        {data.map((d, i) => {
          const barH = (d.value / max) * chartH;
          const x = i * (barWidth + gap);
          const y = chartH - barH;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barWidth} height={barH}
                fill={barColor} rx={3} opacity={0.85}
              />
              <title>{`${d.label}: ${d.value}`}</title>
              <text
                x={x + barWidth / 2} y={height - 2}
                textAnchor="middle" fontSize={11} fill="var(--color-text2)"
              >
                {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
              </text>
              {d.value > 0 && (
                <text
                  x={x + barWidth / 2} y={y - 4}
                  textAnchor="middle" fontSize={11} fill="var(--color-text2)"
                >
                  {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}K` : d.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Lightweight SVG sparkline / area chart
export function SparkArea({
  values,
  width = 300,
  height = 60,
  color = 'var(--color-accent)',
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${pad + w},${pad + h} L ${pad},${pad + h} Z`;

  return (
    <svg width={width} height={height} className={cn('block', className)}>
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace(/[^a-z0-9]/g, '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />
    </svg>
  );
}

// Horizontal progress bar
export function ProgressBar({
  value,
  max,
  label,
  color = 'var(--color-accent)',
}: {
  value: number;
  max: number;
  label?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-text2 w-20 truncate">{label}</span>}
      <div className="flex-1 h-2 bg-surface2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-text2 tabular-nums w-12 text-right">{Math.round(pct)}%</span>
    </div>
  );
}
