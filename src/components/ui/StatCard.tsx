import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: number;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, hint, trend, icon, className }: StatCardProps) {
  const trendColor = trend == null ? '' : trend >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4', className)}>
      <div className="flex items-start justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        {icon && <div className="text-muted">{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-semibold text-fg">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {trend != null && <span className={trendColor}>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</span>}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
