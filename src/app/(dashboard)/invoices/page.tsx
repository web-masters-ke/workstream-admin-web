'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { StatCard } from '@/components/ui/StatCard';
import { get, post, patch, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Business } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'PAID' | 'PENDING' | 'OVERDUE' | 'DRAFT' | 'CANCELLED';

interface Invoice {
  id: string;
  invoiceNumber?: string;
  businessId?: string;
  businessName?: string;
  amount: number;
  currency?: string;
  status: InvoiceStatus;
  description?: string;
  issuedAt?: string;
  dueAt?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function invoiceTone(status: InvoiceStatus): 'success' | 'danger' | 'warn' | 'neutral' | 'info' {
  if (status === 'PAID') return 'success';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PENDING') return 'warn';
  if (status === 'CANCELLED') return 'danger';
  return 'info'; // DRAFT
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [tab, setTab] = useState<'ALL' | InvoiceStatus>('ALL');
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Detail drawer
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Create drawer
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    businessId: '',
    amount: '',
    currency: 'KES',
    description: '',
    dueAt: '',
    issuedAt: todayIso(),
  });
  const [formBusy, setFormBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // ── Load data ──
  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      get<Invoice[] | { items: Invoice[] }>('/payments/invoices?page=1&limit=200').catch(() => [] as Invoice[]),
      get<Business[] | { items: Business[] }>('/businesses?limit=100').catch(() => [] as Business[]),
    ])
      .then(([rawInv, rawBiz]) => {
        setInvoices(Array.isArray(rawInv) ? rawInv : (rawInv as { items: Invoice[] }).items ?? []);
        setBusinesses(Array.isArray(rawBiz) ? rawBiz : (rawBiz as { items: Business[] }).items ?? []);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived stats ──
  const totalRevenue = useMemo(
    () => invoices.filter((i) => i.status === 'PAID').reduce((a, i) => a + (i.amount ?? 0), 0),
    [invoices],
  );
  const countPaid = useMemo(() => invoices.filter((i) => i.status === 'PAID').length, [invoices]);
  const countOverdue = useMemo(() => invoices.filter((i) => i.status === 'OVERDUE').length, [invoices]);
  const countPending = useMemo(() => invoices.filter((i) => i.status === 'PENDING').length, [invoices]);

  // ── Filtered rows ──
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (tab !== 'ALL' && inv.status !== tab) return false;
      if (fromDate && new Date(inv.createdAt) < new Date(fromDate)) return false;
      if (toDate && new Date(inv.createdAt) > new Date(`${toDate}T23:59:59`)) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          (inv.invoiceNumber ?? '').toLowerCase().includes(s) ||
          (inv.businessName ?? '').toLowerCase().includes(s) ||
          inv.id.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [invoices, tab, q, fromDate, toDate]);

  // ── Actions ──
  async function markPaid(inv: Invoice) {
    setActionBusy(true);
    setActionErr(null);
    try {
      await patch(`/payments/invoices/${inv.id}/status`, { status: 'PAID' });
      setInvoices((prev) => prev.map((r) => (r.id === inv.id ? { ...r, status: 'PAID' } : r)));
      setDetail((d) => (d?.id === inv.id ? { ...d, status: 'PAID' } : d));
    } catch (e) {
      setActionErr(errorMessage(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function markCancelled(inv: Invoice) {
    setActionBusy(true);
    setActionErr(null);
    try {
      await patch(`/payments/invoices/${inv.id}/status`, { status: 'CANCELLED' });
      setInvoices((prev) => prev.map((r) => (r.id === inv.id ? { ...r, status: 'CANCELLED' } : r)));
      setDetail((d) => (d?.id === inv.id ? { ...d, status: 'CANCELLED' } : d));
      setConfirmVoid(false);
    } catch (e) {
      setActionErr(errorMessage(e));
    } finally {
      setActionBusy(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ── Create invoice ──
  function resetForm() {
    setForm({ businessId: '', amount: '', currency: 'KES', description: '', dueAt: '', issuedAt: todayIso() });
    setFormErr(null);
  }

  async function submitCreate() {
    if (!form.businessId) { setFormErr('Select a business.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setFormErr('Enter a valid amount.'); return; }
    if (!form.dueAt) { setFormErr('Due date is required.'); return; }
    setFormBusy(true);
    setFormErr(null);
    try {
      const created = await post<Invoice>('/payments/invoices', {
        businessId: form.businessId,
        amountCents: Math.round(Number(form.amount) * 100),
        currency: form.currency || 'KES',
        description: form.description || undefined,
        dueAt: form.dueAt || undefined,
        issuedAt: form.issuedAt || undefined,
      });
      setInvoices((prev) => [created, ...prev]);
      setShowCreate(false);
      resetForm();
      showToast('Invoice created successfully.');
    } catch (e) {
      setFormErr(errorMessage(e));
    } finally {
      setFormBusy(false);
    }
  }

  // ── Columns ──
  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice #',
      render: (inv) => (
        <span className="font-mono text-xs text-fg">
          {inv.invoiceNumber ?? `INV-${inv.id.slice(0, 8).toUpperCase()}`}
        </span>
      ),
    },
    {
      key: 'business',
      header: 'Business',
      render: (inv) => <span className="text-fg">{inv.businessName ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (inv) => (
        <span className="font-medium text-fg">{formatMoney(inv.amount, inv.currency ?? 'KES')}</span>
      ),
    },
    {
      key: 'issued',
      header: 'Issued',
      render: (inv) => <span className="text-muted text-xs">{formatDate(inv.issuedAt ?? inv.createdAt)}</span>,
    },
    {
      key: 'due',
      header: 'Due',
      render: (inv) => <span className="text-muted text-xs">{formatDate(inv.dueAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (inv) => <Badge tone={invoiceTone(inv.status)}>{inv.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (inv) => (
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markPaid(inv)}
            >
              Mark paid
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => showToast('Export not yet connected')}
          >
            Download
          </Button>
        </div>
      ),
    },
  ];

  // ── Render ──
  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-danger text-sm">{error}</p>
        <button onClick={load} className="mt-2 text-sm text-brand underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Invoice Management"
        description="All platform invoices issued to businesses."
        actions={
          <Button onClick={() => { resetForm(); setShowCreate(true); }}>
            + New Invoice
          </Button>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total Invoices" value={invoices.length} />
        <StatCard label="Paid" value={countPaid} />
        <StatCard label="Overdue" value={countOverdue} />
        <StatCard label="Pending" value={countPending} />
        <StatCard label="Total Revenue" value={formatMoney(totalRevenue, 'KES')} />
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['ALL', 'DRAFT', 'PENDING', 'PAID', 'OVERDUE'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === s
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search invoice, business…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-52"
          />
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
          <span className="text-xs text-muted">{filtered.length} of {invoices.length}</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(inv) => inv.id}
        loading={loading}
        onRowClick={(inv) => {
          setDetail(inv);
          setConfirmVoid(false);
          setActionErr(null);
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-brand/40 bg-brand/10 px-5 py-2.5 text-sm text-brand shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Detail / Actions Drawer ── */}
      <Drawer
        open={!!detail}
        onClose={() => {
          setDetail(null);
          setConfirmVoid(false);
          setActionErr(null);
        }}
        title={
          detail
            ? (detail.invoiceNumber ?? `INV-${detail.id.slice(0, 8).toUpperCase()}`)
            : ''
        }
        footer={
          detail && (
            <div className="flex flex-wrap gap-2">
              {detail.status !== 'PAID' && detail.status !== 'CANCELLED' && (
                <Button
                  size="sm"
                  loading={actionBusy}
                  onClick={() => markPaid(detail)}
                >
                  Mark as PAID
                </Button>
              )}
              {detail.status !== 'CANCELLED' && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={actionBusy}
                  onClick={() => setConfirmVoid(true)}
                >
                  Void / Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => showToast('Export not yet connected')}
              >
                Download
              </Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-3 text-sm">
            {actionErr && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {actionErr}
              </div>
            )}

            {confirmVoid && (
              <div className="rounded-md border border-danger/40 bg-danger/10 p-3">
                <div className="mb-2 text-xs font-semibold text-danger">
                  Void this invoice? This cannot be undone.
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={actionBusy}
                    onClick={() => markCancelled(detail)}
                  >
                    Confirm void
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmVoid(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <Row label="Invoice #">
              <span className="font-mono">
                {detail.invoiceNumber ?? `INV-${detail.id.slice(0, 8).toUpperCase()}`}
              </span>
            </Row>
            <Row label="Business">{detail.businessName ?? '—'}</Row>
            <Row label="Amount">
              <span className="font-semibold">{formatMoney(detail.amount, detail.currency ?? 'KES')}</span>
            </Row>
            <Row label="Currency">{detail.currency ?? 'KES'}</Row>
            <Row label="Status">
              <Badge tone={invoiceTone(detail.status)}>{detail.status}</Badge>
            </Row>
            <Row label="Description">{detail.description || '—'}</Row>
            <Row label="Issued">{formatDate(detail.issuedAt ?? detail.createdAt)}</Row>
            <Row label="Due">{formatDate(detail.dueAt)}</Row>
            <Row label="Created">{formatDate(detail.createdAt)}</Row>
            <Row label="ID">
              <span className="font-mono text-xs text-muted">{detail.id}</span>
            </Row>
            <Row label="Business ID">
              <span className="font-mono text-xs text-muted">{detail.businessId ?? '—'}</span>
            </Row>
          </div>
        )}
      </Drawer>

      {/* ── Create Invoice Drawer ── */}
      <Drawer
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="New Invoice"
        footer={
          <div className="flex gap-2">
            <Button loading={formBusy} onClick={submitCreate}>
              Create Invoice
            </Button>
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm(); }}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          {formErr && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {formErr}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Business *
            </label>
            <Select
              value={form.businessId}
              onChange={(e) => setForm((f) => ({ ...f, businessId: e.target.value }))}
              className="w-full"
            >
              <option value="">Select a business…</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Amount *
            </label>
            <Input
              type="number"
              min={1}
              step="0.01"
              placeholder="e.g. 5000"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Currency
            </label>
            <Select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="w-full"
            >
              <option value="KES">KES</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Invoice description / line items…"
              className="h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Issue Date
            </label>
            <Input
              type="date"
              value={form.issuedAt}
              onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Due Date *
            </label>
            <Input
              type="date"
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
            />
          </div>
        </div>
      </Drawer>
    </>
  );
}
