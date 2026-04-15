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

  // Create user — role-aware invite form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [cRole, setCRole] = useState<UserRole>('BUSINESS');
  // Personal
  const [cFirst, setCFirst] = useState('');
  const [cLast, setCLast] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  // Business-specific
  const [cBizName, setCBizName] = useState('');
  const [cBizLegal, setCBizLegal] = useState('');
  const [cBizIndustry, setCBizIndustry] = useState('');
  const [cBizCountry, setCBizCountry] = useState('');
  const [cBizPhone, setCBizPhone] = useState('');
  const [cBizWebsite, setCBizWebsite] = useState('');
  const [cBizAddress, setCBizAddress] = useState('');
  const [cBizDesc, setCBizDesc] = useState('');
  const [cBizRegNum, setCBizRegNum] = useState('');
  const [cBizTaxId, setCBizTaxId] = useState('');
  // Agent-specific
  const [cAgentCountry, setCAgentCountry] = useState('');
  const [cAgentCity, setCAgentCity] = useState('');
  const [cAgentBio, setCAgentBio] = useState('');
  const [cAgentSkills, setCAgentSkills] = useState('');
  // Org linking (SUPERVISOR/ADMIN required, AGENT optional)
  const [cOrgId, setCOrgId] = useState('');
  const [cOrgSearch, setCOrgSearch] = useState('');
  const [businesses, setBusinesses] = useState<{ id: string; name: string; contactEmail: string }[]>([]);
  const [bizLoading, setBizLoading] = useState(false);
  const [bizError, setBizError] = useState<string | null>(null);

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

  // Load businesses when create drawer opens
  useEffect(() => {
    if (!showCreate) return;
    setBizLoading(true);
    setBizError(null);
    get<{ id: string; name: string; contactEmail: string }[]>('/admin/businesses?limit=200')
      .then((d) => {
        const items = Array.isArray(d) ? d : (d as any).items ?? [];
        setBusinesses(items);
      })
      .catch((e: any) => {
        setBizError(e?.message ?? 'Failed to load organisations');
      })
      .finally(() => setBizLoading(false));
  }, [showCreate]);

  function resetCreateForm() {
    setCFirst(''); setCLast(''); setCEmail(''); setCPhone(''); setCRole('BUSINESS');
    setCBizName(''); setCBizLegal(''); setCBizIndustry(''); setCBizCountry(''); setCBizPhone('');
    setCBizWebsite(''); setCBizAddress(''); setCBizDesc(''); setCBizRegNum(''); setCBizTaxId('');
    setCAgentCountry(''); setCAgentCity(''); setCAgentBio(''); setCAgentSkills('');
    setCOrgId(''); setCOrgSearch(''); setBizError(null);
    setCreateError(null);
  }

  async function createUser() {
    if (!cEmail.trim()) { setCreateError('Email is required'); return; }
    if (cRole === 'BUSINESS' && !cBizName.trim()) { setCreateError('Business name is required'); return; }
    if ((cRole === 'SUPERVISOR' || cRole === 'ADMIN') && !cOrgId) {
      setCreateError('Organisation is required for Supervisor and Admin accounts');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = {
        firstName: cFirst.trim() || undefined,
        lastName: cLast.trim() || undefined,
        email: cEmail.trim(),
        phone: cPhone.trim() || undefined,
        role: cRole,
      };
      if (cRole === 'BUSINESS') {
        payload.businessName = cBizName.trim() || undefined;
        payload.businessLegalName = cBizLegal.trim() || undefined;
        payload.businessIndustry = cBizIndustry.trim() || undefined;
        payload.businessCountry = cBizCountry.trim() || undefined;
        payload.businessPhone = cBizPhone.trim() || undefined;
        payload.businessWebsite = cBizWebsite.trim() || undefined;
        payload.businessAddress = cBizAddress.trim() || undefined;
        payload.businessDescription = cBizDesc.trim() || undefined;
        payload.businessRegistrationNumber = cBizRegNum.trim() || undefined;
        payload.businessTaxId = cBizTaxId.trim() || undefined;
      }
      if (cRole === 'AGENT') {
        payload.country = cAgentCountry.trim() || undefined;
        payload.city = cAgentCity.trim() || undefined;
        payload.bio = cAgentBio.trim() || undefined;
        payload.skills = cAgentSkills.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (cOrgId) payload.businessId = cOrgId;
      const u = await post<User>('/admin/users', payload);
      setRows((prev) => [{ ...u, phone: cPhone.trim() || null } as User, ...prev]);
      setShowCreate(false);
      resetCreateForm();
    } catch (e: unknown) {
      setCreateError((e as { message?: string })?.message ?? 'Failed to create user');
    } finally {
      setCreating(false);
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
          <div className="flex gap-2">
            <Button onClick={() => setShowCreate(true)}>+ Invite User</Button>
            <Button variant="secondary" onClick={exportCurrent}>Export CSV</Button>
          </div>
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

      {/* Create user drawer — comprehensive role-aware form */}
      <Drawer
        open={showCreate}
        onClose={() => { setShowCreate(false); resetCreateForm(); }}
        title="Add Account"
        width="w-[560px]"
        footer={
          <div className="flex gap-2">
            <Button onClick={createUser} disabled={creating}>{creating ? 'Creating…' : `Create ${cRole === 'BUSINESS' ? 'business account' : cRole === 'AGENT' ? 'agent account' : 'account'}`}</Button>
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetCreateForm(); }}>Cancel</Button>
          </div>
        }
      >
        <div className="space-y-5 text-sm">
          {createError && <div className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{createError}</div>}

          {/* Role type selector — big cards */}
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Account type *</div>
            <div className="grid grid-cols-2 gap-2">
              {(['BUSINESS', 'AGENT', 'SUPERVISOR', 'ADMIN'] as UserRole[]).map((r) => {
                const meta: Record<string, { icon: string; label: string; desc: string }> = {
                  BUSINESS: { icon: '🏢', label: 'Business / Org', desc: 'Company account that posts jobs and manages workforce.' },
                  AGENT: { icon: '👤', label: 'Agent', desc: 'Field agent who picks up and completes tasks.' },
                  SUPERVISOR: { icon: '🧑‍💼', label: 'Supervisor', desc: 'Internal ops staff with elevated task access.' },
                  ADMIN: { icon: '🔐', label: 'Admin', desc: 'Platform administrator with full access.' },
                };
                const m = meta[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCRole(r)}
                    className={`rounded-lg border p-3 text-left transition-all ${cRole === r ? 'border-brand bg-brand/8 ring-1 ring-brand/40' : 'border-border bg-surface-2 hover:border-brand/30'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{m.icon}</span>
                      <span className="font-semibold text-fg text-xs">{m.label}</span>
                    </div>
                    <p className="text-[10px] text-muted leading-snug">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Account owner (always shown) ── */}
          <div className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Account owner</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">First name</label>
                <Input value={cFirst} onChange={(e) => setCFirst(e.target.value)} placeholder="John" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Last name</label>
                <Input value={cLast} onChange={(e) => setCLast(e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">Email address *</label>
              <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="john@company.com" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">Phone number</label>
              <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+254 700 000 000" />
            </div>
            <p className="text-[10px] text-muted/70 pt-1">A password reset link will be sent to their email to activate the account.</p>
          </div>

          {/* ── Business details (only for BUSINESS role) ── */}
          {cRole === 'BUSINESS' && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🏢</span>
                <div className="text-[11px] uppercase tracking-wider text-brand font-semibold">Business / Organisation details</div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Business name *</label>
                <Input value={cBizName} onChange={(e) => setCBizName(e.target.value)} placeholder="Acme Corp Ltd" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Legal / registered name</label>
                  <Input value={cBizLegal} onChange={(e) => setCBizLegal(e.target.value)} placeholder="Acme Corporation Limited" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Industry / sector</label>
                  <Input value={cBizIndustry} onChange={(e) => setCBizIndustry(e.target.value)} placeholder="Logistics, Fintech, Retail…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Country of registration</label>
                  <Input value={cBizCountry} onChange={(e) => setCBizCountry(e.target.value)} placeholder="Kenya" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Business phone</label>
                  <Input value={cBizPhone} onChange={(e) => setCBizPhone(e.target.value)} placeholder="+254 720 000 000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Registration number</label>
                  <Input value={cBizRegNum} onChange={(e) => setCBizRegNum(e.target.value)} placeholder="CPR/2024/123456" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Tax / KRA PIN</label>
                  <Input value={cBizTaxId} onChange={(e) => setCBizTaxId(e.target.value)} placeholder="P000000000A" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Website</label>
                <Input value={cBizWebsite} onChange={(e) => setCBizWebsite(e.target.value)} placeholder="https://acmecorp.co.ke" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Physical address</label>
                <Input value={cBizAddress} onChange={(e) => setCBizAddress(e.target.value)} placeholder="2nd Floor, Westlands, Nairobi" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Description / what you do</label>
                <textarea
                  value={cBizDesc}
                  onChange={(e) => setCBizDesc(e.target.value)}
                  placeholder="Brief description of the business and the kinds of tasks they'll post…"
                  rows={3}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                />
              </div>
              <p className="text-[10px] text-muted/70">Business account starts as <span className="font-semibold text-warn">Pending Verification</span> — admin must approve before they can post tasks.</p>
            </div>
          )}

          {/* ── Agent details (only for AGENT role) ── */}
          {cRole === 'AGENT' && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">👤</span>
                <div className="text-[11px] uppercase tracking-wider text-success font-semibold">Agent profile</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Country</label>
                  <Input value={cAgentCountry} onChange={(e) => setCAgentCountry(e.target.value)} placeholder="Kenya" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">City</label>
                  <Input value={cAgentCity} onChange={(e) => setCAgentCity(e.target.value)} placeholder="Nairobi" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Skills <span className="text-muted/60">(comma-separated)</span></label>
                <Input value={cAgentSkills} onChange={(e) => setCAgentSkills(e.target.value)} placeholder="data entry, delivery, customer support" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Bio / background</label>
                <textarea
                  value={cAgentBio}
                  onChange={(e) => setCAgentBio(e.target.value)}
                  placeholder="Brief background and experience…"
                  rows={3}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                />
              </div>
              <p className="text-[10px] text-muted/70">Agent starts as <span className="font-semibold text-warn">Pending KYC</span> — must submit documents before accepting tasks.</p>
            </div>
          )}

          {/* ── Organisation linking ── */}
          {(cRole === 'SUPERVISOR' || cRole === 'ADMIN' || cRole === 'AGENT') && (
            <div className={`rounded-lg border p-4 space-y-3 ${(cRole === 'SUPERVISOR' || cRole === 'ADMIN') ? 'border-warn/40 bg-warn/5' : 'border-border bg-surface-2'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏢</span>
                  <div className={`text-[11px] uppercase tracking-wider font-semibold ${(cRole === 'SUPERVISOR' || cRole === 'ADMIN') ? 'text-warn' : 'text-muted'}`}>
                    Organisation {(cRole === 'SUPERVISOR' || cRole === 'ADMIN') ? '(required)' : '(optional)'}
                  </div>
                </div>
                {cRole === 'AGENT' && cOrgId && (
                  <button type="button" onClick={() => { setCOrgId(''); setCOrgSearch(''); }} className="text-[10px] text-muted underline">
                    Clear (free agent)
                  </button>
                )}
              </div>
              {(cRole === 'SUPERVISOR' || cRole === 'ADMIN') && (
                <p className="text-[10px] text-warn/80">Supervisors and Admins must be linked to an organisation.</p>
              )}
              {cOrgId ? (
                <div className="flex items-center justify-between rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-fg">{businesses.find((b) => b.id === cOrgId)?.name ?? cOrgId}</div>
                    <div className="text-[10px] text-muted">{businesses.find((b) => b.id === cOrgId)?.contactEmail ?? ''}</div>
                  </div>
                  <button type="button" onClick={() => { setCOrgId(''); setCOrgSearch(''); }} className="text-xs text-danger hover:underline">Change</button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search organisation…"
                    value={cOrgSearch}
                    onChange={(e) => setCOrgSearch(e.target.value)}
                  />
                  {bizLoading ? (
                    <div className="text-xs text-muted py-2">Loading organisations…</div>
                  ) : bizError ? (
                    <div className="text-xs text-danger py-2">{bizError}</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                      {businesses
                        .filter((b) => !cOrgSearch || b.name.toLowerCase().includes(cOrgSearch.toLowerCase()) || b.contactEmail.toLowerCase().includes(cOrgSearch.toLowerCase()))
                        .slice(0, 20)
                        .map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => { setCOrgId(b.id); setCOrgSearch(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-surface-2 transition-colors"
                          >
                            <div className="text-xs font-medium text-fg">{b.name}</div>
                            <div className="text-[10px] text-muted">{b.contactEmail}</div>
                          </button>
                        ))}
                      {businesses.filter((b) => !cOrgSearch || b.name.toLowerCase().includes(cOrgSearch.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted">No organisations found</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Drawer>

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
