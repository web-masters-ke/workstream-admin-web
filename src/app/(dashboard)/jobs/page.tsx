'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { get, patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Job {
  id: string;
  title: string;
  description?: string;
  businessId?: string;
  businessName?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  agentCount?: number;
  slaHours?: number;
  createdAt: string;
  updatedAt?: string;
}

type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

function priorityTone(p?: string): 'neutral' | 'info' | 'warn' | 'danger' {
  if (p === 'LOW') return 'neutral';
  if (p === 'MEDIUM') return 'info';
  if (p === 'HIGH') return 'warn';
  if (p === 'URGENT') return 'danger';
  return 'neutral';
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  async function cancelJob(id: string) {
    if (!confirm('Cancel this job? Assigned agents will be notified.')) return;
    setActing(id);
    try {
      await patch(`/jobs/${id}`, { status: 'CANCELLED' });
      setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: 'CANCELLED' } : j));
    } catch { alert('Failed — backend may be unavailable.'); }
    finally { setActing(null); }
  }

  async function publishJob(id: string) {
    setActing(id);
    try {
      await patch(`/jobs/${id}`, { status: 'PUBLISHED' });
      setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: 'PUBLISHED' } : j));
    } catch { alert('Failed — backend may be unavailable.'); }
    finally { setActing(null); }
  }

  async function forceComplete(id: string) {
    if (!confirm('Force-complete this job? This cannot be undone.')) return;
    setActing(id);
    try {
      await patch(`/jobs/${id}`, { status: 'COMPLETED' });
      setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: 'COMPLETED' } : j));
    } catch { alert('Failed — backend may be unavailable.'); }
    finally { setActing(null); }
  }

  const load = () => {
    setLoading(true);
    setError(null);
    get<Job[] | { items: Job[] }>('/jobs')
      .catch(() => [] as Job[])
      .then((raw) => {
        setJobs(Array.isArray(raw) ? raw : ((raw as { items: Job[] }).items ?? []));
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed to load jobs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = jobs.filter((j) => {
    const matchStatus = filter === 'ALL' || j.status === filter;
    const matchSearch = !search ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.businessName ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const total = jobs.length;
  const published = jobs.filter((j) => j.status === 'PUBLISHED').length;
  const inProgress = jobs.filter((j) => j.status === 'IN_PROGRESS').length;
  const completed = jobs.filter((j) => j.status === 'COMPLETED').length;

  return (
    <>
      <PageHeader
        title="Jobs Management"
        description="All job postings created by businesses on the platform."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Total jobs" value={String(total)} />
        <StatCard label="Published" value={String(published)} />
        <StatCard label="In progress" value={String(inProgress)} />
        <StatCard label="Completed" value={String(completed)} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search jobs or business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as StatusFilter[]).map((s) => (
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

      {loading && <div className="py-20 text-center text-muted text-sm">Loading jobs…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {jobs.length === 0 ? 'No jobs available from backend.' : 'No jobs match current filters.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Job Title</th>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Agents</th>
                <th className="px-4 py-3 text-left">SLA (hrs)</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((job) => (
                <>
                  <tr
                    key={job.id}
                    className="hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                  >
                    <td className="px-4 py-3 font-medium text-fg">{job.title}</td>
                    <td className="px-4 py-3 text-muted">{job.businessName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(job.status)}>{job.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {job.priority ? (
                        <Badge tone={priorityTone(job.priority)}>{job.priority}</Badge>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted">{job.agentCount ?? 0}</td>
                    <td className="px-4 py-3 text-muted">{job.slaHours ?? '—'}</td>
                    <td className="px-4 py-3 text-muted text-xs">{formatDate(job.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {job.status === 'DRAFT' && (
                          <Button size="sm" onClick={() => publishJob(job.id)} disabled={acting === job.id}>Publish</Button>
                        )}
                        {job.status === 'IN_PROGRESS' && (
                          <Button size="sm" variant="outline" onClick={() => forceComplete(job.id)} disabled={acting === job.id}>Force complete</Button>
                        )}
                        {['DRAFT', 'PUBLISHED', 'IN_PROGRESS'].includes(job.status) && (
                          <Button size="sm" variant="danger" onClick={() => cancelJob(job.id)} disabled={acting === job.id}>Cancel</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === job.id && (
                    <tr key={`${job.id}-detail`}>
                      <td colSpan={8} className="px-4 py-4 bg-surface-2">
                        <div className="text-sm text-muted">
                          <span className="font-medium text-fg">Description:</span>{' '}
                          {job.description ?? 'No description provided.'}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          ID: {job.id} &middot; Updated: {formatDate(job.updatedAt)}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
