import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'brand';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  success: 'bg-success/15 text-success border-success/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  brand: 'bg-brand/15 text-brand border-brand/30',
};

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function statusTone(status?: string): Tone {
  if (!status) return 'neutral';
  const s = status.toUpperCase();
  if (['ACTIVE', 'APPROVED', 'COMPLETED', 'ONLINE', 'RESOLVED'].includes(s)) return 'success';
  if (['PENDING', 'PROCESSING', 'IN_PROGRESS', 'UNDER_REVIEW', 'REVIEW', 'PENDING_KYC', 'ASSIGNED'].includes(s)) return 'warn';
  if (['SUSPENDED', 'REJECTED', 'FAILED', 'CANCELLED', 'DISPUTED', 'ESCALATED', 'DEACTIVATED'].includes(s)) return 'danger';
  if (['OPEN', 'DRAFT'].includes(s)) return 'info';
  return 'neutral';
}
