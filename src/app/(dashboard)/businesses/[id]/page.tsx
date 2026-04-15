'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable, Column } from '@/components/ui/DataTable';
import { get, patch } from '@/lib/api';
import type { Business, Task, AuditLog } from '@/lib/types';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

type Tab = 'overview' | 'workspaces' | 'members' | 'financial' | 'tasks' | 'audit';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceName?: string;
  joinedAt: string;
}

interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
}

interface Wallet {
  balance: number;
  currency: string;
}

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [biz, setBiz] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(true);
  const [bizError, setBizError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    (async () => {
      try {
        setBizLoading(true);
        const data = await get<Business>(`/businesses/${id}`);
        setBiz(data);
      } catch (e: any) {
        setBizError(e?.message ?? 'Failed to load business');
      } finally {
        setBizLoading(false);
      }
    })();
  }, [id]);

  if (bizLoading) return <div className="py-20 text-center text-muted">Loading business…</div>;
  if (bizError) return (
    <div className="py-20 text-center">
      <p className="text-danger">{bizError}</p>
      <Link href="/businesses" className="mt-2 block text-sm text-brand">← Back to businesses</Link>
    </div>
  );
  if (!biz) {
    return (
      <>
        <PageHeader title="Business not found" />
        <Link href="/businesses" className="text-sm text-brand">← Back to businesses</Link>
      </>
    );
  }

  const tabs: Tab[] = ['overview', 'workspaces', 'members', 'financial', 'tasks', 'audit'];

  return (
    <>
      <PageHeader title={biz.name} description={biz.legalName ?? biz.email} />
      <Link href="/businesses" className="text-sm text-brand">← Back to businesses</Link>

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
        {tab === 'overview' && <OverviewTab biz={biz} onUpdate={setBiz} />}
        {tab === 'workspaces' && <WorkspacesTab bizId={biz.id} />}
        {tab === 'members' && <MembersTab bizId={biz.id} />}
        {tab === 'financial' && <FinancialTab bizId={biz.id} />}
        {tab === 'tasks' && <TasksTab bizId={biz.id} />}
        {tab === 'audit' && <AuditTab entityId={biz.id} />}
      </div>
    </>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────────────────────── */

function OverviewTab({ biz, onUpdate }: { biz: Business; onUpdate: (b: Business) => void }) {
  const [actionLoading, setActionLoading] = useState(false);
  const [plan, setPlan] = useState('STARTER');

  async function doStatus(newStatus: Business['status']) {
    if (!confirm(`${newStatus === 'SUSPENDED' ? 'Suspend' : 'Approve'} ${biz.name}?`)) return;
    setActionLoading(true);
    try {
      await patch(`/businesses/${biz.id}`, { status: newStatus });
      onUpdate({ ...biz, status: newStatus });
      alert(`Business ${newStatus.toLowerCase()} successfully.`);
    } catch {
      alert('Action failed — check console.');
    } finally {
      setActionLoading(false);
    }
  }

  async function changePlan() {
    if (!confirm(`Change plan to ${plan} for ${biz.name}?`)) return;
    setActionLoading(true);
    try {
      await patch(`/businesses/${biz.id}`, { plan });
      alert(`Plan changed to ${plan}.`);
    } catch {
      alert('Action failed — check console.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Main info */}
      <Card className="lg:col-span-2">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-xl font-bold text-brand">
              {biz.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-fg">{biz.name}</h2>
              {biz.legalName && <div className="text-sm text-muted">{biz.legalName}</div>}
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone={statusTone(biz.status)}>{biz.status}</Badge>
                {biz.industry && (
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {biz.industry}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Metric label="Total tasks" value={formatNumber(biz.taskCount)} />
            <Metric label="Active agents" value={formatNumber(biz.agentCount)} />
            <Metric label="Country" value={biz.country ?? '—'} />
            <Metric label="Email" value={biz.email} />
            <Metric label="Phone" value={biz.phone ?? '—'} />
            <Metric label="Owner ID" value={<span className="font-mono text-xs">{biz.ownerId}</span>} />
            <Metric label="Verified" value={formatDate(biz.verifiedAt)} />
            <Metric label="Joined" value={formatDate(biz.createdAt)} />
            <Metric label="Updated" value={formatDate(biz.updatedAt)} />
          </div>
        </CardBody>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {biz.status !== 'APPROVED' && (
            <Button
              className="w-full"
              size="sm"
              loading={actionLoading}
              disabled={actionLoading}
              onClick={() => doStatus('APPROVED')}
            >
              Approve Business
            </Button>
          )}
          {biz.status !== 'SUSPENDED' ? (
            <Button
              className="w-full"
              size="sm"
              variant="danger"
              loading={actionLoading}
              disabled={actionLoading}
              onClick={() => doStatus('SUSPENDED')}
            >
              Suspend Business
            </Button>
          ) : (
            <Button
              className="w-full"
              size="sm"
              loading={actionLoading}
              disabled={actionLoading}
              onClick={() => doStatus('APPROVED')}
            >
              Reinstate Business
            </Button>
          )}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted">Change plan</div>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="ENTERPRISE">Enterprise</option>
            </Select>
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              loading={actionLoading}
              disabled={actionLoading}
              onClick={changePlan}
            >
              Apply plan
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─── Workspaces Tab ────────────────────────────────────────────────────────── */

function WorkspacesTab({ bizId }: { bizId: string }) {
  const [rows, setRows] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Workspace[] | { items: Workspace[] }>(`/businesses/${bizId}/workspaces`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setWsError(e?.message ?? 'Failed to load workspaces');
      } finally {
        setLoading(false);
      }
    })();
  }, [bizId]);

  if (loading) return <div className="py-8 text-center text-muted text-sm">Loading…</div>;
  if (wsError) return <div className="py-8 text-center text-sm text-danger">{wsError}</div>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.length === 0 && (
        <div className="rounded-md border border-border bg-surface p-6 text-center text-muted text-sm col-span-2">
          No workspaces found.
        </div>
      )}
      {rows.map((ws) => (
        <Card key={ws.id}>
          <CardBody>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-fg">{ws.name}</div>
                {ws.description && <div className="mt-0.5 text-sm text-muted">{ws.description}</div>}
              </div>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                {ws.memberCount} members
              </span>
            </div>
            <div className="mt-2 text-xs text-muted">Created {formatDate(ws.createdAt)}</div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/* ─── Members Tab ───────────────────────────────────────────────────────────── */

function MembersTab({ bizId }: { bizId: string }) {
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Member[] | { items: Member[] }>(`/businesses/${bizId}/members`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setMembersError(e?.message ?? 'Failed to load members');
      } finally {
        setLoading(false);
      }
    })();
  }, [bizId]);

  if (membersError) return <div className="py-8 text-center text-sm text-danger">{membersError}</div>;

  const cols: Column<Member>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (m) => (
        <div>
          <div className="font-medium text-fg">{m.name}</div>
          <div className="text-xs text-muted">{m.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (m) => <Badge tone={m.role === 'OWNER' ? 'brand' : m.role === 'ADMIN' ? 'info' : 'neutral'}>{m.role}</Badge> },
    { key: 'workspace', header: 'Workspace', render: (m) => <span className="text-muted">{m.workspaceName ?? '—'}</span> },
    { key: 'joined', header: 'Joined', render: (m) => <span className="text-muted">{formatDate(m.joinedAt)}</span> },
  ];

  return <DataTable columns={cols} rows={rows} getRowId={(m) => m.id} loading={loading} />;
}

/* ─── Financial Tab ─────────────────────────────────────────────────────────── */

function FinancialTab({ bizId }: { bizId: string }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [finError, setFinError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<{ wallet: Wallet; invoices: Invoice[] | { items: Invoice[] } }>(`/payments/invoices?businessId=${bizId}`);
        setWallet(d.wallet);
        setInvoices(Array.isArray(d.invoices) ? d.invoices : d.invoices.items);
      } catch (e: any) {
        setFinError(e?.message ?? 'Failed to load financial data');
      } finally {
        setLoading(false);
      }
    })();
  }, [bizId]);

  if (finError) return <div className="py-8 text-center text-sm text-danger">{finError}</div>;

  const cols: Column<Invoice>[] = [
    { key: 'number', header: 'Invoice #', render: (inv) => <span className="font-mono text-xs text-fg">{inv.number}</span> },
    { key: 'amount', header: 'Amount', render: (inv) => <span className="font-medium text-fg">{formatMoney(inv.amount, inv.currency)}</span> },
    { key: 'status', header: 'Status', render: (inv) => <Badge tone={statusTone(inv.status)}>{inv.status}</Badge> },
    { key: 'issued', header: 'Issued', render: (inv) => <span className="text-muted">{formatDate(inv.issuedAt)}</span> },
    { key: 'due', header: 'Due', render: (inv) => <span className="text-muted">{formatDate(inv.dueAt)}</span> },
    { key: 'paid', header: 'Paid', render: (inv) => <span className="text-muted">{formatDate(inv.paidAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      {wallet && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted">Wallet balance</div>
                <div className="mt-1 text-2xl font-bold text-fg">{formatMoney(wallet.balance, wallet.currency)}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardBody className="p-0">
          <DataTable columns={cols} rows={invoices} getRowId={(inv) => inv.id} loading={loading} />
        </CardBody>
      </Card>
    </div>
  );
}

/* ─── Tasks Tab ─────────────────────────────────────────────────────────────── */

function TasksTab({ bizId }: { bizId: string }) {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Task[] | { items: Task[] }>(`/tasks?businessId=${bizId}`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setTasksError(e?.message ?? 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    })();
  }, [bizId]);

  const totalPages = Math.ceil(rows.length / pageSize);
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  if (tasksError) return <div className="py-8 text-center text-sm text-danger">{tasksError}</div>;

  const cols: Column<Task>[] = [
    { key: 'title', header: 'Task', render: (t) => <span className="font-medium text-fg">{t.title}</span> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
    { key: 'agent', header: 'Agent', render: (t) => <span className="text-muted">{t.assignedAgentName ?? '—'}</span> },
    { key: 'budget', header: 'Budget', render: (t) => <span className="text-fg">{formatMoney(t.budget, t.currency)}</span> },
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

  if (auditError) return <div className="py-8 text-center text-sm text-danger">{auditError}</div>;

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

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-fg">{value}</div>
    </div>
  );
}
