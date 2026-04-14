'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';
import { get, patch } from '@/lib/api';
import type { Agent, Task, Payout, AuditLog } from '@/lib/types';
import { formatDate, formatMoney, toFixed } from '@/lib/format';

type Tab = 'overview' | 'kyc' | 'performance' | 'tasks' | 'payouts' | 'audit';

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    (async () => {
      try {
        setAgentLoading(true);
        const data = await get<Agent>(`/agents/${id}`);
        setAgent(data);
      } catch (e: any) {
        setAgentError(e?.message ?? 'Failed to load agent');
      } finally {
        setAgentLoading(false);
      }
    })();
  }, [id]);

  if (agentLoading) return <div className="py-20 text-center text-muted">Loading agent…</div>;
  if (agentError) return (
    <div className="py-20 text-center">
      <p className="text-danger">{agentError}</p>
      <Link href="/agents" className="mt-2 block text-sm text-brand">← Back to agents</Link>
    </div>
  );
  if (!agent) {
    return (
      <>
        <PageHeader title="Agent not found" />
        <Link href="/agents" className="text-sm text-brand">← Back to agents</Link>
      </>
    );
  }

  const tabs: Tab[] = ['overview', 'kyc', 'performance', 'tasks', 'payouts', 'audit'];

  return (
    <>
      <PageHeader
        title={agent.fullName}
        description={`${agent.email} · ${agent.country ?? ''}`}
      />
      <Link href="/agents" className="text-sm text-brand">← Back to agents</Link>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'overview' && <OverviewTab agent={agent} onUpdate={setAgent} />}
        {tab === 'kyc' && <KycTab agent={agent} onUpdate={setAgent} />}
        {tab === 'performance' && <PerformanceTab agentId={agent.id} />}
        {tab === 'tasks' && <TasksTab agentId={agent.id} />}
        {tab === 'payouts' && <PayoutsTab agentId={agent.id} />}
        {tab === 'audit' && <AuditTab entityId={agent.id} />}
      </div>
    </>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────────────────────── */

