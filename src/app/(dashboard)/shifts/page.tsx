'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { StatCard } from '@/components/ui/StatCard';
import { get, post, patch, del, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ─── Types ───────────────────────────────────────────────────────────────────

type ShiftStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ABSENT' | 'CANCELLED';

interface Shift {
  id: string;
  agentId: string;
  agentName: string;
  businessId?: string | null;
  businessName?: string | null;
  workspaceId?: string;
  startAt: string;
  endAt: string;
  status: ShiftStatus;
  notes?: string;
}

interface AgentOption {
  id: string;
  userId: string;
  user: { name: string; email: string };
}

interface BusinessOption {
  id: string;
  name: string;
}

interface ShiftForm {
  agentId: string;
  businessId: string;
  startAt: string;
  endAt: string;
  notes: string;
}

type DrawerMode = 'create' | 'edit';
type StatusFilter = 'ALL' | ShiftStatus;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toLocalDatetimeInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function computeDuration(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '—';
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function shiftBadgeTone(status: ShiftStatus): 'brand' | 'warn' | 'success' | 'neutral' | 'danger' {
  switch (status) {
    case 'SCHEDULED': return 'warn';
    case 'ACTIVE':    return 'success';
    case 'COMPLETED': return 'neutral';
    case 'ABSENT':    return 'danger';
    case 'CANCELLED': return 'neutral';
  }
}

const EMPTY_FORM: ShiftForm = {
  agentId: '',
  businessId: '',
  startAt: '',
  endAt: '',
  notes: '',
};

const PAGE_SIZE = 20;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  // --- data state ---
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // --- filter state ---
  const [dateFilter, setDateFilter] = useState<string>(todayIso());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [agentSearch, setAgentSearch] = useState('');
  const [businessFilter, setBusinessFilter] = useState('');

  // --- reference data ---
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  // --- drawer state ---
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- confirm delete ---
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- status transition loading (per shift id) ---
  const [transitioning, setTransitioning] = useState<Record<string, boolean>>({});

  // ── Load reference data once ──────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [agentsData, bizData] = await Promise.all([
          get<AgentOption[] | { items: AgentOption[] }>('/agents?limit=100'),
          get<BusinessOption[] | { items: BusinessOption[] }>('/businesses?limit=100'),
        ]);
        setAgents(Array.isArray(agentsData) ? agentsData : agentsData.items);
        setBusinesses(Array.isArray(bizData) ? bizData : bizData.items);
      } catch {
        // silently swallow — page still works without these
      }
    })();
  }, []);

  // ── Load shifts ───────────────────────────────────────────────────────────

  const loadShifts = useCallback(async (resetPage = true) => {
    setLoading(true);
    setLoadError(null);
    const currentPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(PAGE_SIZE),
    });
    if (dateFilter) params.set('date', dateFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);

    try {
      const data = await get<Shift[] | { items: Shift[]; total?: number }>(`/workforce/shifts?${params}`);
      const items: Shift[] = Array.isArray(data) ? data : data.items;
      if (resetPage) {
        setRows(items);
      } else {
        setRows((prev) => [...prev, ...items]);
      }
      setHasMore(items.length === PAGE_SIZE);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter, page]);

  useEffect(() => {
    loadShifts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, statusFilter]);

  // ── Derived stats (from today's rows, client-side) ────────────────────────

  const todayRows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((r) => r.startAt.slice(0, 10) === today);
  }, [rows]);

  const statTotalToday = todayRows.length;
  const statActiveNow = todayRows.filter((r) => r.status === 'ACTIVE').length;
  const statScheduled = todayRows.filter((r) => r.status === 'SCHEDULED').length;
  const statAbsent = todayRows.filter((r) => r.status === 'ABSENT').length;
  const absentRate = statTotalToday > 0 ? ((statAbsent / statTotalToday) * 100).toFixed(0) : '0';

  // ── Client-side agent search filter ──────────────────────────────────────

  const filtered = useMemo(() => {
    if (!agentSearch && !businessFilter) return rows;
    return rows.filter((r) => {
      if (agentSearch && !r.agentName.toLowerCase().includes(agentSearch.toLowerCase())) return false;
      if (businessFilter && r.businessId !== businessFilter) return false;
      return true;
    });
  }, [rows, agentSearch, businessFilter]);

  // ── Status transitions ────────────────────────────────────────────────────

  async function transitionStatus(shift: Shift, newStatus: ShiftStatus) {
    setTransitioning((prev) => ({ ...prev, [shift.id]: true }));
    try {
      const updated = await patch<Shift>(`/workforce/shifts/${shift.id}`, { status: newStatus });
      setRows((prev) => prev.map((r) => (r.id === shift.id ? { ...r, ...updated, status: newStatus } : r)));
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setTransitioning((prev) => ({ ...prev, [shift.id]: false }));
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await del(`/workforce/shifts/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  // ── Drawer open helpers ───────────────────────────────────────────────────

  function openCreate() {
    setDrawerMode('create');
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(shift: Shift) {
    setDrawerMode('edit');
    setEditTarget(shift);
    setForm({
      agentId: shift.agentId,
      businessId: shift.businessId ?? '',
      startAt: toLocalDatetimeInput(shift.startAt),
      endAt: toLocalDatetimeInput(shift.endAt),
      notes: shift.notes ?? '',
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditTarget(null);
    setFormError(null);
  }

  // ── Form submit ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    setFormError(null);

    if (!form.agentId) {
      setFormError('Agent is required.');
      return;
    }
    if (!form.startAt || !form.endAt) {
      setFormError('Start and end times are required.');
      return;
    }
    const startMs = new Date(form.startAt).getTime();
    const endMs = new Date(form.endAt).getTime();
    if (endMs <= startMs) {
      setFormError('End time must be after start time.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        agentId: form.agentId,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      };
      if (form.businessId) payload.businessId = form.businessId;
      if (form.notes.trim()) payload.notes = form.notes.trim();

      if (drawerMode === 'create') {
        const created = await post<Shift>('/workforce/shifts', payload);
        setRows((prev) => [created, ...prev]);
      } else if (editTarget) {
        const updated = await patch<Shift>(`/workforce/shifts/${editTarget.id}`, payload);
        setRows((prev) => prev.map((r) => (r.id === editTarget.id ? { ...r, ...updated } : r)));
      }
      closeDrawer();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns: Column<Shift>[] = [
    {
      key: 'agent',
      header: 'Agent',
      render: (r) => <span className="font-medium text-fg">{r.agentName}</span>,
    },
    {
      key: 'business',
      header: 'Business',
      render: (r) => {
        const name = (r as any).businessName ?? (r.businessId ? businesses.find((b) => b.id === r.businessId)?.name : null);
        return <span className="text-muted text-xs">{name ?? '—'}</span>;
      },
    },
    {
      key: 'start',
      header: 'Start Time',
      render: (r) => <span className="text-muted text-xs">{formatDate(r.startAt)}</span>,
    },
    {
      key: 'end',
      header: 'End Time',
      render: (r) => <span className="text-muted text-xs">{formatDate(r.endAt)}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (r) => <span className="text-fg">{computeDuration(r.startAt, r.endAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={shiftBadgeTone(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (r) => {
        const busy = !!transitioning[r.id];
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openEdit(r)}
              title="Edit shift"
            >
              Edit
            </Button>

            {r.status === 'SCHEDULED' && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => transitionStatus(r, 'ACTIVE')}
                title="Mark as active"
              >
                Activate
              </Button>
            )}

            {r.status === 'ACTIVE' && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => transitionStatus(r, 'COMPLETED')}
                title="Mark as completed"
              >
                Complete
              </Button>
            )}

            {(r.status === 'SCHEDULED' || r.status === 'ACTIVE') && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => transitionStatus(r, 'ABSENT')}
                title="Mark as absent"
                className="text-danger border-danger/40 hover:bg-danger/10"
              >
                Absent
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteTarget(r)}
              title="Delete shift"
              className="text-danger hover:bg-danger/10"
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Shifts & Schedules"
        description="Manage agent shift assignments, track attendance and availability."
        actions={
          <Button variant="primary" onClick={openCreate}>
            + New Shift
          </Button>
        }
      />

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total shifts today"
          value={String(statTotalToday)}
          hint={dateFilter || 'today'}
        />
        <StatCard
          label="Active now"
          value={String(statActiveNow)}
        />
        <StatCard
          label="Scheduled"
          value={String(statScheduled)}
        />
        <StatCard
          label="Absent rate"
          value={`${absentRate}%`}
          hint={`${statAbsent} absent`}
        />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-muted">Date</label>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-muted">Status</label>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-44"
          >
            <option value="ALL">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="ABSENT">Absent</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>

        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-muted">Agent</label>
          <Input
            placeholder="Search agent name…"
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            className="w-52"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-muted">Business</label>
          <SearchableSelect
            value={businessFilter}
            onChange={setBusinessFilter}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
            emptyLabel="All businesses"
            placeholder="All businesses"
            className="w-52"
          />
        </div>

        <div className="ml-auto flex items-end pb-0.5 text-xs text-muted">
          {filtered.length} shift{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {loadError}
          <button
            onClick={() => loadShifts(true)}
            className="ml-auto underline hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.id}
        loading={loading && rows.length === 0}
        empty="No shifts match the current filters."
      />

      {/* Load more */}
      {hasMore && !loading && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              const nextPage = page + 1;
              setPage(nextPage);
              loadShifts(false);
            }}
          >
            Load more
          </Button>
        </div>
      )}

      {loading && rows.length > 0 && (
        <div className="mt-4 text-center text-sm text-muted">Loading…</div>
      )}

      {/* ── Create / Edit Drawer ── */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'create' ? 'New Shift' : 'Edit Shift'}
        width="w-[480px]"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="primary" loading={saving} onClick={handleSubmit}>
              {drawerMode === 'create' ? 'Create Shift' : 'Save Changes'}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={closeDrawer}>
              Cancel
            </Button>
            {formError && (
              <span className="ml-2 text-xs text-danger">{formError}</span>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          {/* Agent */}
          <FormField label="Agent" required>
            <SearchableSelect
              value={form.agentId}
              onChange={(v) => setForm((f) => ({ ...f, agentId: v }))}
              options={agents.map((a) => ({ value: a.id, label: `${a.user.name} (${a.user.email})` }))}
              placeholder="Select agent…"
              className="w-full"
            />
          </FormField>

          {/* Business */}
          <FormField label="Business" hint="Optional — leave blank for any">
            <SearchableSelect
              value={form.businessId}
              onChange={(v) => setForm((f) => ({ ...f, businessId: v }))}
              options={businesses.map((b) => ({ value: b.id, label: b.name }))}
              emptyLabel="Any business"
              placeholder="Any business"
              className="w-full"
            />
          </FormField>

          {/* Start */}
          <FormField label="Start date & time" required>
            <Input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              className="w-full"
            />
          </FormField>

          {/* End */}
          <FormField label="End date & time" required>
            <Input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              className="w-full"
            />
          </FormField>

          {/* Duration preview */}
          {form.startAt && form.endAt && (() => {
            const startMs = new Date(form.startAt).getTime();
            const endMs = new Date(form.endAt).getTime();
            const dur = computeDuration(new Date(form.startAt).toISOString(), new Date(form.endAt).toISOString());
            if (endMs <= startMs) {
              return (
                <div className="rounded-md border border-danger/40 bg-danger/8 px-3 py-2 text-xs text-danger">
                  End time must be after start time.
                </div>
              );
            }
            return (
              <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                Duration: <span className="font-medium text-fg">{dur}</span>
              </div>
            );
          })()}

          {/* Notes */}
          <FormField label="Notes" hint="Optional">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Any notes for this shift…"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </FormField>

          {/* Validation error (inline) */}
          {formError && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {formError}
            </p>
          )}
        </div>
      </Drawer>

      {/* ── Delete Confirm Dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-fg">Delete shift?</h3>
            <p className="mb-4 text-sm text-muted">
              This will permanently delete the shift for{' '}
              <span className="font-medium text-fg">{deleteTarget.agentName}</span>{' '}
              on {formatDate(deleteTarget.startAt)}. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                loading={deleting}
                onClick={confirmDelete}
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <label className="text-xs font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        {hint && <span className="text-[10px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
