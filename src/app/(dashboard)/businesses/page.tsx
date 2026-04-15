'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, patch, post } from '@/lib/api';
import type { Business, BusinessStatus } from '@/lib/types';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

type DetailTab = 'overview' | 'kyc' | 'members' | 'workspace' | 'finance' | 'activity';

export default function BusinessesPage() {
  const [rows, setRows] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | BusinessStatus>('');
  const [country, setCountry] = useState('');
  const [selected, setSelected] = useState<Business | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspend, setShowSuspend] = useState(false);

  // Create business
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string; ownerName: string; bizName: string } | null>(null);
  const [cName, setCName] = useState('');
  const [cLegal, setCLegal] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCountry, setCCountry] = useState('');
  const [cIndustry, setCIndustry] = useState('');
  const [cOwnerFirst, setCOwnerFirst] = useState('');
  const [cOwnerLast, setCOwnerLast] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Reset password for existing business owner
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetPwd, setResetPwd] = useState('');
  const [showResetPwdVisible, setShowResetPwdVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const genPassword = useCallback(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '23456789';
    const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
    const base = Array.from({ length: 6 }, () => rand(chars)).join('');
    return `Ws${base}${rand(upper)}${rand(upper)}${rand(digits)}@1`;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await get<Business[] | { items: Business[] }>('/businesses');
        const items = Array.isArray(data) ? data : data.items;
        if (alive) setRows(items);
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Failed to load businesses');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const countries = useMemo(() => Array.from(new Set(rows.map((b) => b.country).filter(Boolean))).sort() as string[], [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((b) => {
        if (status && b.status !== status) return false;
        if (country && b.country !== country) return false;
        if (q) {
          const s = q.toLowerCase();
          return (b.name ?? '').toLowerCase().includes(s) || (b.email ?? '').toLowerCase().includes(s) || b.id.toLowerCase().includes(s);
        }
        return true;
      }),
    [rows, q, status, country],
  );

  const columns: Column<Business>[] = [
    {
      key: 'name',
      header: 'Business',
      render: (b) => (
        <div>
          <div className="font-medium text-fg">{b.name}</div>
          <div className="text-xs text-muted">{b.email}</div>
        </div>
      ),
    },
    { key: 'country', header: 'Country', render: (b) => <span className="text-muted">{b.country ?? '—'}</span> },
    { key: 'industry', header: 'Industry', render: (b) => <span className="text-muted">{b.industry ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (b) => <Badge tone={statusTone(b.status)}>{b.status}</Badge> },
    { key: 'tasks', header: 'Tasks', render: (b) => <span className="text-fg">{formatNumber(b.taskCount)}</span> },
    { key: 'agents', header: 'Agents', render: (b) => <span className="text-fg">{formatNumber(b.agentCount)}</span> },
    { key: 'created', header: 'Joined', render: (b) => <span className="text-muted">{formatDate(b.createdAt)}</span> },
  ];

  async function createBusiness() {
    if (!cName.trim() || !cEmail.trim()) { setCreateError('Name and email are required'); return; }
    if (!cOwnerFirst.trim()) { setCreateError('Owner first name is required'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const raw = await post<any>('/admin/businesses', {
        name: cName.trim(),
        legalName: cLegal.trim() || undefined,
        contactEmail: cEmail.trim(),
        contactPhone: cPhone.trim() || undefined,
        country: cCountry.trim() || undefined,
        industry: cIndustry.trim() || undefined,
        ownerFirstName: cOwnerFirst.trim(),
        ownerLastName: cOwnerLast.trim() || undefined,
        password: cPassword.trim() || undefined,
      });
      const bEmail = raw.email ?? raw.contactEmail ?? cEmail.trim();
      const bPhone = raw.phone ?? raw.contactPhone ?? (cPhone.trim() || null);
      const b: Business = { ...raw, email: bEmail, phone: bPhone };
      setRows((prev) => [b, ...prev]);
      setShowCreate(false);
      setCreatedCreds({ email: bEmail, tempPassword: raw.tempPassword ?? cPassword, ownerName: raw.ownerName ?? cOwnerFirst.trim(), bizName: cName.trim() });
      setCName(''); setCLegal(''); setCEmail(''); setCPhone(''); setCCountry(''); setCIndustry(''); setCOwnerFirst(''); setCOwnerLast(''); setCPassword('');
    } catch (e: any) {
      setCreateError(e?.message ?? 'Failed to create business');
    } finally {
      setCreating(false);
    }
  }

  async function update(biz: Business, newStatus: BusinessStatus, reason?: string) {
    setRows((prev) => prev.map((r) => (r.id === biz.id ? { ...r, status: newStatus } : r)));
    setSelected({ ...biz, status: newStatus });
    try {
      await patch(`/businesses/${biz.id}`, { status: newStatus, reason });
    } catch {}
  }

  async function bulk(action: 'approve' | 'suspend' | 'export') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'export') {
      downloadCsv('businesses-selected.csv', rows.filter((r) => selectedIds.has(r.id)));
      return;
    }
    const newStatus: BusinessStatus = action === 'approve' ? 'APPROVED' : 'SUSPENDED';
    setRows((prev) => prev.map((b) => (selectedIds.has(b.id) ? { ...b, status: newStatus } : b)));
    try {
      await post('/businesses/bulk', { ids, action });
    } catch {}
    setSelectedIds(new Set());
  }

  function exportAll() {
    downloadCsv('businesses.csv', filtered);
  }

  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Client organizations on WorkStream. Approve new signups, suspend bad actors."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => { setShowCreate(true); setCPassword(genPassword()); setShowPassword(false); }}>+ Add Business</Button>
            <Button variant="secondary" onClick={exportAll}>Export CSV</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, email, id…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as BusinessStatus | '')}>
          <option value="">All statuses</option>
          {['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <div className="ml-auto text-xs text-muted">{filtered.length} of {rows.length}</div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-fg">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => bulk('approve')}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => bulk('suspend')}>Suspend</Button>
            <Button size="sm" variant="outline" onClick={() => bulk('export')}>Export</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(b) => b.id}
        loading={loading}
        onRowClick={(b) => {
          setSelected(b);
          setDetailTab('overview');
        }}
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
      />

      {/* Create business drawer */}
      <Drawer
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateError(null); }}
        title="Add New Business"
        footer={
          <div className="flex gap-2">
            <Button onClick={createBusiness} disabled={creating}>{creating ? 'Creating…' : 'Create business'}</Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-xs text-muted">Creates the business and an owner account. The owner receives login credentials by email.</p>
          {createError && <div className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{createError}</div>}

          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">Owner details</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">First name *</label>
              <Input value={cOwnerFirst} onChange={(e) => setCOwnerFirst(e.target.value)} placeholder="Jane" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Last name</label>
              <Input value={cOwnerLast} onChange={(e) => setCOwnerLast(e.target.value)} placeholder="Wanjiku" />
            </div>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">Login credentials</div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Login email / username *</label>
            <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="jane@acme.com" />
            <p className="mt-1 text-[10px] text-muted">This is the email the owner will use to sign in at the client portal.</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Password *</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={cPassword}
                onChange={(e) => setCPassword(e.target.value)}
                placeholder="Auto-generated — edit to customise"
                className="pr-20"
              />
              <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-[10px] text-muted hover:text-fg"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-[10px] text-muted hover:text-fg"
                  onClick={() => { const p = genPassword(); setCPassword(p); setShowPassword(true); }}
                >
                  Regen
                </button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted">Min 8 chars. Share this with the owner — they can change it after first login.</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Phone</label>
            <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+254700000000" />
          </div>

          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">Business details</div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Business name *</label>
            <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Legal name</label>
            <Input value={cLegal} onChange={(e) => setCLegal(e.target.value)} placeholder="Acme Corporation Ltd." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Country</label>
              <Input value={cCountry} onChange={(e) => setCCountry(e.target.value)} placeholder="KE" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Industry</label>
              <Input value={cIndustry} onChange={(e) => setCIndustry(e.target.value)} placeholder="Technology, Finance…" />
            </div>
          </div>
        </div>
      </Drawer>

      {/* Credentials modal shown after successful creation */}
      {createdCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-fg">Business created</h3>
                <p className="mt-0.5 text-xs text-muted">{createdCreds.bizName} is pending approval.</p>
              </div>
              <button onClick={() => setCreatedCreds(null)} className="rounded p-1 text-muted hover:text-fg">✕</button>
            </div>

            <div className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
              <span className="text-base">✓</span>
              Credentials sent to {createdCreds.ownerName} via email{createdCreds.email ? ' and SMS' : ''}.
            </div>

            <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3 text-sm">
              {[
                { label: 'Login URL', value: (process.env.NEXT_PUBLIC_CLIENT_URL ?? 'http://localhost:3200') },
                { label: 'Email', value: createdCreds.email },
                { label: 'Password', value: createdCreds.tempPassword, mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-muted">{label}</span>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className={`truncate text-fg ${mono ? 'font-mono font-bold' : 'font-medium'}`}>{value}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(value)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-border hover:bg-surface hover:text-fg active:scale-95"
                      title="Copy"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-danger">Owner must change this password on first login.</p>

            <Button className="mt-4 w-full" onClick={() => setCreatedCreds(null)}>Done</Button>
          </div>
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setShowSuspend(false);
        }}
        title={selected?.name ?? ''}
        width="w-[640px]"
        footer={
          selected && (
            <div className="flex flex-wrap gap-2">
              {selected.status !== 'APPROVED' && <Button size="sm" onClick={() => update(selected, 'APPROVED')}>Approve</Button>}
              {selected.status !== 'SUSPENDED' && (
                <Button size="sm" variant="danger" onClick={() => setShowSuspend(true)}>Suspend…</Button>
              )}
              {selected.status !== 'REJECTED' && (
                <Button size="sm" variant="outline" onClick={() => update(selected, 'REJECTED')}>Reject</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => { setResetPwd(genPassword()); setShowResetPwd(true); setShowResetPwdVisible(false); setResetMsg(null); }}>
                Reset password…
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <div>
            <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
              {(['overview', 'kyc', 'members', 'workspace', 'finance', 'activity'] as DetailTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium capitalize ${
                    detailTab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {showResetPwd && (
              <div className="mb-4 rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-2 text-xs font-semibold text-fg">Reset owner password</div>
                <div className="relative">
                  <Input
                    type={showResetPwdVisible ? 'text' : 'password'}
                    value={resetPwd}
                    onChange={(e) => setResetPwd(e.target.value)}
                    placeholder="New password"
                    className="pr-20"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                    <button type="button" className="rounded px-2 py-0.5 text-[10px] text-muted hover:text-fg" onClick={() => setShowResetPwdVisible(v => !v)}>
                      {showResetPwdVisible ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" className="rounded px-2 py-0.5 text-[10px] text-muted hover:text-fg" onClick={() => { setResetPwd(genPassword()); setShowResetPwdVisible(true); }}>
                      Regen
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-muted">New credentials will be emailed and SMSed to the owner.</p>
                {resetMsg && <p className={`mt-1 text-xs ${resetMsg.startsWith('Error') ? 'text-danger' : 'text-success'}`}>{resetMsg}</p>}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={!resetPwd.trim() || resetting}
                    onClick={async () => {
                      if (!resetPwd.trim()) return;
                      setResetting(true);
                      setResetMsg(null);
                      try {
                        await post(`/admin/businesses/${selected.id}/reset-password`, { password: resetPwd.trim() });
                        setResetMsg('Password reset — credentials sent to owner.');
                        setTimeout(() => { setShowResetPwd(false); setResetMsg(null); }, 2500);
                      } catch (e: any) {
                        setResetMsg(`Error: ${e?.message ?? 'Failed'}`);
                      } finally {
                        setResetting(false);
                      }
                    }}
                  >
                    {resetting ? 'Sending…' : 'Reset & send'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowResetPwd(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {showSuspend && (
              <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3">
                <div className="mb-2 text-xs font-semibold text-danger">Suspend business — require reason</div>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Reason (kept in audit log and shared with owner)…"
                  className="h-20 w-full rounded-md border border-border bg-surface p-2 text-sm text-fg focus:border-brand focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!suspendReason.trim()}
                    onClick={() => {
                      update(selected, 'SUSPENDED', suspendReason.trim());
                      setShowSuspend(false);
                      setSuspendReason('');
                    }}
                  >
                    Confirm suspend
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSuspend(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {detailTab === 'overview' && (
              <div className="space-y-3 text-sm">
                <Row label="ID">{selected.id}</Row>
                <Row label="Legal name">{selected.legalName ?? selected.name}</Row>
                <Row label="Email">{selected.email}</Row>
                <Row label="Phone">{selected.phone ?? '—'}</Row>
                <Row label="Country">{selected.country ?? '—'}</Row>
                <Row label="Industry">{selected.industry ?? '—'}</Row>
                <Row label="Status"><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></Row>
                <Row label="Plan">
                  <PlanPicker businessId={selected.id} />
                </Row>
                <Row label="Tasks">{formatNumber(selected.taskCount)}</Row>
                <Row label="Agents">{formatNumber(selected.agentCount)}</Row>
                <Row label="Joined">{formatDate(selected.createdAt)}</Row>
              </div>
            )}

            {detailTab === 'kyc' && <KycDocs businessId={selected.id} />}
            {detailTab === 'members' && <Members businessId={selected.id} />}
            {detailTab === 'workspace' && <Workspace businessId={selected.id} />}
            {detailTab === 'finance' && <Finance businessId={selected.id} />}
            {detailTab === 'activity' && <BizActivity businessId={selected.id} />}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

function PlanPicker({ businessId }: { businessId: string }) {
  const [plan, setPlan] = useState<'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'>('STARTER');
  return (
    <Select
      value={plan}
      onChange={async (e) => {
        const v = e.target.value as typeof plan;
        setPlan(v);
        try {
          await patch(`/businesses/${businessId}`, { plan: v });
        } catch {}
      }}
    >
      {['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </Select>
  );
}

function KycDocs({ businessId }: { businessId: string }) {
  const [docs, setDocs] = useState<{ id: string; name: string; type: string; status: string; url?: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof docs } | typeof docs>(`/businesses/${businessId}/kyc`);
        setDocs(Array.isArray(d) ? d : (d?.items ?? []));
      } catch { /* graceful */ }
    })();
  }, [businessId]);
  if (docs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-2 py-8 text-center text-sm text-muted">
        No KYC documents submitted yet.
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
          <div>
            <div className="font-medium text-fg">{d.name}</div>
            <div className="text-xs text-muted">{d.type}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(d.status)}>{d.status}</Badge>
            <Button size="sm" variant="outline" onClick={() => alert(`Open: ${d.url ?? 'preview not wired'}`)}>
              View
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Members({ businessId }: { businessId: string }) {
  const [members, setMembers] = useState<{ id: string; email: string; name: string; role: string; at: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof members } | typeof members>(`/businesses/${businessId}/members`);
        setMembers(Array.isArray(d) ? d : (d?.items ?? []));
      } catch { /* graceful */ }
    })();
  }, [businessId]);
  if (members.length === 0) return <div className="rounded-md border border-dashed border-border bg-surface-2 py-8 text-center text-sm text-muted">No members found.</div>;
  return (
    <ul className="space-y-2 text-sm">
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
          <div>
            <div className="font-medium text-fg">{m.name}</div>
            <div className="text-xs text-muted">{m.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="brand">{m.role}</Badge>
            <span className="text-[11px] text-muted">{formatDate(m.at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Workspace({ businessId }: { businessId: string }) {
  const [ws, setWs] = useState<{ teams: number; activeTasks: number; integrations: string[]; slug: string } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ teams: number; activeTasks: number; integrations: string[]; slug: string }>(`/businesses/${businessId}/workspaces`);
        setWs(d);
      } catch { /* graceful */ }
    })();
  }, [businessId]);
  if (!ws) return <div className="rounded-md border border-dashed border-border bg-surface-2 py-8 text-center text-sm text-muted">Workspace details not available.</div>;
  return (
    <div className="space-y-3 text-sm">
      <Row label="Workspace slug">{ws.slug}</Row>
      <Row label="Teams">{ws.teams}</Row>
      <Row label="Active tasks">{ws.activeTasks}</Row>
      <Row label="Integrations">
        <div className="flex flex-wrap gap-1">
          {ws.integrations.map((i) => (
            <Badge key={i}>{i}</Badge>
          ))}
        </div>
      </Row>
    </div>
  );
}

interface WalletTx {
  id: string; type: string; status: string; amount: number; currency: string;
  description: string; reference: string | null; createdAt: string;
}

interface WalletData {
  id: string; businessId: string; balance: number; currency: string; status: string;
  updatedAt: string; transactions: WalletTx[];
}

const QUICK_FUND_AMOUNTS = [500, 1000, 2500, 5000, 10000];

function Finance({ businessId }: { businessId: string }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFund, setShowFund] = useState(false);
  const [fundAmount, setFundAmount] = useState(1000);
  const [fundNote, setFundNote] = useState('');
  const [fundType, setFundType] = useState<'CREDIT' | 'ADJUSTMENT' | 'TOPUP'>('CREDIT');
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);
  const [fundOk, setFundOk] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    get<WalletData>(`/admin/wallets/${businessId}`)
      .then((d) => setWallet(d))
      .catch(() => setWallet(null))
      .finally(() => setLoading(false));
  }, [businessId]);

  const doFund = async () => {
    if (!wallet) return;
    if (fundAmount < 1) { setFundErr('Amount must be at least 1'); return; }
    setFunding(true); setFundErr(null); setFundOk(null);
    try {
      const res = await post<any>(`/admin/wallets/${businessId}/fund`, {
        amountCents: Math.round(fundAmount * 100),
        note: fundNote || undefined,
        type: fundType,
      });
      const newBal: number = (res as any).newBalance ?? wallet.balance + fundAmount;
      const newTx: WalletTx = {
        id: `new-${Date.now()}`, type: fundType, status: 'COMPLETED', amount: fundAmount,
        currency: wallet.currency, description: fundNote ? `Admin credit: ${fundNote}` : 'Admin wallet credit',
        reference: (res as any).reference ?? null, createdAt: new Date().toISOString(),
      };
      setWallet((prev) => prev ? { ...prev, balance: newBal, transactions: [newTx, ...prev.transactions] } : prev);
      setFundOk(`Added ${formatMoney(fundAmount, wallet.currency)}. New balance: ${formatMoney(newBal, wallet.currency)}`);
      setFundAmount(1000); setFundNote(''); setShowFund(false);
    } catch (e: any) {
      setFundErr(e?.message ?? 'Failed to fund wallet');
    } finally {
      setFunding(false);
    }
  };

  if (loading) return <div className="py-4 text-center text-sm text-muted">Loading wallet…</div>;
  if (!wallet) return (
    <div className="py-4 text-center text-sm text-muted">
      No wallet found for this business yet.
    </div>
  );

  return (
    <div className="space-y-4 text-sm">
      {/* Balance card */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">Wallet balance</div>
          <div className="text-2xl font-bold text-fg">{formatMoney(wallet.balance, wallet.currency)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={wallet.status === 'ACTIVE' ? 'success' : 'danger'}>{wallet.status}</Badge>
          <Button size="sm" onClick={() => { setShowFund(!showFund); setFundErr(null); setFundOk(null); }}>
            {showFund ? 'Cancel' : 'Fund wallet'}
          </Button>
        </div>
      </div>

      {/* Fund success banner */}
      {fundOk && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">{fundOk}</div>
      )}

      {/* Fund form */}
      {showFund && (
        <div className="rounded-lg border border-brand/20 bg-brand/5 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand">Fund wallet</div>

          <div className="flex gap-2">
            {(['CREDIT', 'ADJUSTMENT', 'TOPUP'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFundType(t)}
                className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  fundType === t ? 'border-brand bg-brand text-brand-fg' : 'border-border text-muted hover:bg-surface-2'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_FUND_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setFundAmount(a)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  fundAmount === a ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted hover:bg-surface-2'
                }`}
              >
                {a.toLocaleString()}
              </button>
            ))}
          </div>

          <input
            type="number" min={1} value={fundAmount}
            onChange={(e) => setFundAmount(Number(e.target.value))}
            placeholder="Custom amount (KES)"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
          />
          <input
            type="text" value={fundNote}
            onChange={(e) => setFundNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
          />

          {fundErr && <div className="text-xs text-danger">{fundErr}</div>}

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Balance after: <strong className="text-fg">{formatMoney(wallet.balance + fundAmount, wallet.currency)}</strong></span>
            <Button size="sm" onClick={doFund} disabled={funding}>
              {funding ? 'Processing…' : `Add ${formatMoney(fundAmount, wallet.currency)}`}
            </Button>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Recent transactions</div>
        {wallet.transactions.length === 0 ? (
          <div className="rounded-md border border-border bg-surface-2 py-4 text-center text-xs text-muted">No transactions yet</div>
        ) : (
          <ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {wallet.transactions.slice(0, 20).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
                <div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    ['CREDIT', 'TOPUP', 'REFUND', 'ADJUSTMENT'].includes(tx.type)
                      ? 'bg-success/15 text-success'
                      : 'bg-muted/20 text-muted'
                  }`}>
                    {tx.type}
                  </span>
                  {tx.description && <span className="ml-2 text-xs text-muted">{tx.description}</span>}
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-success">+{formatMoney(tx.amount, tx.currency)}</div>
                  <div className="text-[10px] text-muted">{formatDate(tx.createdAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-base font-semibold ${tone === 'warn' ? 'text-warn' : 'text-fg'}`}>{value}</div>
    </div>
  );
}

function BizActivity({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<{ id: string; action: string; at: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof items } | typeof items>(`/businesses/${businessId}/activity`);
        setItems(Array.isArray(d) ? d : (d?.items ?? []));
      } catch { /* graceful */ }
    })();
  }, [businessId]);
  if (items.length === 0) return <div className="rounded-md border border-dashed border-border bg-surface-2 py-8 text-center text-sm text-muted">No recent activity.</div>;
  return (
    <ul className="space-y-2 text-xs">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
          <span className="font-medium text-fg">{it.action}</span>
          <span className="text-muted">{formatDate(it.at)}</span>
        </li>
      ))}
    </ul>
  );
}
