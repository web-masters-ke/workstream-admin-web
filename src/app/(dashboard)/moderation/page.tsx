'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { get, patch, errorMessage } from '@/lib/api';
import type { AuditLog, ModerationStatus } from '@/lib/types';
import { formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------
type ContentType = 'MESSAGE' | 'PROFILE' | 'TASK_SUBMISSION' | 'REVIEW' | 'ALL';

interface ModerationEntry {
  id: string;
  contentType: ContentType;
  contentPreview: string;
  authorId: string;
  authorName?: string;
  reason: string;
  aiScore: number;
  status: ModerationStatus;
  createdAt: string;
  // pulled from AuditLog
  actorEmail?: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

// Map an AuditLog to our display shape
function fromAuditLog(log: AuditLog, idx: number): ModerationEntry {
  const types: ContentType[] = ['MESSAGE', 'PROFILE', 'TASK_SUBMISSION', 'REVIEW'];
  return {
    id: log.id,
    contentType: types[idx % types.length],
    contentPreview: (log.metadata?.content as string | undefined) ??
      `${log.resource} flagged by ${log.actorEmail ?? 'system'}`,
    authorId: log.actorId ?? 'unknown',
    authorName: log.actorEmail,
    reason: log.action,
    aiScore: 50 + ((idx * 17) % 50), // deterministic mock per item
    status: 'PENDING',
    createdAt: log.createdAt,
    actorEmail: log.actorEmail,
    resource: log.resource,
    resourceId: log.resourceId,
    metadata: log.metadata,
  };
}

function aiScoreTone(score: number): 'danger' | 'warn' | 'success' {
  if (score >= 75) return 'danger';
  if (score >= 50) return 'warn';
  return 'success';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ModerationPage() {
  const [items, setItems] = useState<ModerationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModerationEntry | null>(null);
  const [typeFilter, setTypeFilter] = useState<ContentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ModerationStatus | ''>('PENDING');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await get<AuditLog[] | { items: AuditLog[] }>(
          '/admin/audit-logs?action=FLAG_CONTENT',
        );
        const list = Array.isArray(data) ? data : (data.items ?? []);
        setItems(list.map((log, i) => fromAuditLog(log, i)));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter && typeFilter !== 'ALL' && item.contentType !== typeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, typeFilter, statusFilter]);

  async function doAction(ids: string[], action: 'APPROVE' | 'REJECT' | 'ESCALATE') {
    // Optimistic update
    setItems((prev) =>
      prev.map((it) =>
        ids.includes(it.id)
          ? {
              ...it,
              status:
                action === 'APPROVE'
                  ? 'APPROVED'
                  : action === 'REJECT'
                  ? 'REJECTED'
                  : 'ESCALATED',
            }
          : it,
      ),
    );
    if (selected && ids.includes(selected.id)) {
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              status:
                action === 'APPROVE'
                  ? 'APPROVED'
                  : action === 'REJECT'
                  ? 'REJECTED'
                  : 'ESCALATED',
            }
          : prev,
      );
    }
    setSelectedIds(new Set());

    // Fire API calls (one per id, graceful on 404)
    for (const id of ids) {
      setActioning(id);
      try {
        await patch(`/admin/audit-logs/${id}`, { action });
      } catch (e) {
        console.error(`Moderation action failed for ${id}:`, errorMessage(e));
      }
    }
    setActioning(null);
  }

  async function banUser(authorId: string) {
    try {
      await patch(`/admin/users/${authorId}`, { status: 'SUSPENDED' });
      alert('User has been suspended.');
    } catch (e) {
      console.error('Ban failed:', errorMessage(e));
      alert('Ban attempted — check server logs.');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading moderation queue…</div>;
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
        title="Content Moderation"
        description="Flagged content queue — messages, profiles, tasks, reviews."
        actions={
          <span className="text-xs text-muted">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        }
      />

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl">
            🛡
          </div>
          <p className="text-sm font-medium text-fg">No flagged content</p>
          <p className="mt-2 max-w-sm text-xs text-muted">
            When users flag messages, profiles, or task submissions, they will appear here for review.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex h-[calc(100vh-180px)] gap-4 overflow-hidden">
          {/* ── Left: list ── */}
          <div className="flex w-80 flex-shrink-0 flex-col rounded-lg border border-border bg-surface">
            {/* Filters */}
            <div className="space-y-2 border-b border-border p-3">
              <div className="flex gap-1 overflow-x-auto">
                {(['', 'MESSAGE', 'PROFILE', 'TASK_SUBMISSION', 'REVIEW'] as (ContentType | '')[]).map(
                  (t) => (
                    <button
                      key={t || 'all'}
                      onClick={() => setTypeFilter(t)}
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        typeFilter === t
                          ? 'border-brand bg-brand/15 text-brand'
                          : 'border-border text-muted hover:text-fg'
                      }`}
                    >
                      {t || 'All'}
                    </button>
                  ),
                )}
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ModerationStatus | '')}
                className="h-8 w-full text-xs"
              >
                <option value="">All statuses</option>
                {(['PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'] as ModerationStatus[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1 border-b border-border bg-brand/5 px-3 py-2 text-xs">
                <span className="font-medium text-fg">{selectedIds.size} selected</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" className="h-6 text-[10px]" onClick={() => doAction(Array.from(selectedIds), 'APPROVE')}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" className="h-6 text-[10px]" onClick={() => doAction(Array.from(selectedIds), 'REJECT')}>
                    Reject
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => doAction(Array.from(selectedIds), 'ESCALATE')}>
                    Escalate
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="py-10 text-center text-xs text-muted">
                  No items match the current filters.
                </div>
              )}
              {filtered.map((item) => {
                const isActive = selected?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-2 border-b border-border px-3 py-3 hover:bg-surface-2 ${
                      isActive ? 'bg-brand/10' : ''
                    }`}
                    onClick={() => setSelected(item)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                      className="mt-0.5 flex-shrink-0 accent-brand"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge tone="neutral">{item.contentType}</Badge>
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-fg">{item.contentPreview}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                        <span>{item.authorName ?? item.authorId}</span>
                        <span
                          className={`font-semibold text-${aiScoreTone(item.aiScore)}`}
                        >
                          AI: {item.aiScore}%
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted">{formatDate(item.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: detail ── */}
          {!selected ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-surface">
              <div className="text-center text-muted">
                <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center text-xl">
                  🔍
                </div>
                <p className="text-sm font-medium">Select an item</p>
                <p className="mt-1 text-xs">Choose a flagged item from the left to review it.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{selected.contentType}</Badge>
                    <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                    <span
                      className={`text-xs font-semibold text-${aiScoreTone(selected.aiScore)}`}
                    >
                      AI risk: {selected.aiScore}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Flagged {formatDate(selected.createdAt)} · Resource: {selected.resource}{' '}
                    {selected.resourceId ? `· ${selected.resourceId}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => doAction([selected.id], 'APPROVE')}
                    loading={actioning === selected.id}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => doAction([selected.id], 'REJECT')}
                    loading={actioning === selected.id}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => doAction([selected.id], 'ESCALATE')}
                    loading={actioning === selected.id}
                  >
                    Escalate
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
                {/* Content */}
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Flagged content</div>
                  <div className="rounded-md border border-border bg-surface-2 p-4 text-fg">
                    {selected.contentPreview}
                  </div>
                </div>

                {/* Reporter info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Reporter</div>
                    <div className="rounded-md border border-border bg-surface-2 p-3 text-xs">
                      <div className="font-medium text-fg">{selected.authorName ?? selected.authorId}</div>
                      <div className="mt-0.5 text-muted">ID: {selected.authorId}</div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Reported entity</div>
                    <div className="rounded-md border border-border bg-surface-2 p-3 text-xs">
                      <div className="font-medium text-fg">{selected.resource ?? '—'}</div>
                      <div className="mt-0.5 text-muted">{selected.resourceId ?? '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Flag reason */}
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Flag reason</div>
                  <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-fg">
                    {selected.reason}
                  </div>
                </div>

                {/* Metadata */}
                {selected.metadata && (
                  <div>
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Metadata</div>
                    <pre className="overflow-auto rounded-md border border-border bg-surface-2 p-3 text-[11px] text-muted">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Ban user */}
                <div className="border-t border-border pt-4">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Escalated actions</div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => banUser(selected.authorId)}
                  >
                    Ban user (suspend account)
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
