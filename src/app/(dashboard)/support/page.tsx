'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { get, patch, post, errorMessage } from '@/lib/api';
import type { Dispute, DisputeStatus, User } from '@/lib/types';
import { formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Types local to this page
// ---------------------------------------------------------------------------
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface SupportTicket extends Omit<Dispute, 'status'> {
  status: TicketStatus;
  priority?: TicketPriority;
  requesterEmail?: string;
  requesterName?: string;
  requesterRole?: string;
  assigneeName?: string;
  assigneeId?: string;
  messages?: TicketMessage[];
  subject?: string;
}

interface TicketMessage {
  id: string;
  authorId: string;
  authorName?: string;
  authorRole?: string;
  body: string;
  internal?: boolean;
  createdAt: string;
}

const CANNED_RESPONSES = [
  'Thank you for reaching out. We have received your request and are investigating.',
  'We apologize for the inconvenience. Our team is working to resolve this as quickly as possible.',
  'Could you please provide more details about the issue you are experiencing?',
  'This has been escalated to our technical team. You will receive an update within 24 hours.',
  'Your issue has been resolved. Please let us know if you need any further assistance.',
];

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function priorityTone(p?: string): 'danger' | 'warn' | 'info' | 'neutral' {
  if (!p) return 'neutral';
  if (p === 'URGENT') return 'danger';
  if (p === 'HIGH') return 'warn';
  if (p === 'MEDIUM') return 'info';
  return 'neutral';
}

// Derive a subject from a Dispute
function toTicket(d: Dispute): SupportTicket {
  return {
    ...d,
    status: (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as TicketStatus[]).includes(
      d.status as unknown as TicketStatus,
    )
      ? (d.status as unknown as TicketStatus)
      : 'OPEN',
    priority: 'MEDIUM',
    subject: d.reason?.slice(0, 60) || `Ticket #${d.id.slice(0, 8)}`,
    requesterName: d.openedByName,
  };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | TicketStatus>('');
  const [priorityFilter, setPriorityFilter] = useState<'' | TicketPriority>('');
  const [page, setPage] = useState(1);
  const [admins, setAdmins] = useState<User[]>([]);
  const [cannedOpen, setCannedOpen] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  // Load tickets
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await get<Dispute[] | { items: Dispute[] }>('/admin/disputes');
        const list = Array.isArray(data) ? data : (data.items ?? []);
        setTickets(list.map(toTicket));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load admins for assignee dropdown
  useEffect(() => {
    (async () => {
      try {
        const data = await get<User[] | { items: User[] }>('/admin/users?role=ADMIN');
        setAdmins(Array.isArray(data) ? data : (data.items ?? []));
      } catch {
        // Non-critical — assignee dropdown will be empty
      }
    })();
  }, []);

  // Load messages when ticket selected
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    setMsgLoading(true);
    (async () => {
      try {
        const data = await get<TicketMessage[] | { items: TicketMessage[] }>(
          `/admin/disputes/${selected.id}/messages`,
        );
        setMessages(Array.isArray(data) ? data : (data.items ?? []));
      } catch {
        setMessages([]);
      } finally {
        setMsgLoading(false);
      }
    })();
  }, [selected?.id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          (t.subject ?? '').toLowerCase().includes(s) ||
          (t.requesterEmail ?? '').toLowerCase().includes(s) ||
          (t.requesterName ?? '').toLowerCase().includes(s) ||
          t.id.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [tickets, q, statusFilter, priorityFilter]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    setSendError(null);
    const optimistic: TicketMessage = {
      id: `opt-${Date.now()}`,
      authorId: 'admin',
      authorName: 'Admin',
      authorRole: 'ADMIN',
      body: reply,
      internal,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setReply('');
    try {
      await post(`/admin/disputes/${selected.id}/messages`, {
        body: optimistic.body,
        internal,
      });
    } catch (e) {
      // Graceful — keep optimistic bubble, log the error
      console.error('Failed to send message:', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(newStatus: TicketStatus) {
    if (!selected) return;
    const updated = { ...selected, status: newStatus };
    setSelected(updated);
    setTickets((prev) => prev.map((t) => (t.id === selected.id ? updated : t)));
    try {
      await patch(`/admin/disputes/${selected.id}`, { status: newStatus });
    } catch {}
  }

  async function assign(adminId: string) {
    if (!selected) return;
    const admin = admins.find((a) => a.id === adminId);
    const updated = {
      ...selected,
      assigneeId: adminId,
      assigneeName: admin ? `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim() : adminId,
    };
    setSelected(updated);
    setTickets((prev) => prev.map((t) => (t.id === selected.id ? updated : t)));
    try {
      await patch(`/admin/disputes/${selected.id}`, { assigneeId: adminId });
    } catch {}
  }

  if (loading)
    return <div className="py-20 text-center text-muted">Loading support tickets…</div>;
  if (error)
    return (
      <div className="py-20 text-center">
        <p className="text-danger">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); }}
          className="mt-2 text-sm text-brand underline"
        >
          Retry
        </button>
      </div>
    );

  return (
    <>
      <PageHeader
        title="Support & Ticketing"
        description="Ticket queue, conversations, and resolution tracking."
        actions={
          <span className="text-xs text-muted">
            {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
          </span>
        }
      />

      <div className="flex h-[calc(100vh-180px)] gap-4 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="flex w-80 flex-shrink-0 flex-col rounded-lg border border-border bg-surface">
          {/* Filters */}
          <div className="space-y-2 border-b border-border p-3">
            <Input
              placeholder="Search tickets…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="h-8 text-xs"
            />
            <div className="flex gap-2">
              <Select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(1); }}
                className="h-8 flex-1 text-xs"
              >
                <option value="">All statuses</option>
                {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as TicketStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </Select>
              <Select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }}
                className="h-8 flex-1 text-xs"
              >
                <option value="">All priorities</option>
                {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TicketPriority[]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto">
            {paginated.length === 0 && (
              <div className="py-10 text-center text-xs text-muted">No tickets match filters.</div>
            )}
            {paginated.map((t) => {
              const sla = hoursAgo(t.createdAt);
              const breached = t.status === 'OPEN' && sla > 24;
              const isActive = selected?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`w-full border-b border-border px-3 py-3 text-left hover:bg-surface-2 ${
                    isActive ? 'bg-brand/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-fg">{t.subject}</span>
                    <Badge tone={priorityTone(t.priority)} className="flex-shrink-0">
                      {t.priority ?? 'MED'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    {breached && (
                      <span className="rounded bg-danger/20 px-1 py-0.5 text-[9px] font-medium text-danger">
                        SLA
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">
                    {t.requesterEmail ?? t.requesterName ?? t.openedByName ?? '—'} ·{' '}
                    {formatDate(t.createdAt)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="disabled:opacity-40"
              >
                Prev
              </button>
              <span>{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        {!selected ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-surface">
            <div className="text-center text-muted">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center text-xl">
                ✉
              </div>
              <p className="text-sm font-medium">Select a ticket</p>
              <p className="mt-1 text-xs">Choose a ticket from the left to view the conversation.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
            {/* Header */}
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">{selected.subject}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                    <Badge tone={priorityTone(selected.priority)}>{selected.priority ?? 'MEDIUM'}</Badge>
                    <span>Opened {formatDate(selected.createdAt)}</span>
                    {selected.assigneeName && <span>· Assigned to {selected.assigneeName}</span>}
                    {hoursAgo(selected.createdAt) > 24 && selected.status === 'OPEN' && (
                      <span className="font-semibold text-danger">
                        SLA breached ({Math.round(hoursAgo(selected.createdAt))}h)
                      </span>
                    )}
                  </div>
                </div>
                {/* Action bar */}
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <Select
                    value={selected.status}
                    onChange={(e) => changeStatus(e.target.value as TicketStatus)}
                    className="h-7 text-xs"
                  >
                    {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </Select>
                  {admins.length > 0 && (
                    <Select
                      value={selected.assigneeId ?? ''}
                      onChange={(e) => assign(e.target.value)}
                      className="h-7 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.firstName ?? a.email}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => changeStatus('CLOSED')}
                    className="h-7 text-xs"
                  >
                    Close
                  </Button>
                </div>
              </div>

              {/* Requester info card */}
              <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 font-semibold text-brand">
                  {(selected.requesterName ?? selected.openedByName ?? '?')[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-fg">
                    {selected.requesterName ?? selected.openedByName ?? 'Unknown'}
                  </div>
                  <div className="text-muted">
                    {selected.requesterEmail ?? 'No email'} · {selected.requesterRole ?? 'USER'}
                  </div>
                </div>
              </div>
            </div>

            {/* Message thread */}
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              {msgLoading && (
                <div className="py-6 text-center text-xs text-muted">Loading messages…</div>
              )}
              {!msgLoading && messages.length === 0 && (
                <div className="py-6 text-center text-xs text-muted">No messages yet.</div>
              )}
              {messages.map((m) => {
                const isAdmin = m.authorRole === 'ADMIN' || m.authorRole === 'SUPPORT';
                return (
                  <div
                    key={m.id}
                    className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs ${
                        m.internal
                          ? 'border border-warn/30 bg-warn/10 text-warn'
                          : isAdmin
                          ? 'bg-brand text-white'
                          : 'bg-surface-2 text-fg'
                      }`}
                    >
                      {m.internal && (
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
                          Internal note
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <div
                        className={`mt-1 text-[10px] ${
                          isAdmin ? 'text-white/60' : 'text-muted'
                        }`}
                      >
                        {m.authorName ?? m.authorId} · {formatDate(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>

            {/* Reply area */}
            <div className="border-t border-border p-3">
              {sendError && (
                <p className="mb-2 text-xs text-danger">{sendError}</p>
              )}
              {/* Canned responses */}
              <div className="relative mb-2">
                <button
                  onClick={() => setCannedOpen((o) => !o)}
                  className="rounded border border-border bg-surface-2 px-2 py-1 text-[10px] font-medium text-muted hover:text-fg"
                >
                  Quick replies ▾
                </button>
                {cannedOpen && (
                  <div className="absolute bottom-full left-0 z-10 mb-1 w-80 rounded-lg border border-border bg-surface shadow-lg">
                    {CANNED_RESPONSES.map((cr, i) => (
                      <button
                        key={i}
                        onClick={() => { setReply(cr); setCannedOpen(false); }}
                        className="block w-full border-b border-border px-3 py-2 text-left text-xs text-fg hover:bg-surface-2 last:border-b-0"
                      >
                        {cr.slice(0, 70)}…
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                    className="rounded border-border"
                  />
                  Post as internal note
                </label>
                <Button
                  size="sm"
                  onClick={sendReply}
                  loading={sending}
                  disabled={!reply.trim()}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
