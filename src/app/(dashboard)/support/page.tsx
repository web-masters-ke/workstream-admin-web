'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { get, patch, post, errorMessage } from '@/lib/api';
import type { Dispute, User } from '@/lib/types';
import { formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED' | 'ESCALATED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type AssigneeType = 'AGENT' | 'BUSINESS' | 'ADMIN';

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeType: AssigneeType;
  assignedToAgentId?: string | null;
  assignedToBusinessId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterRole?: string | null;
  assigneeName?: string | null;
  taskId?: string | null;
  description: string;
  resolution?: string | null;
  messages?: TicketMessage[];
  createdAt: string;
  updatedAt: string;
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

interface AgentOption { id: string; name: string; email: string; }
interface BusinessOption { id: string; name: string; }

const CANNED = [
  'Thank you for reaching out. We have received your request and are investigating.',
  'We apologize for the inconvenience. Our team is working to resolve this as quickly as possible.',
  'Could you please provide more details about the issue you are experiencing?',
  'This has been escalated to our technical team. You will receive an update within 24 hours.',
  'Your issue has been resolved. Please let us know if you need any further assistance.',
];

function hoursAgo(iso: string) { return (Date.now() - new Date(iso).getTime()) / 3_600_000; }

function priorityTone(p?: string): 'danger' | 'warn' | 'info' | 'neutral' {
  if (p === 'URGENT') return 'danger';
  if (p === 'HIGH') return 'warn';
  if (p === 'MEDIUM') return 'info';
  return 'neutral';
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
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | TicketStatus>('');
  const [priorityFilter, setPriorityFilter] = useState<'' | TicketPriority>('');
  const [page, setPage] = useState(1);
  const [admins, setAdmins] = useState<User[]>([]);
  const [cannedOpen, setCannedOpen] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  // Create ticket state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [ctSubject, setCtSubject] = useState('');
  const [ctDesc, setCtDesc] = useState('');
  const [ctCategory, setCtCategory] = useState('OTHER');
  const [ctPriority, setCtPriority] = useState<TicketPriority>('MEDIUM');
  const [ctAssigneeType, setCtAssigneeType] = useState<AssigneeType>('ADMIN');
  const [ctAgentId, setCtAgentId] = useState('');
  const [ctBusinessId, setCtBusinessId] = useState('');
  const [ctTaskId, setCtTaskId] = useState('');
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  // Load tickets
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await get<{ items: SupportTicket[] } | SupportTicket[]>('/admin/disputes?limit=100');
        const list = Array.isArray(data) ? data : (data.items ?? []);
        setTickets(list);
      } catch (e) { setError(errorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  // Load admins + agents + businesses for dropdowns
  useEffect(() => {
    (async () => {
      try {
        const [uData, aData, bData] = await Promise.all([
          get<User[] | { items: User[] }>('/admin/users?role=ADMIN&limit=100'),
          get<any>('/agents?limit=100'),
          get<any>('/admin/businesses?limit=200'),
        ]);
        setAdmins(Array.isArray(uData) ? uData : (uData.items ?? []));
        const agentList = Array.isArray(aData) ? aData : (aData.items ?? []);
        setAgents(agentList.map((a: any) => ({
          id: a.id,
          name: a.user?.name ?? a.user?.email ?? a.id,
          email: a.user?.email ?? '',
        })));
        setBusinesses(Array.isArray(bData) ? bData : (bData.items ?? []));
      } catch { /* non-critical */ }
    })();
  }, []);

  // Load messages when ticket selected
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    setMsgLoading(true);
    (async () => {
      try {
        const data = await get<TicketMessage[] | { items: TicketMessage[] }>(`/admin/disputes/${selected.id}/messages`);
        setMessages(Array.isArray(data) ? data : (data.items ?? []));
      } catch { setMessages([]); }
      finally { setMsgLoading(false); }
    })();
  }, [selected?.id]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const filtered = useMemo(() => tickets.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (q) {
      const s = q.toLowerCase();
      return (
        t.subject.toLowerCase().includes(s) ||
        (t.requesterEmail ?? '').toLowerCase().includes(s) ||
        (t.requesterName ?? '').toLowerCase().includes(s) ||
        t.id.toLowerCase().includes(s)
      );
    }
    return true;
  }), [tickets, q, statusFilter, priorityFilter]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function createTicket() {
    if (!ctSubject.trim() || !ctDesc.trim()) { setCreateError('Subject and description are required'); return; }
    setCreating(true); setCreateError(null);
    try {
      const payload: any = {
        category: ctCategory,
        priority: ctPriority,
        assigneeType: ctAssigneeType,
        subject: ctSubject.trim(),
        description: ctDesc.trim(),
      };
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (ctTaskId.trim() && uuidRe.test(ctTaskId.trim())) payload.taskId = ctTaskId.trim();
      if (ctAssigneeType === 'AGENT' && ctAgentId) payload.assignedToAgentId = ctAgentId;
      if (ctAssigneeType === 'BUSINESS' && ctBusinessId) payload.assignedToBusinessId = ctBusinessId;
      const t = await post<SupportTicket>('/admin/disputes', payload);
      setTickets((prev) => [t, ...prev]);
      setShowCreate(false);
      setCtSubject(''); setCtDesc(''); setCtCategory('OTHER'); setCtPriority('MEDIUM');
      setCtAssigneeType('ADMIN'); setCtAgentId(''); setCtBusinessId(''); setCtTaskId('');
    } catch (e) { setCreateError(errorMessage(e)); }
    finally { setCreating(false); }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    const optimistic: TicketMessage = {
      id: `opt-${Date.now()}`, authorId: 'admin', authorName: 'Admin',
      authorRole: 'ADMIN', body: reply, internal, createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const body = reply;
    setReply('');
    try {
      await post(`/admin/disputes/${selected.id}/messages`, { body, internal });
    } catch (e) { console.error('msg send failed:', errorMessage(e)); }
    finally { setSending(false); }
  }

  async function changeStatus(newStatus: TicketStatus) {
    if (!selected) return;
    const updated = { ...selected, status: newStatus };
    setSelected(updated);
    setTickets((prev) => prev.map((t) => (t.id === selected.id ? updated : t)));
    try { await patch(`/admin/disputes/${selected.id}`, { status: newStatus }); } catch {}
  }

  async function assign(adminId: string) {
    if (!selected) return;
    const admin = admins.find((a) => a.id === adminId);
    const updated = { ...selected, assigneeId: adminId, assigneeName: admin ? `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim() : adminId };
    setSelected(updated as any);
    setTickets((prev) => prev.map((t) => (t.id === selected.id ? updated as any : t)));
    try { await patch(`/admin/disputes/${selected.id}`, { assigneeId: adminId }); } catch {}
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading support tickets…</div>;
  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Support & Ticketing"
        description="Ticket queue, conversations, and resolution tracking."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
            <Button onClick={() => setShowCreate(true)}>+ New Ticket</Button>
          </div>
        }
      />

      {/* ── Create Ticket Drawer ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-base font-semibold text-fg">Create Support Ticket</h3>
            <p className="mb-4 text-xs text-muted">Fill in who it's for and what the issue is. The assigned party will see it in their portal.</p>
            {createError && <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{createError}</div>}

            <div className="space-y-3">
              {/* Row 1 — Category + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Category</label>
                  <select value={ctCategory} onChange={(e) => setCtCategory(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none">
                    {['PAYMENT', 'TASK_QUALITY', 'AGENT_CONDUCT', 'BUSINESS_CONDUCT', 'OTHER'].map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Priority</label>
                  <select value={ctPriority} onChange={(e) => setCtPriority(e.target.value as TicketPriority)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none">
                    {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TicketPriority[]).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2 — Assign to type */}
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Assign To</label>
                <div className="flex gap-2">
                  {(['ADMIN', 'AGENT', 'BUSINESS'] as AssigneeType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setCtAssigneeType(t); setCtAgentId(''); setCtBusinessId(''); }}
                      className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                        ctAssigneeType === t
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border text-muted hover:text-fg'
                      }`}
                    >
                      {t === 'ADMIN' ? 'Internal (Admin)' : t === 'AGENT' ? 'Individual Agent' : 'Business / Org'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3 — Assignee picker (conditional) */}
              {ctAssigneeType === 'AGENT' && (
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Select Agent *</label>
                  <SearchableSelect
                    value={ctAgentId}
                    onChange={setCtAgentId}
                    options={agents.map((a) => ({ value: a.id, label: `${a.name} — ${a.email}` }))}
                    placeholder="Search and select agent…"
                  />
                </div>
              )}
              {ctAssigneeType === 'BUSINESS' && (
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Select Business *</label>
                  <SearchableSelect
                    value={ctBusinessId}
                    onChange={setCtBusinessId}
                    options={businesses.map((b) => ({ value: b.id, label: b.name }))}
                    placeholder="Search and select business…"
                  />
                </div>
              )}

              {/* Row 4 — Subject */}
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Subject *</label>
                <input value={ctSubject} onChange={(e) => setCtSubject(e.target.value)} placeholder="Brief subject line" className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none" />
              </div>

              {/* Row 5 — Description */}
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Description *</label>
                <textarea value={ctDesc} onChange={(e) => setCtDesc(e.target.value)} placeholder="Describe the issue in detail…" rows={3} className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>

              {/* Row 6 — Related task (optional) */}
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Related Task ID <span className="normal-case text-muted">(optional)</span></label>
                <input value={ctTaskId} onChange={(e) => setCtTaskId(e.target.value)} placeholder="Paste task UUID if applicable…" className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none" />
                {ctTaskId.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ctTaskId.trim()) && (
                  <p className="mt-1 text-[11px] text-warn">Not a valid UUID — this field will be ignored on submit.</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={createTicket} disabled={creating} className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60">
                {creating ? 'Creating…' : 'Create Ticket'}
              </button>
              <button onClick={() => { setShowCreate(false); setCreateError(null); }} className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:text-fg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-180px)] gap-4 overflow-hidden">
        {/* ── Left panel — ticket list ── */}
        <div className="flex w-80 flex-shrink-0 flex-col rounded-lg border border-border bg-surface">
          <div className="space-y-2 border-b border-border p-3">
            <Input placeholder="Search tickets…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="h-8 text-xs" />
            <div className="flex gap-2">
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(1); }} className="h-8 flex-1 text-xs">
                <option value="">All statuses</option>
                {(['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED', 'CLOSED'] as TicketStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
              <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }} className="h-8 flex-1 text-xs">
                <option value="">All priorities</option>
                {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TicketPriority[]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {paginated.length === 0 && <div className="py-10 text-center text-xs text-muted">No tickets match filters.</div>}
            {paginated.map((t) => {
              const breached = t.status === 'OPEN' && hoursAgo(t.createdAt) > 24;
              const isActive = selected?.id === t.id;
              return (
                <button key={t.id} onClick={() => setSelected(t)} className={`w-full border-b border-border px-3 py-3 text-left hover:bg-surface-2 ${isActive ? 'bg-brand/10' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-fg">{t.subject}</span>
                    <Badge tone={priorityTone(t.priority)} className="flex-shrink-0">{t.priority}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={statusTone(t.status)}>{t.status.replace(/_/g, ' ')}</Badge>
                    {breached && <span className="rounded bg-danger/20 px-1 py-0.5 text-[9px] font-medium text-danger">SLA</span>}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">
                    {t.assigneeName ? `→ ${t.assigneeName}` : `→ ${t.assigneeType}`} · {formatDate(t.createdAt)}
                  </div>
                </button>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">Prev</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">Next</button>
            </div>
          )}
        </div>

        {/* ── Right panel — conversation ── */}
        {!selected ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-surface">
            <div className="text-center text-muted">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-xl">✉</div>
              <p className="text-sm font-medium">Select a ticket</p>
              <p className="mt-1 text-xs">Choose a ticket from the left to view the conversation.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
            {/* Header */}
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-fg">{selected.subject}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={statusTone(selected.status)}>{selected.status.replace(/_/g, ' ')}</Badge>
                    <Badge tone={priorityTone(selected.priority)}>{selected.priority}</Badge>
                    <span>Filed {formatDate(selected.createdAt)}</span>
                    {selected.assigneeName && <span>· Assigned to <strong className="text-fg">{selected.assigneeName}</strong></span>}
                    {hoursAgo(selected.createdAt) > 24 && selected.status === 'OPEN' && (
                      <span className="font-semibold text-danger">SLA breached ({Math.round(hoursAgo(selected.createdAt))}h)</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <Select value={selected.status} onChange={(e) => changeStatus(e.target.value as TicketStatus)} className="h-7 text-xs">
                    {(['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED', 'CLOSED'] as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                  {admins.length > 0 && (
                    <Select value={(selected as any).assigneeId ?? ''} onChange={(e) => assign(e.target.value)} className="h-7 text-xs">
                      <option value="">Unassigned</option>
                      {admins.map((a) => <option key={a.id} value={a.id}>{a.firstName ?? a.email}</option>)}
                    </Select>
                  )}
                  <Button size="sm" variant="danger" onClick={() => changeStatus('CLOSED')} className="h-7 text-xs">Close</Button>
                </div>
              </div>

              {/* Requester + Assignee info strip */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 font-semibold text-brand text-[10px]">
                    {(selected.requesterName ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-fg truncate">{selected.requesterName ?? 'Unknown'}</div>
                    <div className="text-muted truncate">{selected.requesterEmail ?? '—'} · {selected.requesterRole ?? 'USER'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-warn/20 font-semibold text-warn text-[10px]">
                    {selected.assigneeType[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-fg truncate">{selected.assigneeName ?? '—'}</div>
                    <div className="text-muted">{selected.assigneeType} · {selected.category}</div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selected.description && (
                <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg">
                  <span className="font-medium text-muted">Description: </span>{selected.description}
                </div>
              )}
            </div>

            {/* Message thread */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {msgLoading && <div className="py-6 text-center text-xs text-muted">Loading messages…</div>}
              {!msgLoading && messages.length === 0 && <div className="py-6 text-center text-xs text-muted">No messages yet. Start the conversation.</div>}
              {messages.map((m) => {
                const isAdmin = m.authorRole === 'ADMIN' || m.authorRole === 'SUPPORT';
                return (
                  <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs ${
                      m.internal ? 'border border-warn/30 bg-warn/10 text-warn'
                        : isAdmin ? 'bg-brand text-white'
                        : 'bg-surface-2 text-fg'
                    }`}>
                      {m.internal && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide">Internal note</div>}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <div className={`mt-1 text-[10px] ${isAdmin ? 'text-white/60' : 'text-muted'}`}>
                        {m.authorName ?? m.authorId} · {formatDate(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>

            {/* Reply */}
            <div className="border-t border-border p-3">
              <div className="relative mb-2">
                <button onClick={() => setCannedOpen((o) => !o)} className="rounded border border-border bg-surface-2 px-2 py-1 text-[10px] font-medium text-muted hover:text-fg">
                  Quick replies ▾
                </button>
                {cannedOpen && (
                  <div className="absolute bottom-full left-0 z-10 mb-1 w-80 rounded-lg border border-border bg-surface shadow-lg">
                    {CANNED.map((cr, i) => (
                      <button key={i} onClick={() => { setReply(cr); setCannedOpen(false); }} className="block w-full border-b border-border px-3 py-2 text-left text-xs text-fg hover:bg-surface-2 last:border-b-0">
                        {cr.slice(0, 70)}…
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" rows={3} className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="rounded border-border" />
                  Post as internal note
                </label>
                <Button size="sm" onClick={sendReply} loading={sending} disabled={!reply.trim()}>Send</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
