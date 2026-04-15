'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { Drawer } from '@/components/ui/Drawer';
import { get, post, patch, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { User } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifChannel = 'IN_APP' | 'EMAIL' | 'SMS';
type NotifStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';
type FilterStatus = 'ALL' | NotifStatus;

interface Notification {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  title: string;
  body: string;
  channel: NotifChannel;
  status: NotifStatus;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

interface SendForm {
  target: 'all' | 'specific';
  userId: string;
  title: string;
  body: string;
  channel: NotifChannel;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusTone(status: NotifStatus): 'warn' | 'success' | 'danger' | 'info' {
  if (status === 'PENDING') return 'warn';
  if (status === 'SENT') return 'success';
  if (status === 'READ') return 'info';
  return 'danger';
}

function channelTone(channel: NotifChannel): 'brand' | 'neutral' | 'info' {
  if (channel === 'IN_APP') return 'brand';
  if (channel === 'EMAIL') return 'info';
  return 'neutral';
}

function safeItems<T>(raw: T[] | { items: T[] } | null | undefined): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : ((raw as { items: T[] }).items ?? []);
}

const EMPTY_FORM: SendForm = {
  target: 'specific',
  userId: '',
  title: '',
  body: '',
  channel: 'IN_APP',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  // Data
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [filterChannel, setFilterChannel] = useState<'' | NotifChannel>('');
  const [userSearch, setUserSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  // Actions
  const [acting, setActing] = useState<string | null>(null);

  // Send drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<SendForm>(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await get<Notification[]>('/admin/notifications?page=1&limit=200');
      setNotifications(safeItems(raw));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const raw = await get<User[] | { items: User[] }>('/admin/users?limit=200');
      setUsers(safeItems(raw));
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    loadUsers();
  }, [loadNotifications, loadUsers]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalSent = notifications.length;
  const totalUnread = notifications.filter((n) => !n.read && n.status !== 'FAILED').length;
  const totalFailed = notifications.filter((n) => n.status === 'FAILED').length;
  const totalRead = notifications.filter((n) => n.read || n.status === 'READ').length;
  const readRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0;

  // ── Filtered & paginated ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filterStatus !== 'ALL') {
        const matchRead = filterStatus === 'READ' && (n.read || n.status === 'READ');
        const matchStatus = n.status === filterStatus;
        if (!matchRead && !matchStatus) return false;
      }
      if (filterChannel && n.channel !== filterChannel) return false;
      if (userSearch) {
        const s = userSearch.toLowerCase();
        const matchName = (n.userName ?? '').toLowerCase().includes(s);
        const matchEmail = (n.userEmail ?? '').toLowerCase().includes(s);
        const matchId = n.userId.toLowerCase().includes(s);
        if (!matchName && !matchEmail && !matchId) return false;
      }
      if (fromDate && new Date(n.createdAt) < new Date(fromDate)) return false;
      if (toDate && new Date(n.createdAt) > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    });
  }, [notifications, filterStatus, filterChannel, userSearch, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterChannel, userSearch, fromDate, toDate]);

  // ── Row actions ────────────────────────────────────────────────────────────

  async function markRead(n: Notification) {
    setActing(n.id);
    try {
      await patch(`/notifications/${n.id}/read`, {});
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true, status: 'READ', readAt: new Date().toISOString() } : x)),
      );
    } catch {
      // silently ignore
    } finally {
      setActing(null);
    }
  }

  async function resend(n: Notification) {
    setActing(n.id);
    try {
      await post('/notifications/send', {
        userId: n.userId,
        title: n.title,
        body: n.body,
        channel: n.channel,
      });
      // Optimistically mark as SENT
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, status: 'SENT' } : x)),
      );
    } catch {
      // silently ignore
    } finally {
      setActing(null);
    }
  }

  // ── Send drawer ────────────────────────────────────────────────────────────

  function openDrawer() {
    setForm(EMPTY_FORM);
    setSendError(null);
    setSendSuccess(null);
    setBroadcastProgress(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (sending) return;
    setDrawerOpen(false);
  }

  function updateForm(patch_: Partial<SendForm>) {
    setForm((prev) => ({ ...prev, ...patch_ }));
  }

  async function sendNotification() {
    if (!form.title.trim() || !form.body.trim()) {
      setSendError('Title and body are required.');
      return;
    }
    if (form.target === 'specific' && !form.userId) {
      setSendError('Please select a user.');
      return;
    }

    setSendError(null);
    setSendSuccess(null);
    setSending(true);

    try {
      if (form.target === 'specific') {
        await post('/notifications/send', {
          userId: form.userId,
          title: form.title.trim(),
          body: form.body.trim(),
          channel: form.channel,
          data: {},
        });
        setSendSuccess('Notification sent successfully.');
        // Add optimistic entry to list
        const target = users.find((u) => u.id === form.userId);
        const newNotif: Notification = {
          id: `opt-${Date.now()}`,
          userId: form.userId,
          userName: target ? `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() : '',
          userEmail: target?.email,
          title: form.title.trim(),
          body: form.body.trim(),
          channel: form.channel,
          status: 'SENT',
          read: false,
          createdAt: new Date().toISOString(),
        };
        setNotifications((prev) => [newNotif, ...prev]);
      } else {
        // Broadcast to all users
        const targets = users.filter((u) => u.status === 'ACTIVE');
        setBroadcastProgress({ done: 0, total: targets.length });
        let done = 0;
        for (const u of targets) {
          try {
            await post('/notifications/send', {
              userId: u.id,
              title: form.title.trim(),
              body: form.body.trim(),
              channel: form.channel,
              data: {},
            });
          } catch {
            // continue on per-user errors
          }
          done += 1;
          setBroadcastProgress({ done, total: targets.length });
        }
        setSendSuccess(`Broadcast complete — sent to ${done} of ${targets.length} users.`);
        setBroadcastProgress(null);
      }
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<Notification>[] = [
    {
      key: 'user',
      header: 'User',
      render: (n) => (
        <div>
          <div className="font-medium text-fg text-xs">{n.userName || n.userId}</div>
          {n.userEmail && <div className="text-[11px] text-muted">{n.userEmail}</div>}
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (n) => <span className="font-medium text-fg">{n.title}</span>,
    },
    {
      key: 'body',
      header: 'Body preview',
      render: (n) => (
        <span className="max-w-[220px] truncate block text-muted text-xs">
          {n.body.slice(0, 80)}{n.body.length > 80 ? '…' : ''}
        </span>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (n) => <Badge tone={channelTone(n.channel)}>{n.channel}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (n) => {
        const s: NotifStatus = n.read ? 'READ' : n.status;
        return <Badge tone={statusTone(s)}>{s}</Badge>;
      },
    },
    {
      key: 'createdAt',
      header: 'Sent at',
      render: (n) => <span className="text-xs text-muted">{formatDate(n.createdAt)}</span>,
    },
    {
      key: 'readAt',
      header: 'Read at',
      render: (n) => <span className="text-xs text-muted">{n.readAt ? formatDate(n.readAt) : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (n) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!n.read && n.status !== 'FAILED' && (
            <button
              disabled={acting === n.id}
              onClick={() => markRead(n)}
              className="rounded px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            >
              Mark read
            </button>
          )}
          {n.status === 'FAILED' && (
            <button
              disabled={acting === n.id}
              onClick={() => resend(n)}
              className="rounded px-2 py-1 text-[11px] font-medium bg-brand-600 text-white hover:opacity-80 disabled:opacity-40"
            >
              Resend
            </button>
          )}
        </div>
      ),
    },
  ];

  // ── Searchable user select in form ─────────────────────────────────────────

  const [userQuery, setUserQuery] = useState('');
  const matchedUsers = useMemo(
    () =>
      userQuery.length < 1
        ? users.slice(0, 50)
        : users.filter((u) => {
            const s = userQuery.toLowerCase();
            return (
              u.email.toLowerCase().includes(s) ||
              `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase().includes(s)
            );
          }).slice(0, 50),
    [users, userQuery],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Manage platform notifications. Send to individual users or broadcast to all."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadNotifications}>
              Refresh
            </Button>
            <Button size="sm" onClick={openDrawer}>
              Send Notification
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total sent" value={totalSent.toLocaleString()} />
        <StatCard label="Unread / pending" value={totalUnread.toLocaleString()} />
        <StatCard label="Failed" value={totalFailed.toLocaleString()} />
        <StatCard label="Read rate" value={`${readRate}%`} hint={`${totalRead} read`} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Status pills */}
        {(['ALL', 'PENDING', 'SENT', 'FAILED', 'READ'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {s}
          </button>
        ))}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Channel filter */}
          <Select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value as '' | NotifChannel)}
            className="w-36 text-xs"
          >
            <option value="">All channels</option>
            <option value="IN_APP">IN_APP</option>
            <option value="EMAIL">EMAIL</option>
            <option value="SMS">SMS</option>
          </Select>

          {/* User search */}
          <Input
            placeholder="Search user…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-44 text-xs"
          />

          {/* Date range */}
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-36 text-xs"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-36 text-xs"
          />
        </div>
      </div>

      {/* Result count */}
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>{filtered.length.toLocaleString()} notifications</span>
        <span>Page {page} of {totalPages}</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-border bg-surface py-16 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={loadNotifications} className="mt-2 text-sm text-brand-600 underline">
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={paginated}
          getRowId={(n) => n.id}
          loading={loading}
          empty="No notifications match the current filters."
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {/* ── Send Notification Drawer ──────────────────────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Send Notification"
        width="w-[560px]"
        footer={
          <div className="flex items-center gap-3">
            <Button onClick={sendNotification} loading={sending} disabled={sending}>
              {form.target === 'all' ? 'Broadcast to all' : 'Send'}
            </Button>
            <button
              onClick={closeDrawer}
              disabled={sending}
              className="text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Target */}
          <div>
            <label className="mb-2 block text-[10px] uppercase tracking-wider text-muted">
              Target
            </label>
            <div className="flex gap-3">
              {(['specific', 'all'] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="radio"
                    checked={form.target === t}
                    onChange={() => { updateForm({ target: t }); setSendError(null); }}
                    className="accent-brand-600"
                  />
                  {t === 'specific' ? 'Specific user' : 'All active users'}
                </label>
              ))}
            </div>
          </div>

          {/* User select — shown only for specific */}
          {form.target === 'specific' && (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                Select user
              </label>
              <Input
                placeholder="Search by name or email…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                className="mb-1"
              />
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
                {matchedUsers.length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted">No users found.</div>
                )}
                {matchedUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { updateForm({ userId: u.id }); setUserQuery(`${u.firstName ?? ''} ${u.lastName ?? ''} <${u.email}>`.trim()); }}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-surface-2 ${form.userId === u.id ? 'bg-brand-50 dark:bg-brand-900/20 font-medium text-brand-600' : 'text-fg'}`}
                  >
                    <span className="font-medium">{u.firstName} {u.lastName}</span>
                    <span className="ml-1 text-muted">&lt;{u.email}&gt;</span>
                  </button>
                ))}
              </div>
              {form.userId && (
                <p className="mt-1 text-[11px] text-muted">
                  Selected user ID: <span className="font-mono text-fg">{form.userId}</span>
                </p>
              )}
            </div>
          )}

          {form.target === 'all' && (
            <div className="rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
              This will send a notification to all <strong>{users.filter((u) => u.status === 'ACTIVE').length}</strong> active users. The operation runs sequentially and may take a few moments.
            </div>
          )}

          {/* Title */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-muted">Title</label>
              <span className={`text-[11px] ${form.title.length > 80 ? 'text-danger' : 'text-muted'}`}>
                {form.title.length}/80
              </span>
            </div>
            <Input
              value={form.title}
              onChange={(e) => updateForm({ title: e.target.value.slice(0, 80) })}
              placeholder="Notification title…"
            />
          </div>

          {/* Body */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-muted">Body</label>
              <span className={`text-[11px] ${form.body.length > 300 ? 'text-danger' : 'text-muted'}`}>
                {form.body.length}/300
              </span>
            </div>
            <textarea
              value={form.body}
              onChange={(e) => updateForm({ body: e.target.value.slice(0, 300) })}
              placeholder="Notification body text…"
              rows={4}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/30 resize-none"
            />
          </div>

          {/* Channel */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
              Channel
            </label>
            <Select
              value={form.channel}
              onChange={(e) => updateForm({ channel: e.target.value as NotifChannel })}
              className="w-full"
            >
              <option value="IN_APP">IN_APP (guaranteed)</option>
              <option value="EMAIL">EMAIL (requires email provider config)</option>
              <option value="SMS">SMS (requires SMS provider config)</option>
            </Select>
            {form.channel !== 'IN_APP' && (
              <p className="mt-1 text-[11px] text-muted">
                Note: only IN_APP delivery is guaranteed. EMAIL and SMS depend on external provider configuration.
              </p>
            )}
          </div>

          {/* Preview */}
          {(form.title || form.body) && (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                Preview
              </label>
              <div className="rounded-lg border border-border bg-surface-2 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 text-sm font-bold">
                    W
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-fg">
                      {form.title || <span className="text-muted italic">No title yet</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted leading-relaxed">
                      {form.body || <span className="italic">No body yet</span>}
                    </div>
                    <div className="mt-1.5 text-[10px] text-muted">just now · WorkStream</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Broadcast progress */}
          {broadcastProgress && (
            <div className="rounded-md border border-border bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Broadcasting…</span>
                <span>{broadcastProgress.done} / {broadcastProgress.total}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-200"
                  style={{ width: `${Math.round((broadcastProgress.done / broadcastProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Error / success feedback */}
          {sendError && (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {sendError}
            </div>
          )}
          {sendSuccess && (
            <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              {sendSuccess}
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
