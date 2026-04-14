'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { get, post, patch } from '@/lib/api';
import type { Payment, Payout, PaymentStatus, PayoutStatus } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | PaymentStatus>('');
  const [payoutStatus, setPayoutStatus] = useState<'' | PayoutStatus>('');
  const [method, setMethod] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [tab, setTab] = useState<'transactions' | 'payouts' | 'reconciliation' | 'fees'>('transactions');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [p, po] = await Promise.all([
          get<Payment[] | { items: Payment[] }>('/payments/invoices'),
          get<Payout[] | { items: Payout[] }>('/payments/payouts'),
        ]);
        setPayments(Array.isArray(p) ? p : p.items);
        setPayouts(Array.isArray(po) ? po : po.items);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const gross = payments.reduce((a, p) => a + (p.status === 'COMPLETED' ? p.amount : 0), 0);
  const fees = payments.reduce((a, p) => a + (p.fee ?? 0), 0);
  const pending = payments.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING').length;
  const failed = payments.filter((p) => p.status === 'FAILED').length;
  const pendingPayouts = payouts.filter((p) => p.status === 'PENDING').length;

  const methods = useMemo(() => Array.from(new Set(payments.map((p) => p.method).filter(Boolean))).sort() as string[], [payments]);

  const filteredPayments = useMemo(
    () =>
      payments.filter((p) => {
        if (status && p.status !== status) return false;
        if (method && p.method !== method) return false;
        if (fromDate && new Date(p.createdAt) < new Date(fromDate)) return false;
        if (toDate && new Date(p.createdAt) > new Date(`${toDate}T23:59:59`)) return false;
        if (q) {
          const s = q.toLowerCase();
          return p.id.toLowerCase().includes(s) || (p.reference ?? '').toLowerCase().includes(s) || (p.method ?? '').toLowerCase().includes(s);
        }
        return true;
      }),
    [payments, q, status, method, fromDate, toDate],
  );

  const filteredPayouts = useMemo(
    () => payouts.filter((p) => !payoutStatus || p.status === payoutStatus),
    [payouts, payoutStatus],
  );

  const paymentCols: Column<Payment>[] = [
    { key: 'id', header: 'ID', render: (p) => <span className="font-mono text-xs text-muted">{p.id}</span> },
    { key: 'type', header: 'Type', render: (p) => <Badge>{p.type}</Badge> },
    { key: 'amount', header: 'Amount', render: (p) => <span className="font-medium text-fg">{formatMoney(p.amount, p.currency)}</span> },
    { key: 'fee', header: 'Fee', render: (p) => <span className="text-muted">{formatMoney(p.fee, p.currency)}</span> },
    { key: 'method', header: 'Method', render: (p) => <span className="text-muted">{p.method}</span> },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs text-muted">{p.reference}</span> },
    { key: 'created', header: 'Created', render: (p) => <span className="text-muted">{formatDate(p.createdAt)}</span> },
  ];

  const payoutCols: Column<Payout>[] = [
    { key: 'id', header: 'ID', render: (p) => <span className="font-mono text-xs text-muted">{p.id}</span> },
    { key: 'agent', header: 'Agent', render: (p) => <span className="text-fg">{p.agentName ?? p.agentId}</span> },
    { key: 'amount', header: 'Amount', render: (p) => <span className="font-medium text-fg">{formatMoney(p.amount, p.currency)}</span> },
    { key: 'method', header: 'Method', render: (p) => <span className="text-muted">{p.method}</span> },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs text-muted">{p.reference}</span> },
    { key: 'created', header: 'Created', render: (p) => <span className="text-muted">{formatDate(p.createdAt)}</span> },
    {
      key: 'actions',
      header: '',
      render: (p) =>
        p.status === 'PENDING' ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => approvePayout(p)}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => rejectPayout(p)}>Reject</Button>
          </div>
        ) : p.status === 'FAILED' ? (
          <Button size="sm" variant="outline" onClick={() => retryPayout(p)}>Retry</Button>
        ) : null,
    },
  ];

  async function approvePayout(p: Payout) {
    setPayouts((prev) => prev.map((r) => (r.id === p.id ? { ...r, status: 'PROCESSING' as const } : r)));
    try { await patch(`/admin/payouts/${p.id}`, { status: 'PROCESSING' }); } catch {}
  }
  async function rejectPayout(p: Payout) {
    setPayouts((prev) => prev.map((r) => (r.id === p.id ? { ...r, status: 'CANCELLED' as const } : r)));
    try { await patch(`/admin/payouts/${p.id}`, { status: 'CANCELLED' }); } catch {}
  }
  async function retryPayout(p: Payout) {
    setPayouts((prev) => prev.map((r) => (r.id === p.id ? { ...r, status: 'PENDING' as const } : r)));
    try { await post(`/admin/payouts/${p.id}/retry`, {}); } catch {}
  }

  async function issueRefund() {
    if (!selectedPayment) return;
    const amt = refundAmount ? Number(refundAmount) : selectedPayment.amount;
    try { await post(`/admin/payments/${selectedPayment.id}/refund`, { amount: amt }); } catch {}
    setPayments((prev) => prev.map((r) => (r.id === selectedPayment.id ? { ...r, status: 'REFUNDED' as const } : r)));
    setSelectedPayment(null);
    setRefundAmount('');
  }
  async function retryPayment(p: Payment) {
    setPayments((prev) => prev.map((r) => (r.id === p.id ? { ...r, status: 'PROCESSING' as const } : r)));
    try { await post(`/admin/payments/${p.id}/retry`, {}); } catch {}
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading payments…</div>;
  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="Transactions, payouts, and fraud indicators across the platform."
        actions={
          <Button variant="secondary" onClick={() => { tab === 'payouts' ? downloadCsv('payouts.csv', payouts) : downloadCsv('payments.csv', filteredPayments); }}>
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Gross volume" value={formatMoney(gross)} trend={4.2} />
        <StatCard label="Platform fees" value={formatMoney(fees)} trend={3.8} />
        <StatCard label="Pending txns" value={pending} />
        <StatCard label="Failed txns" value={failed} hint="needs review" />
        <StatCard label="Pending payouts" value={pendingPayouts} hint="needs approval" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {(['transactions', 'payouts', 'reconciliation', 'fees'] as const).map((t) => (
              <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>{t === 'reconciliation' ? 'Recon' : t.charAt(0).toUpperCase() + t.slice(1)}</TabBtn>
            ))}
          </div>
          <CardTitle className="hidden sm:block">Finance</CardTitle>
        </CardHeader>
        <CardBody>
          {tab === 'transactions' && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input placeholder="Search id, reference…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
                <Select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}>
                  <option value="">All statuses</option>
                  {['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="">All methods</option>
                  {methods.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
                <div className="ml-auto text-xs text-muted">{filteredPayments.length} of {payments.length}</div>
              </div>
              <DataTable columns={paymentCols} rows={filteredPayments} getRowId={(p) => p.id} onRowClick={setSelectedPayment} />
            </>
          )}
          {tab === 'payouts' && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <Select value={payoutStatus} onChange={(e) => setPayoutStatus(e.target.value as PayoutStatus | '')}>
                  <option value="">All statuses</option>
                  {['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <DataTable columns={payoutCols} rows={filteredPayouts} getRowId={(p) => p.id} />
            </>
          )}
          {tab === 'reconciliation' && <ReconciliationView payments={payments} payouts={payouts} />}
          {tab === 'fees' && (
            <div className="space-y-2 text-sm">
              <FeeRow label="Platform fee %" value="12.0%" />
              <FeeRow label="Payout processing fee" value="0.9% + $0.30" />
              <FeeRow label="Total fees collected (30d)" value={formatMoney(fees)} />
              <FeeRow label="Net revenue" value={formatMoney(gross - fees)} />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Refund drawer */}
      <Drawer
        open={!!selectedPayment}
        onClose={() => { setSelectedPayment(null); setRefundAmount(''); }}
        title={selectedPayment ? `Payment ${selectedPayment.id}` : ''}
        footer={
          selectedPayment && (
            <div className="flex flex-wrap gap-2">
              {selectedPayment.status !== 'REFUNDED' && (
                <Button size="sm" variant="danger" onClick={issueRefund}>Issue refund</Button>
              )}
              {selectedPayment.status === 'FAILED' && (
                <Button size="sm" onClick={() => retryPayment(selectedPayment)}>Retry</Button>
              )}
            </div>
          )
        }
      >
        {selectedPayment && (
          <div className="space-y-3 text-sm">
            <Row label="ID">{selectedPayment.id}</Row>
            <Row label="Type"><Badge>{selectedPayment.type}</Badge></Row>
            <Row label="Status"><Badge tone={statusTone(selectedPayment.status)}>{selectedPayment.status}</Badge></Row>
            <Row label="Amount">{formatMoney(selectedPayment.amount, selectedPayment.currency)}</Row>
            <Row label="Fee">{formatMoney(selectedPayment.fee, selectedPayment.currency)}</Row>
            <Row label="Net">{formatMoney((selectedPayment.amount ?? 0) - (selectedPayment.fee ?? 0), selectedPayment.currency)}</Row>
            <Row label="Method">{selectedPayment.method ?? '—'}</Row>
            <Row label="Reference">{selectedPayment.reference ?? '—'}</Row>
            <Row label="Created">{formatDate(selectedPayment.createdAt)}</Row>
            <Row label="Completed">{formatDate(selectedPayment.completedAt)}</Row>
            {selectedPayment.status !== 'REFUNDED' && (
              <div className="rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Refund amount (blank for full)</div>
                <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={`Max ${selectedPayment.amount}`} />
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${active ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}
    >
      {children}
    </button>
  );
}

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-4 py-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

function ReconciliationView({ payments, payouts }: { payments: Payment[]; payouts: Payout[] }) {
  const totalInflow = payments.filter((p) => p.status === 'COMPLETED' && ['DEPOSIT', 'ESCROW'].includes(p.type)).reduce((a, p) => a + p.amount, 0);
  const totalOutflow = payouts.filter((p) => p.status === 'COMPLETED').reduce((a, p) => a + p.amount, 0);
  const totalFees = payments.reduce((a, p) => a + (p.fee ?? 0), 0);
  const balance = totalInflow - totalOutflow - totalFees;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReconCard label="Total inflow" value={formatMoney(totalInflow)} />
        <ReconCard label="Total outflow" value={formatMoney(totalOutflow)} />
        <ReconCard label="Fees collected" value={formatMoney(totalFees)} />
        <ReconCard label="Net balance" value={formatMoney(balance)} tone={balance >= 0 ? 'success' : 'danger'} />
      </div>
      <div className="mt-4 text-xs text-muted">
        Reconciliation is computed client-side from cached data. For an authoritative view, run backend reconciliation jobs.
      </div>
    </div>
  );
}

function ReconCard({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-fg'}`}>{value}</div>
    </div>
  );
}
