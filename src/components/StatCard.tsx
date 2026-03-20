import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green' | 'red' | 'yellow' | 'purple' | 'cyan' | 'accent';
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-text2 mb-1">{label}</div>
      <div className={cn(
        'text-lg font-semibold tabular-nums',
        accent === 'green' && 'text-green',
        accent === 'red' && 'text-red',
        accent === 'yellow' && 'text-yellow',
        accent === 'purple' && 'text-purple',
        accent === 'cyan' && 'text-cyan',
        accent === 'accent' && 'text-accent',
        !accent && 'text-text',
      )}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-text2 mt-0.5">{sub}</div>}
    </div>
  );
}
