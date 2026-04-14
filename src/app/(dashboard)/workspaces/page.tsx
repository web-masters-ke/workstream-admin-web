'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { get } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Workspace {
  id: string;
  name: string;
  businessId?: string;
  businessName?: string;
  memberCount?: number;
  taskCount?: number;
  createdAt: string;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    get<Workspace[] | { items: Workspace[] }>('/workspaces')
      .catch(() => [] as Workspace[])
      .then((raw) => {
        setWorkspaces(Array.isArray(raw) ? raw : ((raw as { items: Workspace[] }).items ?? []));
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed to load workspaces'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = workspaces.filter((w) =>
    !search ||
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.businessName ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    setCreating(true);
    // Optimistic UI — add locally
    const mock: Workspace = {
      id: `tmp-${Date.now()}`,
      name: newName.trim(),
      memberCount: 0,
      taskCount: 0,
      createdAt: new Date().toISOString(),
    };
    setWorkspaces((prev) => [mock, ...prev]);
    setNewName('');
    setShowModal(false);
    setCreating(false);
  };

  return (
    <>
      <PageHeader
        title="Workspace Management"
        description="Manage all virtual workspaces used by businesses and agents."
        actions={
          <Button size="sm" onClick={() => setShowModal(true)}>
            + Create Workspace
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Total workspaces" value={String(workspaces.length)} />
        <StatCard
          label="Total members"
          value={String(workspaces.reduce((a, w) => a + (w.memberCount ?? 0), 0))}
        />
        <StatCard
          label="Total tasks"
          value={String(workspaces.reduce((a, w) => a + (w.taskCount ?? 0), 0))}
        />
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/20 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-fg">Create Workspace</h3>
            <Input
              placeholder="Workspace name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} loading={creating}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search workspaces or business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {loading && <div className="py-20 text-center text-muted text-sm">Loading workspaces…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {workspaces.length === 0
            ? 'No workspaces yet. Create one above.'
            : 'No workspaces match the search.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Workspace Name</th>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Members</th>
                <th className="px-4 py-3 text-left">Tasks</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-medium text-fg">{w.name}</td>
                  <td className="px-4 py-3 text-muted">{w.businessName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{w.memberCount ?? 0}</td>
                  <td className="px-4 py-3 text-muted">{w.taskCount ?? 0}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(w.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
