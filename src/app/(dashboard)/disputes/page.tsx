'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, patch, post } from '@/lib/api';
import type { Dispute, DisputeStatus } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

export default function DisputesPage() {
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'' | DisputeStatus>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'detail' | 'evidence' | 'messages'>('detail');
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await get<Dispute[] | { items: Dispute[] }>('/admin/disputes');
        setRows(Array.isArray(data) ? data : data.items);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load disputes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((d) => {
        if (status && d.status !== status) return false;
        if (q) {
          const s = q.toLowerCase();
          return d.id.toLowerCase().includes(s) || d.reason.toLowerCase().includes(s) || (d.taskTitle ?? '').toLowerCase().includes(s);
        }
        return true;
      }),
    [rows, status, q],
  );

  // SLA helper (48h)
  function slaRemaining(d: Dispute) {
    const created = new Date(d.createdAt).getTime();
    const deadline = created + 48 * 3600 * 1000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return 'BREACHED';
    const hours = Math.floor(remaining / 3600_000);
    return `${hours}h left`;
  }

  const cols: Column<Dispute>[] = [
    { key: 'id', header: 'ID', render: (d) => <span className="font-mono text-xs text-muted">{d.id}</span> },
    { key: 'task', header: 'Task', render: (d) => <span className="text-fg">{d.taskTitle ?? d.taskId}</span> },
    { key: 'reason', header: 'Reason', render: (d) => <span className="text-muted max-w-[200px] truncate block">{d.reason}</span> },
    { key: 'opener', header: 'Opened by', render: (d) => <span className="text-muted">{d.openedByName ?? d.openedByUserId}</span> },
    { key: 'status', header: 'Status', render: (d) => <Badge tone={statusTone(d.status)}>{d.status}</Badge> },
    {
      key: 'sla',
      header: 'SLA',
      render: (d) => {
        const sla = slaRemaining(d);
        return <span className={sla === 'BREACHED' ? 'text-danger font-semibold' : 'text-muted'}>{sla}</span>;
      },
    },
    { key: 'created', header: 'Opened', render: (d) => <span className="text-muted">{formatDate(d.createdAt)}</span> },
    {
      key: 'actions',
      header: '',
      render: (d) => {
        if (['RESOLVED', 'CLOSED'].includes(d.status)) {
          return <span className="text-xs text-muted">Closed</span>;
        }
        const busy = actioning === d.id;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {d.status !== 'UNDER_REVIEW' && (
              <button
                disabled={busy}
                onClick={() => quickAction(d, 'UNDER_REVIEW')}
                className="rounded px-2 py-1 text-[10px] font-semibold bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 transition-colors"
                title="Take ownership — move to Under Review"
              >
                {busy ? '…' : 'Own'}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => quickAction(d, 'RESOLVED')}
              className="rounded px-2 py-1 text-[10px] font-semibold bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
              title="Resolve dispute"
            >
              {busy ? '…' : 'Resolve'}
            </button>
            <button
              disabled={busy}
              onClick={() => quickAction(d, 'ESCALATED')}
              className="rounded px-2 py-1 text-[10px] font-semibold bg-warn/15 text-warn hover:bg-warn/25 disabled:opacity-50 transition-colors"
              title="Escalate to senior staff"
            >
              {busy ? '…' : 'Escalate'}
            </button>
            <button
              disabled={busy}
              onClick={() => quickAction(d, 'CLOSED')}
              className="rounded px-2 py-1 text-[10px] font-semibold bg-muted/15 text-muted hover:bg-muted/25 disabled:opacity-50 transition-colors"
              title="Close without action"
            >
              {busy ? '…' : 'Close'}
            </button>
          </div>
        );
      },
    },
  ];

  async function resolve(d: Dispute, newStatus: DisputeStatus) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === d.id ? { ...r, status: newStatus, resolutionNote: resolution, resolvedAt: new Date().toISOString() } : r,
      ),
    );
    setSelected(null);
    setResolution('');
    setRefundAmount('');
    try {
      await patch(`/admin/disputes/${d.id}`, { status: newStatus, resolutionNote: resolution, refundAmount: refundAmount ? Number(refundAmount) : undefined });
    } catch {}
  }

  // Quick inline action — no drawer needed for common one-click actions
  async function quickAction(d: Dispute, newStatus: DisputeStatus) {
    if (actioning) return;
    setActioning(d.id);
    setRows((prev) =>
      prev.map((r) => r.id === d.id ? { ...r, status: newStatus, resolvedAt: newStatus !== 'UNDER_REVIEW' ? new Date().toISOString() : r.resolvedAt } : r),
    );
    try {
      await patch(`/admin/disputes/${d.id}`, { status: newStatus });
    } catch {} finally {
      setActioning(null);
    }
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading disputes…</div>;
  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Disputes"
        description="Review, mediate and close disputed tasks."
        actions={<Button variant="secondary" onClick={() => downloadCsv('disputes.csv', filtered)}>Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search id, reason, task…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as DisputeStatus | '')}>
          <option value="">All statuses</option>
          {['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED', 'CLOSED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <div className="ml-auto text-xs text-muted">{filtered.length} of {rows.length}</div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-fg">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadCsv('disputes-selected.csv', rows.filter((r) => selectedIds.has(r.id)))}>Export</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <DataTable
        columns={cols}
        rows={filtered}
        getRowId={(d) => d.id}
        onRowClick={(d) => { setSelected(d); setTab('detail'); }}
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
      />

      <Drawer
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setResolution('');
          setRefundAmount('');
        }}
        title={selected ? `Dispute · ${selected.id}` : ''}
        width="w-[600px]"
        footer={
          selected && !['RESOLVED', 'CLOSED'].includes(selected.status) && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => resolve(selected, 'RESOLVED')}>Resolve</Button>
              <Button size="sm" variant="outline" onClick={() => resolve(selected, 'UNDER_REVIEW')}>Take ownership</Button>
              <Button size="sm" variant="danger" onClick={() => resolve(selected, 'ESCALATED')}>Escalate to senior</Button>
              <Button size="sm" variant="ghost" onClick={() => resolve(selected, 'CLOSED')}>Close without action</Button>
            </div>
          )
        }
      >
        {selected && (
          <div>
            <div className="mb-4 flex gap-2 border-b border-border">
              {(['detail', 'evidence', 'messages'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`border-b-2 px-3 py-2 text-xs font-medium capitalize ${
                    tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'detail' && (
              <div className="space-y-4 text-sm">
                <Row label="Task">{selected.taskTitle ?? selected.taskId}</Row>
                <Row label="Reason">{selected.reason}</Row>
                <Row label="Opened by">{selected.openedByName ?? selected.openedByUserId}</Row>
                <Row label="Against">{selected.againstUserId ?? '—'}</Row>
                <Row label="Status"><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></Row>
                <Row label="SLA timer">
                  {(() => {
                    const sla = slaRemaining(selected);
                    return <span className={sla === 'BREACHED' ? 'text-danger font-semibold' : 'text-fg'}>{sla}</span>;
                  })()}
                </Row>
                <Row label="Opened">{formatDate(selected.createdAt)}</Row>
                <Row label="Resolved">{formatDate(selected.resolvedAt)}</Row>

                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Resolution note</div>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Internal notes (kept in audit log)…"
                    className="h-28 w-full rounded-md border border-border bg-surface p-3 text-sm text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Refund amount (optional)</div>
                  <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="0.00 USD" />
                </div>
              </div>
            )}

            {tab === 'evidence' && <DisputeEvidence disputeId={selected.id} />}
            {tab === 'messages' && <DisputeMessages disputeId={selected.id} />}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

function DisputeEvidence({ disputeId }: { disputeId: string }) {
  const [items, setItems] = useState<{ id: string; type: string; label: string; party: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof items }>(`/admin/disputes/${disputeId}/evidence`);
        setItems(Array.isArray(d) ? d : (d?.items ?? []));
      } catch {
        // Evidence sub-resource not yet available — show empty state
      }
    })();
  }, [disputeId]);
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-2 py-10 text-center text-sm text-muted">
        No evidence submitted for this dispute yet.
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      {items.map((e) => (
        <div key={e.id} className="rounded-md border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-fg">{e.label}</span>
            <Badge tone={e.party === 'business' ? 'info' : 'brand'}>{e.party}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted">Type: {e.type}</div>
        </div>
      ))}
    </div>
  );
}

function DisputeMessages({ disputeId }: { disputeId: string }) {
  const [msgs, setMsgs] = useState<{ id: string; author: string; role: string; body: string; at: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof msgs }>(`/admin/disputes/${disputeId}/messages`);
        setMsgs(Array.isArray(d) ? d : (d?.items ?? []));
      } catch {
        // Messages sub-resource not yet available — show empty state
      }
    })();
  }, [disputeId]);
  if (msgs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-2 py-10 text-center text-sm text-muted">
        No messages on this dispute yet.
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      {msgs.map((m) => (
        <div key={m.id} className="rounded-md border border-border bg-surface-2 p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-fg">{m.author}</span>
            <Badge tone={m.role === 'ADMIN' ? 'brand' : m.role === 'BUSINESS' ? 'info' : 'neutral'}>{m.role}</Badge>
            <span className="ml-auto text-[10px] text-muted">{formatDate(m.at)}</span>
          </div>
          <p className="text-muted">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
