'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, post, patch, del, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  businessId?: string | null;
  businessName?: string | null;
  timezone?: string | null;
  currency?: string | null;
  memberCount?: number;
  taskCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface Business {
  id: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT, UTC+3)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT, UTC+1)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'KES', label: 'KES — Kenyan Shilling' },
  { value: 'NGN', label: 'NGN — Nigerian Naira' },
  { value: 'GBP', label: 'GBP — British Pound' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  businessId: '',
  timezone: 'UTC',
  currency: 'USD',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Business lookup
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [bizError, setBizError] = useState<string | null>(null);

  // Create drawer
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit drawer
  const [editWs, setEditWs] = useState<Workspace | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Load workspaces ────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    get<Workspace[] | { items: Workspace[] }>('/workspaces')
      .then((raw) => {
        setWorkspaces(Array.isArray(raw) ? raw : ((raw as { items: Workspace[] }).items ?? []));
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Load businesses (reload when create drawer opens) ─────────────────────
  useEffect(() => {
    if (!showCreate) return;
    setBizError(null);
    get<Business[] | { items: Business[] }>('/admin/businesses?limit=200')
      .then((raw) => setBusinesses(Array.isArray(raw) ? raw : (raw?.items ?? [])))
      .catch((e) => setBizError(errorMessage(e)));
  }, [showCreate]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = workspaces.filter((w) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(s) ||
      (w.businessName ?? '').toLowerCase().includes(s) ||
      (w.description ?? '').toLowerCase().includes(s)
    );
  });

  const totalCount = workspaces.length;
  const totalMembers = workspaces.reduce((a, w) => a + (w.memberCount ?? 0), 0);
  const totalTasks = workspaces.reduce((a, w) => a + (w.taskCount ?? 0), 0);

  // ── Create ─────────────────────────────────────────────────────────────────
  function openCreate() {
    setCreateForm({ ...EMPTY_FORM });
    setCreateError(null);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) { setCreateError('Name is required.'); return; }
    setCreateSaving(true);
    setCreateError(null);
    if (!createForm.businessId) { setCreateError('Select a business to associate this workspace with.'); setCreateSaving(false); return; }
    try {
      const created = await post<Workspace>('/workspaces', {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        businessId: createForm.businessId,
        timezone: createForm.timezone || undefined,
        currency: createForm.currency || undefined,
      });
      setWorkspaces((prev) => [created, ...prev]);
      setShowCreate(false);
    } catch (e) {
      setCreateError(errorMessage(e));
    } finally {
      setCreateSaving(false);
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function openEdit(ws: Workspace) {
    setEditForm({ name: ws.name, description: ws.description ?? '' });
    setEditError(null);
    setEditWs(ws);
  }

  async function handleEdit() {
    if (!editWs) return;
    if (!editForm.name.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await patch<Workspace>(`/workspaces/${editWs.id}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
      });
      setWorkspaces((prev) =>
        prev.map((w) => w.id === editWs.id ? { ...w, ...updated } : w),
      );
      setEditWs(null);
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function openDelete(ws: Workspace) {
    setDeleteError(null);
    setDeleteTarget(ws);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await del(`/workspaces/${deleteTarget.id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Workspace Management"
        description="Virtual workspaces used by businesses and agents across the platform."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
            <Button size="sm" onClick={openCreate}>+ Create Workspace</Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Total workspaces" value={String(totalCount)} />
        <StatCard label="Total members" value={String(totalMembers)} />
        <StatCard label="Total tasks" value={String(totalTasks)} />
      </div>

      {/* Search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search workspaces or business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="ml-auto text-xs text-muted">{filtered.length} of {totalCount}</div>
      </div>

      {/* Body states */}
      {loading && (
        <div className="py-20 text-center text-muted text-sm">Loading workspaces…</div>
      )}
      {!loading && error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {workspaces.length === 0
            ? 'No workspaces yet — create one above.'
            : 'No workspaces match the search.'}
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Workspace</th>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Timezone</th>
                <th className="px-4 py-3 text-left">Currency</th>
                <th className="px-4 py-3 text-left">Members</th>
                <th className="px-4 py-3 text-left">Tasks</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((ws) => (
                <tr key={ws.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{ws.name}</div>
                    {ws.description && (
                      <div className="text-xs text-muted truncate max-w-[200px]">{ws.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {ws.businessName ?? (
                      ws.businessId
                        ? (businesses.find((b) => b.id === ws.businessId)?.name ?? ws.businessId)
                        : '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{ws.timezone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted text-xs">{ws.currency ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{ws.memberCount ?? 0}</td>
                  <td className="px-4 py-3 text-muted">{ws.taskCount ?? 0}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(ws.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(ws)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDelete(ws)}
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

      {/* ── Create Workspace Drawer ─────────────────────────────────────────── */}
      <Drawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Workspace"
        width="w-[480px]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-danger">{createError}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} loading={createSaving}>
                Create
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Business selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Business / Organisation <span className="text-danger">*</span>
            </label>
            <Select
              value={createForm.businessId}
              onChange={(e) => setCreateForm((f) => ({ ...f, businessId: e.target.value }))}
              className="w-full"
            >
              <option value="">Select a business…</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            {bizError && (
              <p className="mt-1 text-[10px] text-danger">{bizError}</p>
            )}
            {!bizError && businesses.length === 0 && (
              <p className="mt-1 text-[10px] text-muted">Loading businesses…</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Workspace name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="e.g. Customer Support Team"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="What this workspace is used for…"
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>

          {/* Timezone */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Timezone
            </label>
            <Select
              value={createForm.timezone}
              onChange={(e) => setCreateForm((f) => ({ ...f, timezone: e.target.value }))}
              className="w-full"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </Select>
          </div>

          {/* Currency */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Currency
            </label>
            <Select
              value={createForm.currency}
              onChange={(e) => setCreateForm((f) => ({ ...f, currency: e.target.value }))}
              className="w-full"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </Drawer>

      {/* ── Edit Workspace Drawer ───────────────────────────────────────────── */}
      <Drawer
        open={!!editWs}
        onClose={() => setEditWs(null)}
        title={editWs ? `Edit: ${editWs.name}` : 'Edit Workspace'}
        width="w-[480px]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-danger">{editError}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditWs(null)}>
                Discard
              </Button>
              <Button size="sm" onClick={handleEdit} loading={editSaving}>
                Save changes
              </Button>
            </div>
          </div>
        }
      >
        {editWs && (
          <div className="space-y-4">
            {/* Read-only meta */}
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted">Business</span>
                <span className="text-fg font-medium">{editWs.businessName ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Timezone</span>
                <span className="text-fg">{editWs.timezone ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Currency</span>
                <span className="text-fg">{editWs.currency ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Members / Tasks</span>
                <span className="text-fg">{editWs.memberCount ?? 0} / {editWs.taskCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Created</span>
                <span className="text-fg">{formatDate(editWs.createdAt)}</span>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                Name <span className="text-danger">*</span>
              </label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
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
                placeholder="Workspace description…"
              />
            </div>

            <p className="text-xs text-muted">
              Timezone and currency can only be changed by the workspace owner from their settings.
            </p>
          </div>
        )}
      </Drawer>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="mb-2 text-base font-semibold text-fg">Delete workspace?</h3>
            <p className="mb-1 text-sm text-muted">
              You are about to permanently delete{' '}
              <span className="font-semibold text-fg">{deleteTarget.name}</span>.
            </p>
            <p className="mb-4 text-xs text-muted">
              This will remove all workspace data, members, and tasks. This action cannot be undone.
            </p>
            {deleteError && (
              <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleDelete}
                loading={deleting}
              >
                Delete workspace
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
