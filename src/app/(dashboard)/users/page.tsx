'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, patch, post } from '@/lib/api';
import type { User, UserRole, UserStatus } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/export';
import { impersonate } from '@/lib/impersonate';

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPS', 'FINANCE', 'SUPPORT', 'BUSINESS', 'AGENT'];
const STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'PENDING', 'DEACTIVATED'];

export default function UsersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'' | UserRole>('');
  const [status, setStatus] = useState<'' | UserStatus>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<User | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<'profile' | 'activity' | 'sessions'>('profile');
  const [newRole, setNewRole] = useState<UserRole | ''>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await get<User[] | { items: User[] }>('/admin/users');
        const items = Array.isArray(data) ? data : data.items;
        if (alive) setRows(items);
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Failed to load users');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((u) => {
      if (role && u.role !== role) return false;
      if (status && u.status !== status) return false;
      if (fromDate && new Date(u.createdAt) < new Date(fromDate)) return false;
      if (toDate && new Date(u.createdAt) > new Date(`${toDate}T23:59:59`)) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          u.email.toLowerCase().includes(s) ||
          (u.firstName ?? '').toLowerCase().includes(s) ||
          (u.lastName ?? '').toLowerCase().includes(s) ||
          u.id.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [rows, q, role, status, fromDate, toDate]);

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <div>
          <div className="font-medium text-fg">{(u.firstName || '') + ' ' + (u.lastName || '')}</div>
          <div className="text-xs text-muted">{u.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => <Badge tone="brand">{u.role}</Badge> },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={statusTone(u.status)}>{u.status}</Badge> },
    { key: 'phone', header: 'Phone', render: (u) => <span className="text-muted">{u.phone ?? '—'}</span> },
    { key: 'lastLogin', header: 'Last login', render: (u) => <span className="text-muted">{formatDate(u.lastLoginAt)}</span> },
    { key: 'created', header: 'Joined', render: (u) => <span className="text-muted">{formatDate(u.createdAt)}</span> },
  ];

  async function updateStatus(user: User, newStatus: UserStatus) {
    setRows((prev) => prev.map((r) => (r.id === user.id ? { ...r, status: newStatus } : r)));
    setSelected({ ...user, status: newStatus });
    try {
      await patch(`/admin/users/${user.id}`, { status: newStatus });
    } catch {
      /* optimistic */
    }
  }

  async function changeRole(user: User, r: UserRole) {
    setRows((prev) => prev.map((row) => (row.id === user.id ? { ...row, role: r } : row)));
    setSelected({ ...user, role: r });
    try {
      await patch(`/admin/users/${user.id}`, { role: r });
    } catch {}
  }

  async function resetPassword(user: User) {
    try {
      await post(`/admin/users/${user.id}/reset-password`, {});
      alert(`Password reset email sent to ${user.email}`);
    } catch {
      alert('Backend unavailable — would normally send reset email.');
    }
  }

  async function resetMfa(user: User) {
    try {
      await post(`/admin/users/${user.id}/reset-mfa`, {});
      alert(`MFA reset for ${user.email}`);
    } catch {
      alert('Backend unavailable — would normally reset MFA.');
    }
  }

  function startImpersonate(user: User) {
    impersonate.set({
      id: user.id,
      label: `${user.firstName ?? ''} ${user.lastName ?? ''} <${user.email}>`.trim(),
    });
    setSelected(null);
    router.refresh();
  }

  function exportCurrent() {
    downloadCsv('users.csv', filtered, [
      ['ID', 'id'],
      ['Email', 'email'],
      ['First name', 'firstName'],
      ['Last name', 'lastName'],
      ['Role', 'role'],
      ['Status', 'status'],
      ['Phone', 'phone'],
      ['Email verified', (r) => (r.emailVerified ? 'yes' : 'no')],
      ['Last login', 'lastLoginAt'],
      ['Created', 'createdAt'],
    ]);
  }

  async function bulkAction(action: 'suspend' | 'activate' | 'delete' | 'export') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'export') {
      downloadCsv('users-selected.csv', rows.filter((r) => selectedIds.has(r.id)));
      return;
    }
    if (action === 'delete' && !confirm(`Delete ${ids.length} users? This cannot be undone.`)) return;

    const newStatus: UserStatus | null = action === 'suspend' ? 'SUSPENDED' : action === 'activate' ? 'ACTIVE' : null;
    if (newStatus) {
      setRows((prev) => prev.map((u) => (selectedIds.has(u.id) ? { ...u, status: newStatus } : u)));
    } else if (action === 'delete') {
      setRows((prev) => prev.filter((u) => !selectedIds.has(u.id)));
    }
    try {
      await post('/admin/users/bulk', { ids, action });
    } catch {
      /* optimistic */
    }
    setSelectedIds(new Set());
  }

  const selectedCount = selectedIds.size;

  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="All platform accounts across roles. Suspend, reactivate, or impersonate from here."
        actions={
          <Button variant="secondary" onClick={exportCurrent}>
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search email, name, id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
        />
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole | '')}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as UserStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" title="Registered from" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" title="Registered to" />
        <div className="ml-auto text-xs text-muted">
          {filtered.length} of {rows.length}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-fg">{selectedCount} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => bulkAction('activate')}>Activate</Button>
            <Button size="sm" variant="danger" onClick={() => bulkAction('suspend')}>Suspend</Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction('export')}>Export</Button>
            <Button size="sm" variant="danger" onClick={() => bulkAction('delete')}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(u) => u.id}
        loading={loading}
        onRowClick={setSelected}
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.firstName ?? ''} ${selected.lastName ?? ''}`.trim() || selected.email : ''}
        footer={
          selected && (
            <div className="flex flex-wrap items-center gap-2">
              {selected.status !== 'ACTIVE' && (
                <Button size="sm" onClick={() => updateStatus(selected, 'ACTIVE')}>
                  Activate
                </Button>
              )}
              {selected.status !== 'SUSPENDED' && (
                <Button size="sm" variant="danger" onClick={() => updateStatus(selected, 'SUSPENDED')}>
                  Suspend
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => resetPassword(selected)}>
                Reset password
              </Button>
              <Button size="sm" variant="outline" onClick={() => resetMfa(selected)}>
                Reset MFA
              </Button>
              <Button size="sm" variant="ghost" onClick={() => startImpersonate(selected)}>
                Impersonate
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <div className="flex min-h-full flex-col">
            <div className="mb-4 flex gap-2 border-b border-border">
              {(['profile', 'activity', 'sessions'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  className={`border-b-2 px-3 py-2 text-xs font-medium capitalize ${
                    detailTab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {detailTab === 'profile' && (
              <dl className="space-y-3 text-sm">
                <Field label="ID">{selected.id}</Field>
                <Field label="Email">{selected.email}</Field>
                <Field label="Phone">{selected.phone ?? '—'}</Field>
                <Field label="Role">
                  <div className="flex items-center gap-2">
                    <Badge tone="brand">{selected.role}</Badge>
                    <Select
                      value={newRole || selected.role}
                      onChange={(e) => {
                        const v = e.target.value as UserRole;
                        setNewRole(v);
                        changeRole(selected, v);
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                <Field label="Status">
                  <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                </Field>
                <Field label="Email verified">{selected.emailVerified ? 'Yes' : 'No'}</Field>
                <Field label="Last login">{formatDate(selected.lastLoginAt)}</Field>
                <Field label="Joined">{formatDate(selected.createdAt)}</Field>
              </dl>
            )}
            {detailTab === 'activity' && <UserActivityFeed userId={selected.id} />}
            {detailTab === 'sessions' && <UserSessions userId={selected.id} />}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}

function UserActivityFeed({ userId }: { userId: string }) {
  const [items, setItems] = useState<{ id: string; action: string; at: string; meta?: string }[]>([]);
  const [actError, setActError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const data = await get<{ items: { id: string; action: string; at: string; meta?: string }[] }>(
          `/admin/audit-logs?entityId=${userId}`,
        );
        setItems(data.items);
      } catch (e: any) {
        setActError(e?.message ?? 'Failed to load activity');
      }
    })();
  }, [userId]);
  if (actError) return <div className="py-4 text-center text-sm text-danger">{actError}</div>;
  return (
    <ul className="space-y-2 text-xs">
      {items.map((it) => (
        <li key={it.id} className="flex items-start justify-between rounded-md border border-border bg-surface-2 p-3">
          <div>
            <div className="font-medium text-fg">{it.action}</div>
            {it.meta && <div className="text-muted">{it.meta}</div>}
          </div>
          <span className="text-muted">{formatDate(it.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function UserSessions({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<{ id: string; device: string; ip: string; at: string; current?: boolean }[]>([]);
  const [sessError, setSessError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const data = await get<{ items: { id: string; device: string; ip: string; at: string; current?: boolean }[] }>(
          `/admin/users/${userId}/sessions`,
        );
        setSessions(data.items);
      } catch (e: any) {
        setSessError(e?.message ?? 'Failed to load sessions');
      }
    })();
  }, [userId]);
  if (sessError) return <div className="py-4 text-center text-sm text-danger">{sessError}</div>;
  async function revoke(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    try {
      await post(`/admin/users/${userId}/sessions/${id}/revoke`, {});
    } catch {}
  }
  return (
    <ul className="space-y-2 text-xs">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-start justify-between rounded-md border border-border bg-surface-2 p-3">
          <div>
            <div className="font-medium text-fg">
              {s.device} {s.current && <Badge tone="success">Current</Badge>}
            </div>
            <div className="text-muted">{s.ip} · {formatDate(s.at)}</div>
          </div>
          {!s.current && (
            <button onClick={() => revoke(s.id)} className="text-danger hover:underline">
              Revoke
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
