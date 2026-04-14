'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { get, post } from '@/lib/api';
import { formatDate, toFixed } from '@/lib/format';

interface SlaTask {
  id: string;
  title: string;
  businessName?: string;
  agentName?: string;
  slaPercent: number;
  timeElapsed: string;
  status: 'BREACHED' | 'AT_RISK' | 'ON_TRACK';
  dueAt?: string;
}

interface OverviewData {
  slaBreaches?: number;
  atRiskTasks?: number;
  avgSlaHealth?: number;
  avgResolutionTime?: string;
}

type FilterStatus = 'ALL' | 'BREACHED' | 'AT_RISK' | 'ON_TRACK';

function slaTone(status: SlaTask['status']) {
  if (status === 'BREACHED') return 'danger';
  if (status === 'AT_RISK') return 'warn';
  return 'success';
}

function slaBarColor(pct: number) {
  if (pct >= 100) return 'bg-danger';
  if (pct > 75) return 'bg-warn';
  return 'bg-success';
}

export default function SlaPage() {
  const [tasks, setTasks] = useState<SlaTask[]>([]);
  const [overview, setOverview] = useState<OverviewData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  async function escalate(id: string) {
    setActing(id);
    try {
      await post(`/tasks/${id}/escalate`, { reason: 'SLA breach — admin escalation' });
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: 'BREACHED' } : t));
    } catch { alert('Escalation failed — backend may be unavailable.'); }
    finally { setActing(null); }
  }

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      get<OverviewData>('/analytics/overview').catch(() => ({})),
      get<SlaTask[] | { items: SlaTask[] }>('/tasks/sla').catch(() => [] as SlaTask[]),
    ]).then(([ov, raw]) => {
      setOverview(ov as OverviewData);
      const items: SlaTask[] = Array.isArray(raw) ? raw : ((raw as { items: SlaTask[] }).items ?? []);
      // If backend returns empty, build mock-ish derived view from overview
      setTasks(items);
    }).catch((e: Error) => {
      setError(e?.message ?? 'Failed to load SLA data');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = tasks.filter((t) => {
    const matchStatus = filter === 'ALL' || t.status === filter;
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.businessName ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const breached = tasks.filter((t) => t.status === 'BREACHED').length;
  const atRisk = tasks.filter((t) => t.status === 'AT_RISK').length;
  const onTrack = tasks.filter((t) => t.status === 'ON_TRACK').length;

  return (
    <>
      <PageHeader
        title="SLA Alerts"
        description="Monitor tasks that have breached or are at risk of breaching SLA."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Breached today" value={String(overview.slaBreaches ?? breached)} />
        <StatCard label="At-risk tasks" value={String(overview.atRiskTasks ?? atRisk)} />
        <StatCard label="On track" value={String(onTrack)} />
        <StatCard label="Avg SLA health" value={overview.avgSlaHealth != null ? `${toFixed(overview.avgSlaHealth, 0)}%` : '—'} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search task or business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="flex gap-2">
          {(['ALL', 'BREACHED', 'AT_RISK', 'ON_TRACK'] as FilterStatus[]).map((s) => (
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
      </div>

      {loading && (
        <div className="py-20 text-center text-muted text-sm">Loading SLA data…</div>
      )}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {tasks.length === 0 ? 'No SLA data available from backend.' : 'No tasks match the current filters.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Task</th>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">SLA %</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((task) => (
                <tr key={task.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-medium text-fg truncate max-w-[200px]">{task.title}</td>
                  <td className="px-4 py-3 text-muted">{task.businessName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{task.agentName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${slaBarColor(task.slaPercent)}`}
                          style={{ width: `${Math.min(task.slaPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted">{toFixed(task.slaPercent, 0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(task.dueAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={slaTone(task.status)}>{task.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {task.status !== 'BREACHED' && (
                      <button
                        onClick={() => escalate(task.id)}
                        disabled={acting === task.id}
                        className="rounded px-2.5 py-1 text-[11px] font-semibold text-danger border border-danger/40 hover:bg-danger/10 disabled:opacity-40"
                      >
                        Escalate
                      </button>
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
