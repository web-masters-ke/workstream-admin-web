'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Business } from '@/lib/types';

interface SubscribedBusiness extends Business {
  plan?: 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'TRIAL';
  mrr?: number;
  renewalDate?: string;
  subscriptionStatus?: 'ACTIVE' | 'CHURNED' | 'TRIAL' | 'SUSPENDED';
}

function planTone(plan?: string): 'neutral' | 'info' | 'success' | 'brand' {
  if (plan === 'STARTER') return 'neutral';
  if (plan === 'GROWTH') return 'info';
  if (plan === 'ENTERPRISE') return 'brand';
  if (plan === 'TRIAL') return 'success';
  return 'neutral';
}

function subStatusTone(status?: string): 'success' | 'danger' | 'warn' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'CHURNED') return 'danger';
  if (status === 'TRIAL') return 'warn';
  return 'neutral';
}

type PlanCount = { STARTER: number; GROWTH: number; ENTERPRISE: number; TRIAL: number };

export default function SubscriptionsPage() {
  const [businesses, setBusinesses] = useState<SubscribedBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    get<SubscribedBusiness[] | { items: SubscribedBusiness[] }>('/businesses')
      .catch(() => [] as SubscribedBusiness[])
      .then((raw) => {
        setBusinesses(Array.isArray(raw) ? raw : ((raw as { items: SubscribedBusiness[] }).items ?? []));
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed to load subscriptions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = businesses.filter((b) => b.subscriptionStatus === 'ACTIVE' || b.status === 'APPROVED').length;
  const mrr = businesses.reduce((a, b) => a + (b.mrr ?? 0), 0);
  const churned = businesses.filter((b) => b.subscriptionStatus === 'CHURNED').length;
  const trial = businesses.filter((b) => b.subscriptionStatus === 'TRIAL' || b.plan === 'TRIAL').length;

  const planCounts: PlanCount = businesses.reduce<PlanCount>(
    (acc, b) => {
      const plan = b.plan ?? 'STARTER';
      if (plan in acc) acc[plan as keyof PlanCount]++;
      return acc;
    },
    { STARTER: 0, GROWTH: 0, ENTERPRISE: 0, TRIAL: 0 },
  );

  return (
    <>
      <PageHeader
        title="Subscription Management"
        description="Business subscription plans, MRR, and churn overview."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Active subscribers" value={String(active)} />
        <StatCard label="MRR (KES)" value={formatMoney(mrr, 'KES')} />
        <StatCard label="Churned this month" value={String(churned)} />
        <StatCard label="Trial users" value={String(trial)} />
      </div>

      {/* Plan breakdown */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['STARTER', 'GROWTH', 'ENTERPRISE', 'TRIAL'] as const).map((plan) => (
          <div key={plan} className="rounded-lg border border-border bg-surface p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{plan}</div>
            <div className="text-2xl font-semibold text-fg">{planCounts[plan]}</div>
            <div className="mt-1">
              <Badge tone={planTone(plan)}>{plan}</Badge>
            </div>
          </div>
        ))}
      </div>

      {loading && <div className="py-20 text-center text-muted text-sm">Loading subscriptions…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && businesses.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          No subscription data from backend.
        </div>
      )}
      {!loading && !error && businesses.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">MRR (KES)</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Renewal</th>
                <th className="px-4 py-3 text-left">Agents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {businesses.map((biz) => (
                <tr key={biz.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-medium text-fg">{biz.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={planTone(biz.plan)}>{biz.plan ?? 'STARTER'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatMoney(biz.mrr ?? 0, 'KES')}</td>
                  <td className="px-4 py-3">
                    <Badge tone={subStatusTone(biz.subscriptionStatus ?? biz.status)}>
                      {biz.subscriptionStatus ?? biz.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(biz.renewalDate)}</td>
                  <td className="px-4 py-3 text-muted">{biz.agentCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
