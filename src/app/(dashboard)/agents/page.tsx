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
import type { Agent, AgentStatus, KycStatus } from '@/lib/types';
import { formatDate, formatMoney, toFixed } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

type Tab = 'overview' | 'kyc' | 'skills' | 'performance' | 'earnings' | 'ratings' | 'disputes' | 'tasks';

export default function AgentsPage() {
  const [rows, setRows] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | AgentStatus>('');
  const [kyc, setKyc] = useState<'' | KycStatus>('');
  const [country, setCountry] = useState('');
  const [selected, setSelected] = useState<Agent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await get<Agent[] | { items: Agent[] }>('/agents');
        setRows(Array.isArray(data) ? data : data.items);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const countries = useMemo(() => Array.from(new Set(rows.map((a) => a.country).filter(Boolean))).sort() as string[], [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((a) => {
        if (status && a.status !== status) return false;
        if (kyc && a.kycStatus !== kyc) return false;
        if (country && a.country !== country) return false;
        if (q) {
          const s = q.toLowerCase();
          return a.fullName.toLowerCase().includes(s) || a.email.toLowerCase().includes(s) || a.id.toLowerCase().includes(s);
        }
        return true;
      }),
    [rows, q, status, kyc, country],
  );

  const columns: Column<Agent>[] = [
    {
      key: 'name',
      header: 'Agent',
      render: (a) => (
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${a.onlineNow ? 'bg-success' : 'bg-muted/50'}`} aria-hidden />
          <div>
            <div className="font-medium text-fg">{a.fullName}</div>
            <div className="text-xs text-muted">{a.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'country', header: 'Country', render: (a) => <span className="text-muted">{a.country ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={statusTone(a.status)}>{a.status}</Badge> },
    { key: 'kyc', header: 'KYC', render: (a) => <Badge tone={statusTone(a.kycStatus)}>{a.kycStatus}</Badge> },
    { key: 'rating', header: 'Rating', render: (a) => <span className="text-fg">{toFixed(a.rating, 1)}</span> },
    { key: 'tasks', header: 'Tasks', render: (a) => <span className="text-fg">{a.tasksCompleted}</span> },
    { key: 'last', header: 'Last seen', render: (a) => <span className="text-muted">{formatDate(a.lastSeenAt)}</span> },
  ];

  async function review(agent: Agent, decision: 'APPROVED' | 'REJECTED') {
    setRows((prev) => prev.map((r) => (r.id === agent.id ? { ...r, kycStatus: decision } : r)));
    setSelected({ ...agent, kycStatus: decision });
    try { await patch(`/admin/agents/${agent.id}/kyc`, { decision }); } catch {}
  }
  async function setStatusFor(agent: Agent, newStatus: AgentStatus) {
    setRows((prev) => prev.map((r) => (r.id === agent.id ? { ...r, status: newStatus } : r)));
    setSelected({ ...agent, status: newStatus });
    try { await patch(`/admin/agents/${agent.id}`, { status: newStatus }); } catch {}
  }
  async function bulk(action: 'approve-kyc' | 'suspend' | 'export') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'export') {
      downloadCsv('agents-selected.csv', rows.filter((r) => selectedIds.has(r.id)));
      return;
    }
    if (action === 'approve-kyc') {
      setRows((prev) => prev.map((a) => (selectedIds.has(a.id) ? { ...a, kycStatus: 'APPROVED' as const } : a)));
    } else if (action === 'suspend') {
      setRows((prev) => prev.map((a) => (selectedIds.has(a.id) ? { ...a, status: 'SUSPENDED' as const } : a)));
    }
    try { await post('/admin/agents/bulk', { ids, action }); } catch {}
    setSelectedIds(new Set());
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
        title="Agents"
        description="Remote workers. Review KYC submissions and manage availability."
        actions={<Button variant="secondary" onClick={() => downloadCsv('agents.csv', filtered)}>Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, email, id…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as AgentStatus | '')}>
          <option value="">All statuses</option>
          {['PENDING_KYC', 'ACTIVE', 'ONLINE', 'OFFLINE', 'SUSPENDED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={kyc} onChange={(e) => setKyc(e.target.value as KycStatus | '')}>
          <option value="">All KYC</option>
          {['NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="ml-auto text-xs text-muted">{filtered.length} of {rows.length}</div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-fg">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => bulk('approve-kyc')}>Approve KYC</Button>
            <Button size="sm" variant="danger" onClick={() => bulk('suspend')}>Suspend</Button>
            <Button size="sm" variant="outline" onClick={() => bulk('export')}>Export</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(a) => a.id}
        loading={loading}
        onRowClick={(a) => { setSelected(a); setTab('overview'); }}
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.fullName ?? ''}
        width="w-[640px]"
        footer={
          selected && (
            <div className="flex flex-wrap gap-2">
              {selected.kycStatus !== 'APPROVED' && <Button size="sm" onClick={() => review(selected, 'APPROVED')}>Approve KYC</Button>}
              {selected.kycStatus !== 'REJECTED' && <Button size="sm" variant="outline" onClick={() => review(selected, 'REJECTED')}>Reject KYC</Button>}
              {selected.status !== 'SUSPENDED'
                ? <Button size="sm" variant="danger" onClick={() => setStatusFor(selected, 'SUSPENDED')}>Suspend</Button>
                : <Button size="sm" onClick={() => setStatusFor(selected, 'ACTIVE')}>Reactivate</Button>
              }
            </div>
          )
        }
      >
        {selected && (
          <div>
            <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
              {(['overview', 'kyc', 'skills', 'performance', 'earnings', 'ratings', 'disputes', 'tasks'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium capitalize ${
                  tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                }`}>{t}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="space-y-3 text-sm">
                <Row label="ID">{selected.id}</Row>
                <Row label="Email">{selected.email}</Row>
                <Row label="Phone">{selected.phone ?? '—'}</Row>
                <Row label="Country">{selected.country ?? '—'}</Row>
                <Row label="Rating">{toFixed(selected.rating, 2)}</Row>
                <Row label="Tasks completed">{selected.tasksCompleted}</Row>
                <Row label="Status"><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></Row>
                <Row label="KYC"><Badge tone={statusTone(selected.kycStatus)}>{selected.kycStatus}</Badge></Row>
                <Row label="Last seen">{formatDate(selected.lastSeenAt)}</Row>
                <Row label="Joined">{formatDate(selected.createdAt)}</Row>
              </div>
            )}
            {tab === 'kyc' && <AgentKyc agentId={selected.id} />}
            {tab === 'skills' && <AgentSkills agent={selected} onChange={(skills) => setSelected({ ...selected, skills })} />}
            {tab === 'performance' && <AgentPerformance agentId={selected.id} />}
            {tab === 'earnings' && <AgentEarnings agentId={selected.id} />}
            {tab === 'ratings' && <AgentRatings agentId={selected.id} rating={selected.rating ?? 4} />}
            {tab === 'disputes' && <AgentDisputes agentId={selected.id} />}
            {tab === 'tasks' && <AgentTasks agentId={selected.id} />}
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

function AgentKyc({ agentId }: { agentId: string }) {
  const [docs, setDocs] = useState<{ id: string; type: string; status: string; url?: string }[]>([]);
  const [kycError, setKycError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof docs }>(`/admin/agents/${agentId}/kyc-docs`);
        setDocs(d.items);
      } catch (e: any) {
        setKycError(e?.message ?? 'Failed to load KYC docs');
      }
    })();
  }, [agentId]);
  if (kycError) return <div className="py-6 text-center text-sm text-danger">{kycError}</div>;
  return (
    <div className="space-y-2 text-sm">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
          <div className="font-medium text-fg">{d.type}</div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(d.status)}>{d.status}</Badge>
            <Button size="sm" variant="outline" onClick={() => alert(`Preview not wired: ${d.url ?? d.id}`)}>View</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentSkills({ agent, onChange }: { agent: Agent; onChange: (skills: string[]) => void }) {
  const [input, setInput] = useState('');
  async function save(skills: string[]) {
    onChange(skills);
    try { await patch(`/admin/agents/${agent.id}`, { skills }); } catch {}
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {(agent.skills ?? []).map((s) => (
          <span key={s} className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-fg">
            {s}
            <button
              onClick={() => save((agent.skills ?? []).filter((x) => x !== s))}
              className="text-muted hover:text-danger"
              aria-label={`Remove ${s}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add skill and press Enter" onKeyDown={(e) => {
          if (e.key === 'Enter' && input.trim()) {
            save([...(agent.skills ?? []), input.trim()]);
            setInput('');
          }
        }} />
        <Button size="sm" onClick={() => {
          if (input.trim()) { save([...(agent.skills ?? []), input.trim()]); setInput(''); }
        }}>Add</Button>
      </div>
    </div>
  );
}

function AgentPerformance({ agentId }: { agentId: string }) {
  const [data, setData] = useState<{ completionRate: number; onTimeRate: number; avgResponseMins: number; last30Tasks: number } | null>(null);
  const [perfError, setPerfError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ completionRate: number; onTimeRate: number; avgResponseMins: number; last30Tasks: number }>(`/admin/agents/${agentId}/performance`);
        setData(d);
      } catch (e: any) {
        setPerfError(e?.message ?? 'Failed to load performance');
      }
    })();
  }, [agentId]);
  if (perfError) return <div className="py-6 text-center text-sm text-danger">{perfError}</div>;
  if (!data) return <div className="py-6 text-center text-sm text-muted">Loading…</div>;
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <Metric label="Completion rate" value={`${data.completionRate}%`} />
      <Metric label="On-time rate" value={`${data.onTimeRate}%`} />
      <Metric label="Avg response" value={`${data.avgResponseMins} min`} />
      <Metric label="Tasks (30d)" value={String(data.last30Tasks)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-base font-semibold text-fg">{value}</div>
    </div>
  );
}

function AgentEarnings({ agentId }: { agentId: string }) {
  const [data, setData] = useState<{ totalEarnings: number; pendingPayout: number; lastPayout?: string; history: { id: string; amount: number; at: string; status: string }[] } | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ totalEarnings: number; pendingPayout: number; lastPayout?: string; history: { id: string; amount: number; at: string; status: string }[] }>(`/admin/agents/${agentId}/earnings`);
        setData(d);
      } catch (e: any) {
        setEarningsError(e?.message ?? 'Failed to load earnings');
      }
    })();
  }, [agentId]);
  if (earningsError) return <div className="py-6 text-center text-sm text-danger">{earningsError}</div>;
  if (!data) return <div className="py-6 text-center text-sm text-muted">Loading…</div>;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Total earnings" value={formatMoney(data.totalEarnings)} />
        <Metric label="Pending payout" value={formatMoney(data.pendingPayout)} />
      </div>
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Payout history</div>
        <ul className="space-y-1">
          {data.history.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-2 text-xs">
              <span className="font-mono text-muted">{h.id}</span>
              <span className="text-fg">{formatMoney(h.amount)}</span>
              <Badge tone={statusTone(h.status)}>{h.status}</Badge>
              <span className="text-muted">{formatDate(h.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AgentRatings({ agentId, rating }: { agentId: string; rating: number }) {
  const [dist, setDist] = useState<Record<number, number>>({});
  useEffect(() => {
    (async () => {
      try {
        const d = await get<Record<number, number>>(`/admin/agents/${agentId}/ratings`);
        setDist(d);
      } catch {
        // Silently leave dist empty — show zeros in bars
      }
    })();
  }, [agentId]);
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-2 text-sm">
      <div className="text-2xl font-bold text-fg">
        {toFixed(rating, 2)} <span className="text-xs font-normal text-muted">· {total} ratings</span>
      </div>
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = dist[stars] ?? 0;
        const pct = (count / total) * 100;
        return (
          <div key={stars} className="flex items-center gap-2 text-xs">
            <span className="w-6 text-muted">{stars}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-right text-muted">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentDisputes({ agentId }: { agentId: string }) {
  const [list, setList] = useState<{ id: string; reason: string; status: string; at: string }[]>([]);
  const [disputesError, setDisputesError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof list }>(`/admin/agents/${agentId}/disputes`);
        setList(d.items);
      } catch (e: any) {
        setDisputesError(e?.message ?? 'Failed to load disputes');
      }
    })();
  }, [agentId]);
  if (disputesError) return <div className="py-6 text-center text-sm text-danger">{disputesError}</div>;
  if (list.length === 0) return <div className="rounded-md border border-border bg-surface-2 p-4 text-center text-sm text-muted">No disputes.</div>;
  return (
    <ul className="space-y-2 text-xs">
      {list.map((d) => (
        <li key={d.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
          <div>
            <div className="font-mono text-muted">{d.id}</div>
            <div className="text-fg">{d.reason}</div>
          </div>
          <Badge tone={statusTone(d.status)}>{d.status}</Badge>
          <span className="text-muted">{formatDate(d.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function AgentTasks({ agentId }: { agentId: string }) {
  const [list, setList] = useState<{ id: string; title: string; status: string; at: string; budget?: number }[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof list }>(`/admin/agents/${agentId}/tasks`);
        setList(d.items);
      } catch (e: any) {
        setTasksError(e?.message ?? 'Failed to load tasks');
      }
    })();
  }, [agentId]);
  if (tasksError) return <div className="py-6 text-center text-sm text-danger">{tasksError}</div>;
  return (
    <ul className="space-y-2 text-xs">
      {list.map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
          <div>
            <div className="font-medium text-fg">{t.title}</div>
            <div className="font-mono text-muted">{t.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
            <span className="text-fg">{formatMoney(t.budget)}</span>
            <span className="text-muted">{formatDate(t.at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
