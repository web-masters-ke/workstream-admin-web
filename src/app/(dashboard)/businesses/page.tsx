'use client';

import { useEffect, useMemo, useState } from 'react';
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
          return b.name.toLowerCase().includes(s) || b.email.toLowerCase().includes(s) || b.id.toLowerCase().includes(s);
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

  async function update(biz: Business, newStatus: BusinessStatus, reason?: string) {
    setRows((prev) => prev.map((r) => (r.id === biz.id ? { ...r, status: newStatus } : r)));
    setSelected({ ...biz, status: newStatus });
    try {
      await patch(`/admin/businesses/${biz.id}`, { status: newStatus, reason });
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
      await post('/admin/businesses/bulk', { ids, action });
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
        actions={<Button variant="secondary" onClick={exportAll}>Export CSV</Button>}
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
          await patch(`/admin/businesses/${businessId}/plan`, { plan: v });
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
  const [kycError, setKycError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof docs }>(`/admin/businesses/${businessId}/kyc`);
        setDocs(d.items);
      } catch (e: any) {
        setKycError(e?.message ?? 'Failed to load KYC docs');
      }
    })();
  }, [businessId]);
  if (kycError) return <div className="py-4 text-center text-sm text-danger">{kycError}</div>;

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
  const [membersError, setMembersError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof members }>(`/admin/businesses/${businessId}/members`);
        setMembers(d.items);
      } catch (e: any) {
        setMembersError(e?.message ?? 'Failed to load members');
      }
    })();
  }, [businessId]);
  if (membersError) return <div className="py-4 text-center text-sm text-danger">{membersError}</div>;
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
  const [wsError, setWsError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ teams: number; activeTasks: number; integrations: string[]; slug: string }>(`/admin/businesses/${businessId}/workspace`);
        setWs(d);
      } catch (e: any) {
        setWsError(e?.message ?? 'Failed to load workspace');
      }
    })();
  }, [businessId]);
  if (wsError) return <div className="py-4 text-center text-sm text-danger">{wsError}</div>;
  if (!ws) return <div className="py-4 text-center text-sm text-muted">Loading…</div>;
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

function Finance({ businessId }: { businessId: string }) {
  const [f, setF] = useState<{ revenue: number; outstanding: number; mrr: number; lifetime: number; currency: string } | null>(null);
  const [finError, setFinError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ revenue: number; outstanding: number; mrr: number; lifetime: number; currency: string }>(`/admin/businesses/${businessId}/finance`);
        setF(d);
      } catch (e: any) {
        setFinError(e?.message ?? 'Failed to load finance');
      }
    })();
  }, [businessId]);
  if (finError) return <div className="py-4 text-center text-sm text-danger">{finError}</div>;
  if (!f) return <div className="py-4 text-center text-sm text-muted">Loading…</div>;
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <Metric label="Revenue (30d)" value={formatMoney(f.revenue, f.currency)} />
      <Metric label="Outstanding invoices" value={formatMoney(f.outstanding, f.currency)} tone="warn" />
      <Metric label="MRR" value={formatMoney(f.mrr, f.currency)} />
      <Metric label="Lifetime GMV" value={formatMoney(f.lifetime, f.currency)} />
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
  const [actError, setActError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof items }>(`/admin/businesses/${businessId}/activity`);
        setItems(d.items);
      } catch (e: any) {
        setActError(e?.message ?? 'Failed to load activity');
      }
    })();
  }, [businessId]);
  if (actError) return <div className="py-4 text-center text-sm text-danger">{actError}</div>;
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
