'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { del, get, post } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Notification {
  id: string;
  type: 'TASK' | 'PAYMENT' | 'SYSTEM' | 'KYC' | 'GENERAL';
  message: string;
  recipient?: string;
  read: boolean;
  failed?: boolean;
  createdAt: string;
}

type FilterType = 'ALL' | 'TASK' | 'PAYMENT' | 'SYSTEM' | 'KYC';

function typeTone(type: string): 'info' | 'success' | 'warn' | 'danger' | 'neutral' {
  if (type === 'TASK') return 'info';
  if (type === 'PAYMENT') return 'success';
  if (type === 'SYSTEM') return 'warn';
  if (type === 'KYC') return 'danger';
  return 'neutral';
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');

  const load = () => {
    setLoading(true);
    setError(null);
    get<Notification[] | { items: Notification[] }>('/notifications')
      .catch(() => [] as Notification[])
      .then((raw) => {
        setItems(Array.isArray(raw) ? raw : ((raw as { items: Notification[] }).items ?? []));
      })
      .catch((e: Error) => setError(e?.message ?? 'Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === 'ALL' ? items : items.filter((n) => n.type === filter);
  const unread = items.filter((n) => !n.read).length;
  const failed = items.filter((n) => n.failed).length;
  const today = new Date().toDateString();
  const sentToday = items.filter((n) => new Date(n.createdAt).toDateString() === today).length;

  const [acting, setActing] = useState<string | null>(null);

  const markAllRead = () => setItems((prev) => prev.map((n) => ({ ...n, read: true })));

  async function resend(id: string) {
    setActing(id);
    try {
      await post(`/notifications/${id}/resend`, {});
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, failed: false } : n));
    } catch { alert('Resend failed — backend may be unavailable.'); }
    finally { setActing(null); }
  }

  async function deleteNotification(id: string) {
    setActing(id);
    try {
      await del(`/notifications/${id}`);
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch { alert('Delete failed — backend may be unavailable.'); }
    finally { setActing(null); }
  }

  return (
    <>
      <PageHeader
        title="Platform Notifications"
        description="System-generated notifications sent to users and agents."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={markAllRead}>Mark all read</Button>
            <Button size="sm" onClick={load}>Refresh</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Sent today" value={String(sentToday)} />
        <StatCard label="Unread" value={String(unread)} />
        <StatCard label="Failed deliveries" value={String(failed)} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['ALL', 'TASK', 'PAYMENT', 'SYSTEM', 'KYC'] as FilterType[]).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === t
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:text-fg hover:bg-surface-2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="py-20 text-center text-muted text-sm">Loading notifications…</div>}
      {error && (
        <div className="py-10 text-center">
          <p className="text-danger text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-20 text-center text-muted text-sm">
          {items.length === 0 ? 'No notifications from backend yet.' : 'No notifications match this filter.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Message</th>
                <th className="px-4 py-3 text-left">Recipient</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Sent</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((n) => (
                <tr key={n.id} className={`hover:bg-surface-2 transition-colors ${!n.read ? 'bg-brand/5' : ''}`}>
                  <td className="px-4 py-3">
                    <Badge tone={typeTone(n.type)}>{n.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-fg max-w-xs truncate">{n.message}</td>
                  <td className="px-4 py-3 text-muted">{n.recipient ?? '—'}</td>
                  <td className="px-4 py-3">
                    {n.failed ? (
                      <Badge tone="danger">Failed</Badge>
                    ) : n.read ? (
                      <Badge tone="neutral">Read</Badge>
                    ) : (
                      <Badge tone="brand">Unread</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(n.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {n.failed && (
                        <button
                          onClick={() => resend(n.id)}
                          disabled={acting === n.id}
                          className="rounded px-2 py-1 text-[11px] font-medium bg-brand text-brand-fg hover:opacity-80 disabled:opacity-40"
                        >
                          Resend
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(n.id)}
                        disabled={acting === n.id}
                        className="rounded px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
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