function OverviewTab({ agent, onUpdate }: { agent: Agent; onUpdate: (a: Agent) => void }) {
  const [kycLoading, setKycLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  async function doKyc(status: 'APPROVED' | 'REJECTED') {
    if (!confirm(`${status === 'APPROVED' ? 'Approve' : 'Reject'} KYC for ${agent.fullName}?`)) return;
    setKycLoading(true);
    try {
      await patch(`/admin/agents/${agent.id}/kyc`, { status });
      onUpdate({ ...agent, kycStatus: status });
      alert(`KYC ${status.toLowerCase()} successfully.`);
    } catch {
      alert('Action failed — check console.');
    } finally {
      setKycLoading(false);
    }
  }

  async function doStatus(newStatus: 'ACTIVE' | 'SUSPENDED') {
    if (!confirm(`${newStatus === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${agent.fullName}?`)) return;
    setStatusLoading(true);
    try {
      await patch(`/admin/users/${agent.userId}/status`, { status: newStatus });
      onUpdate({ ...agent, status: newStatus as Agent['status'] });
      alert(`Agent ${newStatus.toLowerCase()} successfully.`);
    } catch {
      alert('Action failed — check console.');
    } finally {
      setStatusLoading(false);
    }
  }

  const availColor =
    agent.onlineNow ? 'bg-success' : agent.status === 'ONLINE' ? 'bg-success' : agent.status === 'OFFLINE' ? 'bg-muted/50' : 'bg-warning';

  const initials = agent.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Profile card */}
      <Card className="lg:col-span-2">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-xl font-bold text-brand">
              {initials}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-fg">{agent.fullName}</h2>
                <span className={`h-2.5 w-2.5 rounded-full ${availColor}`} title={agent.onlineNow ? 'Online' : 'Offline'} />
              </div>
              <div className="text-sm text-muted">{agent.email}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone={statusTone(agent.status)}>{agent.status}</Badge>
                <Badge tone={statusTone(agent.kycStatus)}>KYC · {agent.kycStatus}</Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 text-sm sm:grid-cols-4">
            <Metric label="Rating" value={toFixed(agent.rating, 2)} />
            <Metric label="Tasks completed" value={String(agent.tasksCompleted ?? 0)} />
            <Metric label="Phone" value={agent.phone ?? '—'} />
            <Metric label="Country" value={agent.country ?? '—'} />
            <Metric label="Joined" value={formatDate(agent.createdAt)} />
            <Metric label="Last seen" value={formatDate(agent.lastSeenAt)} />
            <Metric label="Updated" value={formatDate(agent.updatedAt)} />
            <Metric label="User ID" value={<span className="font-mono text-xs">{agent.userId}</span>} />
          </div>

          {/* Skills */}
          {(agent.skills ?? []).length > 0 && (
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Skills</div>
              <div className="flex flex-wrap gap-2">
                {(agent.skills ?? []).map((s) => (
                  <span key={s} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-fg">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {agent.kycStatus !== 'APPROVED' && (
            <Button
              className="w-full"
              size="sm"
              loading={kycLoading}
              disabled={kycLoading}
              onClick={() => doKyc('APPROVED')}
            >
              Approve KYC
            </Button>
          )}
          {agent.kycStatus !== 'REJECTED' && (
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              loading={kycLoading}
              disabled={kycLoading}
              onClick={() => doKyc('REJECTED')}
            >
              Reject KYC
            </Button>
          )}
          {agent.status !== 'SUSPENDED' ? (
            <Button
              className="w-full"
              size="sm"
              variant="danger"
              loading={statusLoading}
              disabled={statusLoading}
              onClick={() => doStatus('SUSPENDED')}
            >
              Suspend Agent
            </Button>
          ) : (
            <Button
              className="w-full"
              size="sm"
              loading={statusLoading}
              disabled={statusLoading}
              onClick={() => doStatus('ACTIVE')}
            >
              Reactivate Agent
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ─── KYC Tab ───────────────────────────────────────────────────────────────── */

function KycTab({ agent, onUpdate }: { agent: Agent; onUpdate: (a: Agent) => void }) {
  const [docs, setDocs] = useState<{ id: string; type: string; status: string; url?: string }[]>([]);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | ''>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof docs }>(`/admin/agents/${agent.id}/kyc-docs`);
        setDocs(d.items);
      } catch {
        // No mock fallback — leave empty, API not yet available
      }
    })();
  }, [agent.id]);

  async function submit() {
    if (!decision) { alert('Select Approve or Reject.'); return; }
    if (!confirm(`${decision === 'APPROVED' ? 'Approve' : 'Reject'} KYC for ${agent.fullName}?`)) return;
    setSubmitting(true);
    try {
      await patch(`/admin/agents/${agent.id}/kyc`, { status: decision, note });
      onUpdate({ ...agent, kycStatus: decision });
      setNote('');
      setDecision('');
      alert(`KYC ${decision.toLowerCase()} successfully.`);
    } catch {
      alert('Failed — check console.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <KV label="Current KYC status">
            <Badge tone={statusTone(agent.kycStatus)}>{agent.kycStatus}</Badge>
          </KV>
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3"
              >
                <div>
                  <div className="font-medium text-fg">{d.type}</div>
                  <div className="text-xs text-muted">{d.url ?? 'No URL available'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={d.status === 'NOT_STARTED' ? 'danger' : d.status === 'UPLOADED' || d.status === 'APPROVED' ? 'success' : 'neutral'}>
                    {d.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => alert(d.url ? `Document URL:\n${d.url}` : 'No document submitted for this slot.')}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review decision</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Decision</div>
            <Select
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED' | '')}
            >
              <option value="">Select…</option>
              <option value="APPROVED">Approve</option>
              <option value="REJECTED">Reject</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Note (optional)</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note or rejection reason…"
              className="h-24 w-full rounded-md border border-border bg-surface p-3 text-sm text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <Button
            loading={submitting}
            disabled={submitting || !decision}
            onClick={submit}
          >
            Submit decision
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─── Performance Tab ───────────────────────────────────────────────────────── */

interface QaSummary {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  completionRate: number;
  avgRating: number;
  avgQaScore: number;
  totalEarnings: number;
}

function PerformanceTab({ agentId }: { agentId: string }) {
  const [data, setData] = useState<QaSummary>({
    totalTasks: 0, completedTasks: 0, failedTasks: 0,
    completionRate: 0, avgRating: 0, avgQaScore: 0, totalEarnings: 0,
  });

  const [qaError, setQaError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<QaSummary>(`/qa/agents/${agentId}/summary`);
        setData(d);
      } catch (e: any) {
        setQaError(e?.message ?? 'Failed to load performance summary');
      }
    })();
  }, [agentId]);

  if (qaError) return <div className="py-6 text-center text-sm text-danger">{qaError}</div>;

  return (
    <Card>
      <CardHeader><CardTitle>Performance summary</CardTitle></CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total tasks" value={String(data.totalTasks)} />
          <Metric label="Completed" value={String(data.completedTasks)} />
          <Metric label="Failed" value={String(data.failedTasks)} />
          <Metric label="Completion rate" value={`${data.completionRate}%`} />
          <Metric label="Avg rating" value={toFixed(data.avgRating, 2)} />
          <Metric label="Avg QA score" value={`${data.avgQaScore}`} />
          <Metric label="Total earnings" value={formatMoney(data.totalEarnings)} />
        </div>
      </CardBody>
    </Card>
  );
}

/* ─── Tasks Tab ─────────────────────────────────────────────────────────────── */

function TasksTab({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Task[] | { items: Task[] }>(`/tasks?agentId=${agentId}`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setTaskError(e?.message ?? 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  const totalPages = Math.ceil(rows.length / pageSize);
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  if (taskError) return <div className="py-6 text-center text-sm text-danger">{taskError}</div>;

  const cols: Column<Task>[] = [
    { key: 'title', header: 'Task', render: (t) => <span className="font-medium text-fg">{t.title}</span> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
    { key: 'business', header: 'Business', render: (t) => <span className="text-muted">{t.businessName ?? t.businessId}</span> },
    { key: 'due', header: 'Due', render: (t) => <span className="text-muted">{formatDate(t.dueAt)}</span> },
    { key: 'created', header: 'Created', render: (t) => <span className="text-muted">{formatDate(t.createdAt)}</span> },
  ];

  return (
    <div className="space-y-3">
      <DataTable columns={cols} rows={paged} getRowId={(t) => t.id} loading={loading} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Page {page} of {totalPages} · {rows.length} tasks</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Payouts Tab ───────────────────────────────────────────────────────────── */

function PayoutsTab({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutsError, setPayoutsError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Payout[] | { items: Payout[] }>(`/payments/payouts?agentId=${agentId}`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setPayoutsError(e?.message ?? 'Failed to load payouts');
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  if (payoutsError) return <div className="py-6 text-center text-sm text-danger">{payoutsError}</div>;

  const cols: Column<Payout>[] = [
    { key: 'amount', header: 'Amount', render: (p) => <span className="font-medium text-fg">{formatMoney(p.amount, p.currency)}</span> },
    { key: 'method', header: 'Method', render: (p) => <span className="text-muted">{p.method}</span> },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs text-muted">{p.reference ?? '—'}</span> },
    { key: 'date', header: 'Date', render: (p) => <span className="text-muted">{formatDate(p.createdAt)}</span> },
    { key: 'processed', header: 'Processed', render: (p) => <span className="text-muted">{formatDate(p.processedAt)}</span> },
  ];

  return <DataTable columns={cols} rows={rows} getRowId={(p) => p.id} loading={loading} />;
}

/* ─── Audit Tab ─────────────────────────────────────────────────────────────── */

function AuditTab({ entityId }: { entityId: string }) {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<AuditLog[] | { items: AuditLog[] }>(`/admin/audit-logs?entityId=${entityId}`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setAuditError(e?.message ?? 'Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    })();
  }, [entityId]);

  if (auditError) return <div className="py-6 text-center text-sm text-danger">{auditError}</div>;

  const cols: Column<AuditLog>[] = [
    { key: 'action', header: 'Action', render: (l) => <span className="font-mono text-xs text-fg">{l.action}</span> },
    { key: 'resource', header: 'Entity', render: (l) => <span className="text-muted">{l.resource}</span> },
    { key: 'actor', header: 'Actor', render: (l) => <span className="text-muted">{l.actorEmail ?? l.actorId ?? '—'}</span> },
    { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-xs text-muted">{l.ipAddress ?? '—'}</span> },
    { key: 'ts', header: 'Timestamp', render: (l) => <span className="text-muted">{formatDate(l.createdAt)}</span> },
  ];

  return <DataTable columns={cols} rows={rows} getRowId={(l) => l.id} loading={loading} empty="No audit events found." />;
}

/* ─── Shared helpers ────────────────────────────────────────────────────────── */

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-base font-semibold text-fg">{value}</div>
    </div>
  );
}
