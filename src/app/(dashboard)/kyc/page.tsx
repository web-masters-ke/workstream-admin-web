'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get, patch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Agent, KycStatus } from '@/lib/types';

function kycTone(status: KycStatus): 'warn' | 'success' | 'danger' | 'neutral' {
  if (status === 'PENDING') return 'warn';
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'neutral';
}

type KycFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_STARTED';

export default function KycPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<KycFilter>('PENDING');
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    get<Agent[] | { items: Agent[] }>('/agents')
      .catch(() => [] as Agent[])
      .then((raw) => {
        setAgents(Array.isArray(raw) ? raw : ((raw as { items: Agent[] }).items ?? []));
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed to load agents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === 'ALL' ? agents : agents.filter((a) => a.kycStatus === filter);

  const pending = agents.filter((a) => a.kycStatus === 'PENDING').length;
  const approvedThisWeek = agents.filter((a) => {
    if (a.kycStatus !== 'APPROVED') return false;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(a.updatedAt).getTime() > weekAgo;
  }).length;
  const rejected = agents.filter((a) => a.kycStatus === 'REJECTED').length;

  const handleKyc = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setActing(id);
    try {
      await patch(`/admin/agents/${id}/kyc`, { status });
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, kycStatus: status } : a)),
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
        title="KYC Verification Queue"
        description="Review agent identity verification submissions."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Pending review" value={String(pending)} />
        <StatCard label="Approved this week" value={String(approvedThisWeek)} />
        <StatCard label="Rejected" value={String(rejected)} />
        <StatCard label="Total agents" value={String(agents.length)} />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'NOT_STARTED'] as KycFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:text-fg hover:bg-surface-2'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading && <div className="py-20 text-center text-muted text-sm">Loading KYC queue…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {agents.length === 0 ? 'No agents from backend.' : 'No agents match this KYC filter.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Agent Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3 text-left">KYC Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((agent) => {
                const anyA = agent as any;
                const displayName = agent.fullName || anyA.user?.name || [anyA.user?.firstName, anyA.user?.lastName].filter(Boolean).join(' ') || anyA.user?.email || '—';
                const displayEmail = agent.email || anyA.user?.email || '—';
                return (
                <tr key={agent.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-medium text-fg">{displayName}</td>
                  <td className="px-4 py-3 text-muted">{displayEmail}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(agent.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={kycTone(agent.kycStatus)}>{agent.kycStatus.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {agent.kycStatus === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleKyc(agent.id, 'APPROVED')}
                          disabled={acting === agent.id}
                          className="rounded px-2 py-1 text-xs font-medium bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleKyc(agent.id, 'REJECTED')}
                          disabled={acting === agent.id}
                          className="rounded px-2 py-1 text-xs font-medium bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
