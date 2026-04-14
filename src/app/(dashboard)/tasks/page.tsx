'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, patch, post } from '@/lib/api';
import type { Task, TaskStatus } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

const ALL_STATUSES: TaskStatus[] = ['DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED', 'DISPUTED'];

export default function TasksPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | TaskStatus>('');
  const [priority, setPriority] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'detail' | 'timeline'>('detail');
  const [reassignAgentId, setReassignAgentId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignPriority, setReassignPriority] = useState('');
  const [reassignSlaExt, setReassignSlaExt] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await get<Task[] | { items: Task[] }>('/tasks');
        setRows(Array.isArray(data) ? data : data.items);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((t) => {
        if (status && t.status !== status) return false;
        if (priority && t.priority !== priority) return false;
        if (fromDate && new Date(t.createdAt) < new Date(fromDate)) return false;
        if (toDate && new Date(t.createdAt) > new Date(`${toDate}T23:59:59`)) return false;
        if (q) {
          const s = q.toLowerCase();
          return t.title.toLowerCase().includes(s) || t.id.toLowerCase().includes(s) || (t.businessName ?? '').toLowerCase().includes(s) || (t.assignedAgentName ?? '').toLowerCase().includes(s);
        }
        return true;
      }),
    [rows, q, status, priority, fromDate, toDate],
  );

  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: 'Task',
      render: (t) => (
        <div>
          <div className="font-medium text-fg">{t.title}</div>
          <div className="text-xs text-muted">{t.id}</div>
        </div>
      ),
    },
    { key: 'biz', header: 'Business', render: (t) => <span className="text-muted">{t.businessName ?? t.businessId}</span> },
    { key: 'agent', header: 'Agent', render: (t) => <span className="text-muted">{t.assignedAgentName ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
    { key: 'priority', header: 'Priority', render: (t) => <Badge>{t.priority ?? '—'}</Badge> },
    { key: 'budget', header: 'Budget', render: (t) => <span className="text-fg">{formatMoney(t.budget, t.currency)}</span> },
    { key: 'created', header: 'Created', render: (t) => <span className="text-muted">{formatDate(t.createdAt)}</span> },
    { key: 'due', header: 'Due', render: (t) => {
      const overdue = t.dueAt && new Date(t.dueAt) < new Date() && !['COMPLETED', 'CANCELLED'].includes(t.status);
      return <span className={overdue ? 'text-danger font-medium' : 'text-muted'}>{formatDate(t.dueAt)}</span>;
    } },
  ];

  async function changeStatus(task: Task, newStatus: TaskStatus) {
    setRows((prev) => prev.map((r) => (r.id === task.id ? { ...r, status: newStatus } : r)));
    setSelected({ ...task, status: newStatus });
    try { await patch(`/admin/tasks/${task.id}`, { status: newStatus }); } catch {}
  }

  async function forceReassign() {
    if (!selected || !reassignAgentId.trim()) return;
    try {
      await post(`/admin/tasks/${selected.id}/reassign`, {
        agentId: reassignAgentId.trim(),
        reason: reassignReason,
        priority: reassignPriority || undefined,
        slaExtensionMinutes: reassignSlaExt ? Number(reassignSlaExt) : undefined,
      });
    } catch {}
    setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, assignedAgentId: reassignAgentId, assignedAgentName: reassignAgentId } : r)));
    setSelected({ ...selected, assignedAgentId: reassignAgentId, assignedAgentName: reassignAgentId });
    setReassignAgentId('');
    setReassignReason('');
    setReassignPriority('');
    setReassignSlaExt('');
  }

  async function refundTask() {
    if (!selected) return;
    try { await post(`/admin/tasks/${selected.id}/refund`, {}); alert('Refund issued'); } catch { alert('Backend unavailable — would issue refund.'); }
  }

  async function bulk(action: 'cancel' | 'export') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'export') {
      downloadCsv('tasks-selected.csv', rows.filter((r) => selectedIds.has(r.id)));
      return;
    }
    setRows((prev) => prev.map((t) => (selectedIds.has(t.id) ? { ...t, status: 'CANCELLED' as const } : t)));
    try { await post('/admin/tasks/bulk', { ids, action }); } catch {}
    setSelectedIds(new Set());
  }

  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  return (
<>
      <PageHeader
        title="Tasks"
        description="Cross-platform audit of all tasks and their lifecycle."
        actions={<Button variant="secondary" onClick={() => downloadCsv('tasks.csv', filtered)}>Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search title, id, business, agent…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" title="Created from" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" title="Created to" />
        <div className="ml-auto text-xs text-muted">{filtered.length} of {rows.length}</div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-fg">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="danger" onClick={() => bulk('cancel')}>Cancel all</Button>
            <Button size="sm" variant="outline" onClick={() => bulk('export')}>Export</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(t) => t.id}
        loading={loading}
        onRowClick={(t) => { setSelected(t); setTab('detail'); }}
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        width="w-[600px]"
        footer={
          selected && (
            <div className="flex flex-wrap gap-2">
              {!['COMPLETED', 'CANCELLED'].includes(selected.status) && (
                <Button size="sm" variant="danger" onClick={() => changeStatus(selected, 'CANCELLED')}>Cancel</Button>
              )}
              {selected.status === 'CANCELLED' && (
                <Button size="sm" onClick={() => changeStatus(selected, 'OPEN')}>Reopen</Button>
              )}
              <Button size="sm" variant="outline" onClick={refundTask}>Refund</Button>
            </div>
          )
        }
      >
        {selected && (
          <div>
            <div className="mb-4 flex gap-2 border-b border-border">
              <button
                onClick={() => setTab('detail')}
                className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === 'detail' ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'}`}
              >
                Detail
              </button>
              <button
                onClick={() => setTab('timeline')}
                className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === 'timeline' ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'}`}
              >
                Timeline
              </button>
            </div>

            {tab === 'detail' && (
              <div className="space-y-3 text-sm">
                <Row label="Task ID">{selected.id}</Row>
                <Row label="Business">{selected.businessName ?? selected.businessId}</Row>
                <Row label="Agent">{selected.assignedAgentName ?? '—'}</Row>
                <Row label="Status"><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></Row>
                <Row label="Priority">{selected.priority ?? '—'}</Row>
                <Row label="Budget">{formatMoney(selected.budget, selected.currency)}</Row>
                <Row label="Created">{formatDate(selected.createdAt)}</Row>
                <Row label="Due">{formatDate(selected.dueAt)}</Row>

                <div className="rounded-md border border-border bg-surface-2 p-4 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Force-reassign to another agent</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted">Agent ID *</label>
                      <Input value={reassignAgentId} onChange={(e) => setReassignAgentId(e.target.value)} placeholder="agt_…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Override priority</label>
                      <Select value={reassignPriority} onChange={(e) => setReassignPriority(e.target.value)}>
                        <option value="">Keep current</option>
                        {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">SLA extension (minutes)</label>
                      <Input type="number" min={0} value={reassignSlaExt} onChange={(e) => setReassignSlaExt(e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Reason (kept in audit log)</label>
                      <Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="e.g. Agent went offline" />
                    </div>
                  </div>
                  <Button size="sm" onClick={forceReassign} disabled={!reassignAgentId.trim()}>Confirm reassign</Button>
                </div>
              </div>
            )}

            {tab === 'timeline' && <TaskTimeline taskId={selected.id} />}
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

function TaskTimeline({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<{ id: string; event: string; actor?: string; at: string }[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await get<{ items: typeof events }>(`/admin/tasks/${taskId}/timeline`);
        setEvents(d.items);
      } catch (e: any) {
        setTimelineError(e?.message ?? 'Failed to load timeline');
      }
    })();
  }, [taskId]);
  if (timelineError) return <div className="py-4 text-center text-sm text-danger">{timelineError}</div>;
  return (
    <div className="relative ml-2 border-l-2 border-border pl-4">
      {events.map((e) => (
        <div key={e.id} className="relative mb-4 pb-2">
          <span className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 border-brand bg-surface" />
          <div className="text-xs font-medium text-fg">{e.event}</div>
          <div className="text-[11px] text-muted">{e.actor ? `by ${e.actor}` : ''} {formatDate(e.at)}</div>
        </div>
      ))}
    </div>
  );
}
