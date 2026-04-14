'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

interface Invoice {
  id: string;
  invoiceNumber?: string;
  businessId?: string;
  businessName?: string;
  amount: number;
  currency?: string;
  status: 'PAID' | 'OVERDUE' | 'PENDING' | 'DRAFT';
  issuedAt?: string;
  dueAt?: string;
  createdAt: string;
}

function invoiceTone(status: string): 'success' | 'danger' | 'warn' | 'neutral' {
  if (status === 'PAID') return 'success';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PENDING') return 'warn';
  return 'neutral';
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'OVERDUE' | 'PENDING' | 'DRAFT'>('ALL');

  const load = () => {
    setLoading(true);
    setError(null);
    get<Invoice[] | { items: Invoice[] }>('/payments/invoices')
      .catch(() => [] as Invoice[])
      .then((raw) => {
        setInvoices(Array.isArray(raw) ? raw : ((raw as { items: Invoice[] }).items ?? []));
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed to load invoices'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === 'ALL' ? invoices : invoices.filter((inv) => inv.status === filter);

  const totalInvoiced = invoices.reduce((a, i) => a + (i.amount ?? 0), 0);
  const paid = invoices.filter((i) => i.status === 'PAID').length;
  const overdue = invoices.filter((i) => i.status === 'OVERDUE').length;
  const draft = invoices.filter((i) => i.status === 'DRAFT').length;

  return (
    <>
      <PageHeader
        title="Invoice Management"
        description="All platform invoices issued to businesses."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Total invoiced (KES)" value={formatMoney(totalInvoiced, 'KES')} />
        <StatCard label="Paid" value={String(paid)} />
        <StatCard label="Overdue" value={String(overdue)} />
        <StatCard label="Draft" value={String(draft)} />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['ALL', 'PAID', 'OVERDUE', 'PENDING', 'DRAFT'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:text-fg hover:bg-surface-2'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <div className="py-20 text-center text-muted text-sm">Loading invoices…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {invoices.length === 0 ? 'No invoices from backend.' : 'No invoices match this filter.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Amount (KES)</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Issued</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-fg">
                    {inv.invoiceNumber ?? `INV-${inv.id.slice(0, 8).toUpperCase()}`}
                  </td>
                  <td className="px-4 py-3 text-muted">{inv.businessName ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-fg">{formatMoney(inv.amount, 'KES')}</td>
                  <td className="px-4 py-3">
                    <Badge tone={invoiceTone(inv.status)}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(inv.issuedAt ?? inv.createdAt)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(inv.dueAt)}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-brand hover:underline">PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
