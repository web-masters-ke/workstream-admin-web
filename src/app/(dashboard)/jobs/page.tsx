'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, post, patch, del, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  title: string;
  description?: string;
  businessId?: string | null;
  businessName?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  slaMinutes?: number | null;
  tags?: string[];
  createdAt: string;
  dueAt?: string | null;
}

interface Business {
  id: string;
  name: string;
}

type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type JobStatus = Job['status'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function priorityTone(p?: string): 'neutral' | 'info' | 'warn' | 'danger' {
  if (p === 'LOW') return 'neutral';
  if (p === 'MEDIUM') return 'info';
  if (p === 'HIGH') return 'warn';
  if (p === 'URGENT') return 'danger';
  return 'neutral';
}

function slaDisplay(minutes?: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.round(minutes / 60);
  return `${h}h`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Create drawer form state ─────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'MEDIUM' as Priority,
  slaHours: '',
  dueAt: '',
  scope: 'all' as 'all' | 'specific',
  businessId: '',
  tags: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  // Create drawer
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [bizLoading, setBizLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit drawer
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', priority: 'MEDIUM' as Priority });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Row-level action state
  const [acting, setActing] = useState<string | null>(null);

  // ── Load jobs ──────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    get<Job[] | { items: Job[] }>('/jobs')
      .then((raw) => {
        setJobs(Array.isArray(raw) ? raw : ((raw as { items: Job[] }).items ?? []));
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Load businesses (deferred until drawer opens) ─────────────────────────
  function ensureBusinesses() {
    if (businesses.length > 0) return;
    setBizLoading(true);
    get<Business[] | { items: Business[] }>('/businesses?limit=100')
      .then((raw) => {
        setBusinesses(Array.isArray(raw) ? raw : ((raw as { items: Business[] }).items ?? []));
      })
      .catch(() => {})
      .finally(() => setBizLoading(false));
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setSaveError(null);
    ensureBusinesses();
    setShowCreate(true);
  }

  function openEdit(job: Job) {
    setEditForm({
      title: job.title,
      description: job.description ?? '',
      priority: job.priority ?? 'MEDIUM',
    });
    setEditError(null);
    setEditJob(job);
    ensureBusinesses();
  }

  // ── Create job ────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!form.title.trim()) { setSaveError('Title is required.'); return; }
    if (!form.businessId) { setSaveError('Please select an organisation for this job.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        slaMinutes: form.slaHours ? Number(form.slaHours) * 60 : undefined,
        dueAt: form.dueAt || undefined,
        businessId: form.businessId,
        tags: form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined,
      };
      const created = await post<Job>('/jobs', payload);
      setJobs((prev) => [created, ...prev]);
      setShowCreate(false);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Edit job ──────────────────────────────────────────────────────────────
  async function handleEdit() {
    if (!editJob) return;
    if (!editForm.title.trim()) { setEditError('Title is required.'); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await patch<Job>(`/jobs/${editJob.id}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        priority: editForm.priority,
      });
      setJobs((prev) => prev.map((j) => j.id === editJob.id ? { ...j, ...updated } : j));
      setEditJob(null);
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setEditSaving(false);
    }
  }

  // ── Status transitions ────────────────────────────────────────────────────
  async function changeStatus(id: string, status: JobStatus, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActing(id);
    try {
      await patch(`/jobs/${id}`, { status });
      setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status } : j));
      // Keep edit drawer in sync
      if (editJob?.id === id) setEditJob((prev) => prev ? { ...prev, status } : prev);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setActing(null);
    }
  }

  // ── Delete job ────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('Permanently delete this job? This cannot be undone.')) return;
    setActing(id);
    try {
      await del(`/jobs/${id}`);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (editJob?.id === id) setEditJob(null);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setActing(null);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = jobs.filter((j) => {
    const matchStatus = filter === 'ALL' || j.status === filter;
    const matchSearch = !search ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.businessName ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const today = todayIso();
  const totalCount = jobs.length;
  const publishedCount = jobs.filter((j) => j.status === 'PUBLISHED').length;
  const inProgressCount = jobs.filter((j) => j.status === 'IN_PROGRESS').length;
  const completedTodayCount = jobs.filter(
    (j) => j.status === 'COMPLETED' && (j.dueAt ?? j.createdAt)?.slice(0, 10) === today,
  ).length;

  const STATUS_TABS: StatusFilter[] = ['ALL', 'DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Jobs Management"
        description="All job postings on the platform — create, publish and manage lifecycle."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
            <Button size="sm" onClick={openCreate}>+ Create Job</Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Total jobs" value={String(totalCount)} />
        <StatCard label="Published" value={String(publishedCount)} />
        <StatCard label="In progress" value={String(inProgressCount)} />
        <StatCard label="Completed today" value={String(completedTodayCount)} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search title or business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((s) => (
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
        <div className="ml-auto text-xs text-muted">{filtered.length} of {totalCount}</div>
      </div>

      {/* Body states */}
      {loading && (
        <div className="py-20 text-center text-muted text-sm">Loading jobs…</div>
      )}
      {!loading && error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {jobs.length === 0 ? 'No jobs yet — create one above.' : 'No jobs match current filters.'}
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Job Title</th>
                <th className="px-4 py-3 text-left">Scope</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">SLA</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((job) => (
                <tr key={job.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{job.title}</div>
                    {job.description && (
                      <div className="text-xs text-muted truncate max-w-[240px]">{job.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {job.businessName ? (
                      <span title={job.businessId ?? ''}>{job.businessName}</span>
                    ) : (
                      <span className="text-muted italic">Platform-wide</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(job.status)}>{job.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {job.priority ? (
                      <Badge tone={priorityTone(job.priority)}>{job.priority}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{slaDisplay(job.slaMinutes)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(job.dueAt ?? undefined)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(job.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(job)}
                        disabled={acting === job.id}
                      >
                        Edit
                      </Button>
                      {/* Publish */}
                      {job.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          onClick={() => changeStatus(job.id, 'PUBLISHED')}
                          disabled={acting === job.id}
                          loading={acting === job.id}
                        >
                          Publish
                        </Button>
                      )}
                      {/* Complete */}
                      {(job.status === 'IN_PROGRESS' || job.status === 'PUBLISHED') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => changeStatus(job.id, 'COMPLETED', 'Mark this job as completed?')}
                          disabled={acting === job.id}
                          loading={acting === job.id}
                        >
                          Complete
                        </Button>
                      )}
                      {/* Cancel */}
                      {['DRAFT', 'PUBLISHED', 'IN_PROGRESS'].includes(job.status) && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            changeStatus(
                              job.id,
                              'CANCELLED',
                              'Cancel this job? Assigned agents will be notified.',
                            )
                          }
                          disabled={acting === job.id}
                          loading={acting === job.id}
                        >
                          Cancel
                        </Button>
                      )}
                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(job.id)}
                        disabled={acting === job.id}
                        loading={acting === job.id}
                        className="text-danger hover:text-danger"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Job Drawer ─────────────────────────────────────────────── */}
      <Drawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Job"
        width="w-[540px]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-danger">{saveError}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} loading={saving}>
                Create Job
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Title <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="e.g. Senior Customer Support Agent"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Job details, requirements, responsibilities…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Priority
            </label>
            <Select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
              className="w-full"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </div>

          {/* SLA + Due date — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                SLA (hours)
              </label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 24"
                value={form.slaHours}
                onChange={(e) => setForm((f) => ({ ...f, slaHours: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                Due date
              </label>
              <Input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
              />
            </div>
          </div>

          {/* Organisation (always required) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Organisation <span className="text-danger">*</span>
            </label>
            {bizLoading ? (
              <div className="text-xs text-muted py-1">Loading organisations…</div>
            ) : (
              <Select
                value={form.businessId}
                onChange={(e) => setForm((f) => ({ ...f, businessId: e.target.value }))}
                className="w-full"
              >
                <option value="">Select an organisation…</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            )}
            <p className="mt-1 text-[11px] text-muted">Every job must belong to an organisation. To make it visible to all agents, set scope to Marketplace.</p>
          </div>

          {/* Scope radio */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted uppercase tracking-wider">
              Agent visibility
            </label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-3 hover:bg-surface-2 transition-colors">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={form.scope === 'all'}
                  onChange={() => setForm((f) => ({ ...f, scope: 'all' }))}
                  className="accent-brand"
                />
                <div>
                  <div className="text-sm font-medium text-fg">Marketplace (all agents can see &amp; bid)</div>
                  <div className="text-xs text-muted">Free agents and org agents alike can apply for this job</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-3 hover:bg-surface-2 transition-colors">
                <input
                  type="radio"
                  name="scope"
                  value="specific"
                  checked={form.scope === 'specific'}
                  onChange={() => setForm((f) => ({ ...f, scope: 'specific' }))}
                  className="accent-brand"
                />
                <div>
                  <div className="text-sm font-medium text-fg">Private (org agents only)</div>
                  <div className="text-xs text-muted">Only agents in the selected organisation can see this job</div>
                </div>
              </label>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Tags (comma-separated)
            </label>
            <Input
              placeholder="e.g. remote, entry-level, finance"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            />
          </div>
        </div>
      </Drawer>

      {/* ── Edit Job Drawer ───────────────────────────────────────────────── */}
      <Drawer
        open={!!editJob}
        onClose={() => setEditJob(null)}
        title={editJob ? `Edit: ${editJob.title}` : 'Edit Job'}
        width="w-[540px]"
        footer={
          editJob && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick status actions in footer */}
              {editJob.status === 'DRAFT' && (
                <Button
                  size="sm"
                  onClick={() => changeStatus(editJob.id, 'PUBLISHED')}
                  disabled={acting === editJob.id}
                  loading={acting === editJob.id}
                >
                  Publish
                </Button>
              )}
              {(editJob.status === 'IN_PROGRESS' || editJob.status === 'PUBLISHED') && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    changeStatus(editJob.id, 'COMPLETED', 'Mark this job as completed?')
                  }
                  disabled={acting === editJob.id}
                  loading={acting === editJob.id}
                >
                  Complete
                </Button>
              )}
              {['DRAFT', 'PUBLISHED', 'IN_PROGRESS'].includes(editJob.status) && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    changeStatus(
                      editJob.id,
                      'CANCELLED',
                      'Cancel this job? Assigned agents will be notified.',
                    )
                  }
                  disabled={acting === editJob.id}
                  loading={acting === editJob.id}
                >
                  Cancel
                </Button>
              )}
              {(editJob.status === 'COMPLETED' || editJob.status === 'CANCELLED') && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    changeStatus(editJob.id, 'PUBLISHED', 'Reopen this job?')
                  }
                  disabled={acting === editJob.id}
                  loading={acting === editJob.id}
                >
                  Reopen
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(editJob.id)}
                disabled={acting === editJob.id}
                loading={acting === editJob.id}
                className="text-danger hover:text-danger ml-auto"
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditJob(null)}
              >
                Discard
              </Button>
              <Button size="sm" onClick={handleEdit} loading={editSaving}>
                Save changes
              </Button>
            </div>
          )
        }
      >
        {editJob && (
          <div className="space-y-4">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
              <Badge tone={statusTone(editJob.status)}>{editJob.status.replace('_', ' ')}</Badge>
              {editJob.priority && (
                <Badge tone={priorityTone(editJob.priority)}>{editJob.priority}</Badge>
              )}
              <span className="text-muted">
                {editJob.businessName ? `Scoped to: ${editJob.businessName}` : 'Platform-wide'}
              </span>
              <span className="ml-auto text-muted">SLA: {slaDisplay(editJob.slaMinutes)}</span>
            </div>

            {editError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {editError}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                Title <span className="text-danger">*</span>
              </label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                Description
              </label>
              <textarea
                rows={4}
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                Priority
              </label>
              <Select
                value={editForm.priority}
                onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                className="w-full"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </div>

            {/* Read-only details */}
            <div className="space-y-2 border-t border-border pt-4">
              <InfoRow label="Due date">{formatDate(editJob.dueAt ?? undefined)}</InfoRow>
              <InfoRow label="Created">{formatDate(editJob.createdAt)}</InfoRow>
              <InfoRow label="ID"><span className="font-mono text-xs">{editJob.id}</span></InfoRow>
              {editJob.tags && editJob.tags.length > 0 && (
                <InfoRow label="Tags">
                  <div className="flex flex-wrap gap-1">
                    {editJob.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                </InfoRow>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

// ─── Small helper component ───────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 text-sm">
      <div className="text-[11px] uppercase tracking-wider text-muted pt-0.5">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}
