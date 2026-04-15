'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get, patch } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Payment, PaymentStatus } from '@/lib/types';

type FilterStatus = 'ALL' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface Payout {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  destination: string | null;
  reference: string | null;
  createdAt: string;
  processedAt: string | null;
}

function statusTone(status: string): 'neutral' | 'warn' | 'success' | 'danger' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'PENDING' || status === 'PROCESSING') return 'warn';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  return 'neutral';
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('PENDING');
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    get<Payout[] | { items: Payout[] }>('/payments/payouts')
      .then((raw) => {
        const all = Array.isArray(raw) ? raw : ((raw as any).items ?? []);
        setPayouts(all);
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed to load payouts'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === 'ALL' ? payouts : payouts.filter((p) => p.status === filter);

  const pending = payouts.filter((p) => p.status === 'PENDING').length;
  const totalValue = payouts.filter((p) => p.status === 'PENDING').reduce((a, p) => a + p.amount, 0);
  const processedToday = payouts.filter((p) => {
    if (p.status !== 'COMPLETED' || !p.processedAt) return false;
    return new Date(p.processedAt).toDateString() === new Date().toDateString();
  }).length;
  const failed = payouts.filter((p) => p.status === 'FAILED').length;

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      await patch(`/payments/payouts/${id}/approve`, {});
      setPayouts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'COMPLETED', processedAt: new Date().toISOString() } : p)),
      );
    } catch {
      // ignore
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    setActing(id);
    try {
      await patch(`/payments/payouts/${id}/reject`, {});
      setPayouts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'FAILED' } : p)),
      );
    } catch {
      // ignore
    } finally {
      setActing(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Payout Queue"
        description="Review and approve agent payout requests."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Pending payouts" value={String(pending)} />
        <StatCard label="Pending value (KES)" value={formatMoney(totalValue, 'KES')} />
        <StatCard label="Processed today" value={String(processedToday)} />
        <StatCard label="Failed" value={String(failed)} />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['ALL', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:text-fg hover:bg-surface-2'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <div className="py-20 text-center text-muted text-sm">Loading payouts…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {payouts.length === 0 ? 'No payout data from backend.' : 'No payouts match this filter.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Amount (KES)</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Requested</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((payout) => (
                <tr key={payout.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{payout.agentName}</div>
                    <div className="text-xs text-muted">{payout.destination || payout.agentEmail}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-fg">{formatMoney(payout.amount, 'KES')}</td>
                  <td className="px-4 py-3 text-muted">{payout.method ?? 'M-Pesa'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(payout.status)}>{payout.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(payout.createdAt)}</td>
                  <td className="px-4 py-3">
                    {payout.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(payout.id)}
                          disabled={acting === payout.id}
                          className="rounded px-2 py-1 text-xs font-medium bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(payout.id)}
                          disabled={acting === payout.id}
                          className="rounded px-2 py-1 text-xs font-medium bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
