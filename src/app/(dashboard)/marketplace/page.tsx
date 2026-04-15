'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { get, post, patch, del, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

// ── Types ──────────────────────────────────────────────────────────────────────

type MarketplaceStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'EXPIRED';

interface AdminListing {
  id: string;
  title: string;
  description: string;
  category: string | null;
  requiredSkills: string[];
  budgetCents: number;
  currency: string;
  dueAt: string;
  locationText: string | null;
  marketplaceStatus: MarketplaceStatus;
  adminRejectNote: string | null;
  maxBids: number | null;
  marketplaceExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  business: {
    id: string;
    name: string;
    email: string;
    city: string | null;
  };
  _count: {
    bids: number;
  };
}

interface AdminListingsResult {
  items: AdminListing[];
  total: number;
  stats: {
    total: number;
    pendingReview: number;
    approved: number;
    active: number;
    rejected: number;
    closed: number;
  };
}

interface Bid {
  id: string;
  taskId: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  agentRating: number;
  agentCompletedTasks: number;
  agentSkills: string[];
  agentType: 'EMPLOYEE' | 'FREELANCER';
  proposedCents: number;
  coverNote: string;
  estimatedDays: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  rejectionNote: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<MarketplaceStatus, string> = {
  DRAFT:          'neutral',
  PENDING_REVIEW: 'warning',
  APPROVED:       'info',
  REJECTED:       'danger',
  ACTIVE:         'success',
  CLOSED:         'neutral',
  EXPIRED:        'danger',
};

const STATUS_LABEL: Record<MarketplaceStatus, string> = {
  DRAFT:          'Draft',
  PENDING_REVIEW: 'Under Review',
  APPROVED:       'Approved',
  REJECTED:       'Rejected',
  ACTIVE:         'Active',
  CLOSED:         'Closed',
  EXPIRED:        'Expired',
};

// ── Bid status helpers ────────────────────────────────────────────────────────

const BID_STATUS_TONE: Record<Bid['status'], string> = {
  PENDING:   'warning',
  ACCEPTED:  'success',
  REJECTED:  'danger',
  WITHDRAWN: 'neutral',
};

// ── Bids panel (embedded inside listing detail) ────────────────────────────────

function BidsPanel({ listingId, budgetCents, currency }: { listingId: string; budgetCents: number; currency: string }) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectBid, setRejectBid] = useState<Bid | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | Bid['status']>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<Bid[] | { items: Bid[] }>(`/marketplace/${listingId}/bids`);
      setBids(Array.isArray(data) ? data : (data as any).items ?? []);
    } catch (e: any) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const filtered = bids.filter((b) => filter === 'ALL' || b.status === filter);

  const counts = bids.reduce(
    (a, b) => { a[b.status] = (a[b.status] ?? 0) + 1; return a; },
    {} as Record<string, number>,
  );

  const handleAccept = async (bid: Bid) => {
    if (!confirm(`Accept ${bid.agentName}'s bid of ${formatMoney(bid.proposedCents / 100, currency)}?`)) return;
    setActing(bid.id);
    try {
      await patch(`/marketplace/${listingId}/bids/${bid.id}/accept`, {});
      setBids((prev) => prev.map((b) => b.id === bid.id ? { ...b, status: 'ACCEPTED', acceptedAt: new Date().toISOString() } : b));
      setToast(`Bid accepted — ${bid.agentName} has been notified.`);
    } catch (e: any) {
      alert(errorMessage(e));
    } finally {
      setActing(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectBid) return;
    setActing(rejectBid.id);
    try {
      await patch(`/marketplace/${listingId}/bids/${rejectBid.id}/reject`, { note: rejectNote || undefined });
      setBids((prev) => prev.map((b) => b.id === rejectBid.id ? { ...b, status: 'REJECTED', rejectionNote: rejectNote || null } : b));
      setToast('Bid rejected.');
      setRejectBid(null);
      setRejectNote('');
    } catch (e: any) {
      alert(errorMessage(e));
    } finally {
      setActing(null);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-muted">Loading bids…</div>;
  if (error) return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
      {error}
      <button onClick={load} className="ml-3 underline">Retry</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { label: 'Total', count: bids.length, color: 'text-fg' },
          { label: 'Pending', count: counts.PENDING ?? 0, color: 'text-amber-600' },
          { label: 'Accepted', count: counts.ACCEPTED ?? 0, color: 'text-success' },
          { label: 'Rejected', count: counts.REJECTED ?? 0, color: 'text-danger' },
        ]).map(({ label, count, color }) => (
          <div key={label} className="rounded-lg border border-border bg-surface-2 p-2.5 text-center">
            <p className={`text-xl font-bold ${color}`}>{count}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f ? 'bg-brand-600 text-white' : 'border border-border text-muted hover:text-fg'
            }`}
          >
            {f === 'ALL' ? `All (${bids.length})` : `${f} (${counts[f] ?? 0})`}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-xs text-muted hover:text-fg underline">Refresh</button>
      </div>

      {/* Toast */}
      {toast && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">{toast}</p>
      )}

      {/* Bids list */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">
          {bids.length === 0 ? 'No bids have been placed on this listing yet.' : `No ${filter.toLowerCase()} bids.`}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bid) => {
            const pct = budgetCents > 0 ? Math.round((bid.proposedCents - budgetCents) / budgetCents * 100) : 0;
            const isActing = acting === bid.id;
            return (
              <div
                key={bid.id}
                className={`rounded-xl border p-4 ${
                  bid.status === 'ACCEPTED' ? 'border-success/40 bg-success/5' : 'border-border bg-white dark:bg-surface-2'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-fg">{bid.agentName}</p>
                      <Badge tone={BID_STATUS_TONE[bid.status] as any}>{bid.status}</Badge>
                      <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                        {bid.agentType}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{bid.agentEmail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-brand-600">{formatMoney(bid.proposedCents / 100, currency)}</p>
                    {pct !== 0 && (
                      <p className={`text-[11px] font-semibold ${pct < 0 ? 'text-success' : 'text-danger'}`}>
                        {pct > 0 ? '+' : ''}{pct}% vs budget
                      </p>
                    )}
                  </div>
                </div>

                {/* Agent stats */}
                <div className="flex gap-3 mb-3">
                  <span className="text-xs text-muted">
                    ⭐ {bid.agentRating.toFixed(1)} rating
                  </span>
                  <span className="text-xs text-muted">
                    ✓ {bid.agentCompletedTasks} tasks done
                  </span>
                  <span className="text-xs text-muted">
                    🗓 Est. {bid.estimatedDays} day{bid.estimatedDays !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Skills */}
                {bid.agentSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {bid.agentSkills.map((s) => (
                      <span key={s} className="rounded-md bg-surface-2 border border-border px-2 py-0.5 text-[11px] text-fg">{s}</span>
                    ))}
                  </div>
                )}

                {/* Cover note */}
                {bid.coverNote && (
                  <div className="rounded-lg bg-surface-2 border border-border p-3 mb-3">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Cover note</p>
                    <p className="text-sm text-fg/90 leading-relaxed whitespace-pre-wrap">{bid.coverNote}</p>
                  </div>
                )}

                {/* Rejection note */}
                {bid.status === 'REJECTED' && bid.rejectionNote && (
                  <div className="rounded-lg bg-danger/5 border border-danger/20 p-3 mb-3">
                    <p className="text-xs font-semibold text-danger mb-1">Rejection note</p>
                    <p className="text-sm text-fg/80">{bid.rejectionNote}</p>
                  </div>
                )}

                {/* Accepted at */}
                {bid.status === 'ACCEPTED' && bid.acceptedAt && (
                  <p className="text-xs text-success mb-3">Accepted {formatDate(bid.acceptedAt)}</p>
                )}

                {/* Actions */}
                {bid.status === 'PENDING' && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleAccept(bid)}
                      disabled={isActing}
                      className="flex-1 rounded-lg bg-success px-3 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50"
                    >
                      {isActing ? 'Processing…' : 'Accept bid'}
                    </button>
                    <button
                      onClick={() => { setRejectBid(bid); setRejectNote(''); }}
                      disabled={isActing}
                      className="flex-1 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                )}

                <p className="mt-2 text-[10px] text-muted">Submitted {formatDate(bid.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject bid modal */}
      {rejectBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-2xl">
            <h3 className="mb-1 font-bold text-fg">Decline bid</h3>
            <p className="mb-4 text-sm text-muted">Optionally explain why you're declining <strong>{rejectBid.agentName}</strong>'s bid.</p>
            <textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Optional feedback for the agent…"
              className="mb-4 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-surface-2"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectBid(null)}>Cancel</Button>
              <button
                onClick={handleRejectConfirm}
                disabled={!!acting}
                className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {acting ? 'Declining…' : 'Decline bid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reject drawer ──────────────────────────────────────────────────────────────

function RejectDrawer({
  listing,
  open,
  onClose,
  onConfirm,
}: {
  listing: AdminListing | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setNote(''); setError(null); }
  }, [open]);

  const handleSubmit = async () => {
    if (!note.trim()) { setError('A rejection reason is required.'); return; }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(note.trim());
    } catch (e: any) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  if (!open || !listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl bg-surface p-6 shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
            <svg className="h-5 w-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-fg">Reject listing</h3>
            <p className="text-sm text-muted">The org owner will see this reason.</p>
          </div>
        </div>

        <div className="my-4 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-sm font-semibold text-fg line-clamp-1">{listing.title}</p>
          <p className="text-xs text-muted">{listing.business.name}</p>
        </div>

        <div className="mb-4 space-y-1.5">
          <label className="text-sm font-semibold text-fg">Rejection reason *</label>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Listing violates community guidelines — please remove the pricing guarantee language and resubmit."
            className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-fg placeholder-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:bg-surface-2"
          />
          <p className="text-xs text-muted">{note.length} characters</p>
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <button
            onClick={handleSubmit}
            disabled={loading || !note.trim()}
            className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
          >
            {loading ? 'Rejecting…' : 'Reject listing'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Listing detail flyout ──────────────────────────────────────────────────────

function ListingDetail({
  listing,
  onClose,
  onApprove,
  onReject,
}: {
  listing: AdminListing | null;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (listing: AdminListing) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'bids'>('details');

  useEffect(() => { if (listing) setActiveTab('details'); }, [listing?.id]);

  if (!listing) return null;

  const handleApprove = async () => {
    setApproving(true);
    setApproveError(null);
    try {
      await onApprove(listing.id);
      onClose();
    } catch (e: any) {
      setApproveError(errorMessage(e));
      setApproving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-surface">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="font-bold text-fg">Review Listing</h2>
              <p className="text-xs text-muted">ID: {listing.id.slice(0, 8)}… · {listing._count.bids} bid{listing._count.bids !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 px-5 pb-0">
            {([
              { key: 'details', label: 'Details' },
              { key: 'bids',    label: `Bids ${listing._count.bids > 0 ? `(${listing._count.bids})` : ''}` },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === t.key
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {/* ── Details tab ──────────────────────────────────────── */}
          {activeTab === 'details' && (
            <div className="space-y-5">
              {/* Status + org */}
              <div className="flex items-center justify-between">
                <Badge tone={STATUS_TONE[listing.marketplaceStatus] as any}>
                  {STATUS_LABEL[listing.marketplaceStatus]}
                </Badge>
                <div className="text-right text-sm">
                  <p className="font-semibold text-fg">{listing.business.name}</p>
                  <p className="text-muted">{listing.business.email}</p>
                </div>
              </div>

              {/* Title & description */}
              <div className="rounded-lg border border-border bg-surface-2 p-4">
                <h3 className="mb-2 text-lg font-bold text-fg">{listing.title}</h3>
                <p className="whitespace-pre-wrap text-sm text-fg/80 leading-relaxed">{listing.description}</p>
              </div>

              {/* Key details */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Budget', value: formatMoney(listing.budgetCents / 100, listing.currency) },
                  { label: 'Deadline', value: formatDate(listing.dueAt) },
                  { label: 'Category', value: listing.category ?? '—' },
                  { label: 'Location', value: listing.locationText ?? 'Remote / Any' },
                  { label: 'Max bids', value: listing.maxBids?.toString() ?? 'Unlimited' },
                  { label: 'Bids so far', value: listing._count.bids.toString() },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-white p-3 dark:bg-surface-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</p>
                    <p className="mt-0.5 font-semibold text-fg">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Skills */}
              {listing.requiredSkills.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Required skills</p>
                  <div className="flex flex-wrap gap-2">
                    {listing.requiredSkills.map((s) => (
                      <span key={s} className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Posted date */}
              <p className="text-xs text-muted">Posted {formatDate(listing.createdAt)}</p>

              {/* Previous rejection note */}
              {listing.adminRejectNote && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
                  <p className="font-semibold text-danger">Previous rejection note:</p>
                  <p className="mt-1 text-fg/80">{listing.adminRejectNote}</p>
                </div>
              )}

              {approveError && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{approveError}</p>
              )}

              {/* Actions */}
              {listing.marketplaceStatus === 'PENDING_REVIEW' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => onReject(listing)}
                    className="flex-1 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                  >
                    {approving ? 'Approving…' : 'Approve & publish'}
                  </button>
                </div>
              )}
              {listing.marketplaceStatus === 'REJECTED' && (
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                >
                  {approving ? 'Approving…' : 'Approve & publish'}
                </button>
              )}
              {/* Quick link to bids tab */}
              {listing._count.bids > 0 && (
                <button
                  onClick={() => setActiveTab('bids')}
                  className="w-full rounded-lg border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-400"
                >
                  View {listing._count.bids} bid{listing._count.bids !== 1 ? 's' : ''} →
                </button>
              )}
            </div>
          )}

          {/* ── Bids tab ─────────────────────────────────────────── */}
          {activeTab === 'bids' && (
            <BidsPanel
              listingId={listing.id}
              budgetCents={listing.budgetCents}
              currency={listing.currency}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── All-bids view (flat cross-listing bid table) ───────────────────────────────

function AllBidsView({ listings }: { listings: AdminListing[] }) {
  const [allBids, setAllBids] = useState<Array<Bid & { listingTitle: string; listingId: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [bidFilter, setBidFilter] = useState<'ALL' | Bid['status']>('ALL');
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Load bids for all listings that have bids
      const listingsWithBids = listings.filter((l) => l._count.bids > 0);
      const results: Array<Bid & { listingTitle: string; listingId: string }> = [];
      await Promise.allSettled(
        listingsWithBids.map(async (listing) => {
          try {
            const data = await get<Bid[] | { items: Bid[] }>(`/marketplace/${listing.id}/bids`);
            const bids = Array.isArray(data) ? data : (data as any).items ?? [];
            bids.forEach((b: Bid) => results.push({ ...b, listingTitle: listing.title, listingId: listing.id }));
          } catch { /* skip failed */ }
        })
      );
      if (!cancelled) {
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllBids(results);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listings]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const filtered = useMemo(() => allBids.filter((b) => {
    if (bidFilter !== 'ALL' && b.status !== bidFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return b.agentName.toLowerCase().includes(q) || b.listingTitle.toLowerCase().includes(q) || b.agentEmail.toLowerCase().includes(q);
    }
    return true;
  }), [allBids, bidFilter, search]);

  const counts = allBids.reduce((a, b) => { a[b.status] = (a[b.status] ?? 0) + 1; return a; }, {} as Record<string, number>);

  const handleAccept = async (bid: Bid & { listingTitle: string; listingId: string }) => {
    if (!confirm(`Accept ${bid.agentName}'s bid on "${bid.listingTitle}"?`)) return;
    setActing(bid.id);
    try {
      await patch(`/marketplace/${bid.listingId}/bids/${bid.id}/accept`, {});
      setAllBids((prev) => prev.map((b) => b.id === bid.id ? { ...b, status: 'ACCEPTED' as const } : b));
      setToast(`Bid accepted — ${bid.agentName} notified.`);
    } catch (e: any) { alert(errorMessage(e)); }
    finally { setActing(null); }
  };

  const handleReject = async (bid: Bid & { listingTitle: string; listingId: string }) => {
    const note = prompt(`Decline ${bid.agentName}'s bid? Enter optional feedback (or leave blank):`);
    if (note === null) return; // cancelled
    setActing(bid.id);
    try {
      await patch(`/marketplace/${bid.listingId}/bids/${bid.id}/reject`, { note: note || undefined });
      setAllBids((prev) => prev.map((b) => b.id === bid.id ? { ...b, status: 'REJECTED' as const } : b));
      setToast('Bid declined.');
    } catch (e: any) { alert(errorMessage(e)); }
    finally { setActing(null); }
  };

  const bidColumns: Column<Bid & { listingTitle: string; listingId: string }>[] = [
    {
      key: 'agent',
      header: 'Agent',
      render: (b) => (
        <div>
          <p className="font-semibold text-fg">{b.agentName}</p>
          <p className="text-xs text-muted">{b.agentEmail}</p>
        </div>
      ),
    },
    {
      key: 'listing',
      header: 'Listing',
      render: (b) => <p className="text-sm text-fg line-clamp-1">{b.listingTitle}</p>,
    },
    {
      key: 'amount',
      header: 'Proposed',
      render: (b) => <span className="font-semibold text-brand-600">{formatMoney(b.proposedCents / 100, 'KES')}</span>,
    },
    {
      key: 'days',
      header: 'Est. days',
      render: (b) => <span className="text-sm text-muted">{b.estimatedDays}d</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <Badge tone={BID_STATUS_TONE[b.status] as any}>{b.status}</Badge>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (b) => (
        <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
          {b.agentType}
        </span>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (b) => <span className="text-xs text-muted">{formatDate(b.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (b) => b.status === 'PENDING' ? (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleAccept(b); }}
            disabled={acting === b.id}
            className="rounded-lg bg-success px-2.5 py-1 text-xs font-semibold text-white hover:bg-success/90 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleReject(b); }}
            disabled={acting === b.id}
            className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total bids" value={allBids.length} />
        <StatCard label="Pending" value={counts.PENDING ?? 0} />
        <StatCard label="Accepted" value={counts.ACCEPTED ?? 0} />
        <StatCard label="Rejected" value={counts.REJECTED ?? 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Search agent or listing…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <div className="flex gap-1">
          {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setBidFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                bidFilter === f ? 'bg-brand-600 text-white' : 'border border-border text-muted hover:text-fg'
              }`}
            >
              {f === 'ALL' ? `All (${allBids.length})` : `${f} (${counts[f] ?? 0})`}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted">{filtered.length} bid{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {toast && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">{toast}</p>
      )}

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted">Loading bids across all listings…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">No bids found.</div>
          ) : (
            <DataTable columns={bidColumns} rows={filtered} getRowId={(r) => r.id} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── Freelancer review tab ──────────────────────────────────────────────────────

interface FreelancerAgent {
  id: string;
  userId: string;
  agentType: string;
  status: string;
  rating: number;
  completedTasks: number;
  bio: string | null;
  hourlyRate: number | null;
  fullName: string;
  email: string;
  phone: string | null;
  skills: { skill: string }[];
  createdAt: string;
}

function FreelancerReviewTab() {
  const [agents, setAgents] = useState<FreelancerAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FreelancerAgent | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'PENDING_VERIFICATION' | 'ALL'>('PENDING_VERIFICATION');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await get<{ items: FreelancerAgent[] }>('/agents?limit=200');
      const all: FreelancerAgent[] = Array.isArray(res) ? res : (res?.items ?? []);
      setAgents(all.filter((a) => a.agentType === 'FREELANCER'));
    } catch (e: any) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  async function approve(agent: FreelancerAgent) {
    setActing(agent.id);
    try {
      await patch(`/agents/${agent.id}/status`, { status: 'ACTIVE' });
      setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, status: 'ACTIVE' } : a));
      setToast(`${agent.fullName} approved — now active on the marketplace.`);
    } catch (e: any) { alert(errorMessage(e)); }
    finally { setActing(null); }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setActing(rejectTarget.id);
    try {
      await patch(`/agents/${rejectTarget.id}/status`, { status: 'SUSPENDED', note: rejectNote || undefined });
      setAgents((prev) => prev.map((a) => a.id === rejectTarget.id ? { ...a, status: 'SUSPENDED' } : a));
      setToast(`${rejectTarget.fullName} rejected.`);
      setRejectTarget(null);
      setRejectNote('');
    } catch (e: any) { alert(errorMessage(e)); }
    finally { setActing(null); }
  }

  const displayed = agents.filter((a) => {
    if (statusFilter === 'PENDING_VERIFICATION' && a.status !== 'PENDING_VERIFICATION') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.fullName.toLowerCase().includes(q) && !a.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingCount = agents.filter((a) => a.status === 'PENDING_VERIFICATION').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total freelancers" value={agents.length} />
        <StatCard label="Pending review" value={pendingCount} trend={pendingCount > 0 ? 1 : undefined} />
        <StatCard label="Active" value={agents.filter((a) => a.status === 'ACTIVE').length} />
        <StatCard label="Suspended" value={agents.filter((a) => a.status === 'SUSPENDED').length} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <div className="flex gap-1">
          {([
            { value: 'PENDING_VERIFICATION', label: `Pending (${pendingCount})` },
            { value: 'ALL', label: `All (${agents.length})` },
          ] as const).map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === f.value ? 'bg-brand text-brand-fg' : 'border border-border text-muted hover:text-fg'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="ml-auto text-xs text-muted hover:text-fg underline">Refresh</button>
      </div>

      {toast && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">{toast}</p>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error} <button onClick={load} className="ml-2 underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted">Loading freelancers…</div>
      ) : displayed.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-semibold text-fg">
            {statusFilter === 'PENDING_VERIFICATION' ? 'No freelancers pending review' : 'No freelancers found'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {statusFilter === 'PENDING_VERIFICATION'
              ? 'All caught up! New freelancer applications will appear here.'
              : 'Try adjusting the filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((agent) => {
            const busy = acting === agent.id;
            const isPending = agent.status === 'PENDING_VERIFICATION';
            return (
              <div
                key={agent.id}
                className={`rounded-xl border p-4 ${isPending ? 'border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10' : 'border-border bg-surface'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left — agent info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-fg">{agent.fullName || agent.email}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isPending ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : agent.status === 'ACTIVE' ? 'bg-success/10 text-success'
                        : 'bg-danger/10 text-danger'
                      }`}>
                        {agent.status.replace('_', ' ')}
                      </span>
                      <span className="rounded-full bg-surface-2 border border-border px-2 py-0.5 text-[10px] text-muted">FREELANCER</span>
                    </div>
                    <p className="text-xs text-muted mb-1">{agent.email}{agent.phone ? ` · ${agent.phone}` : ''}</p>
                    {agent.bio && <p className="text-sm text-fg/80 leading-relaxed mb-2 line-clamp-2">{agent.bio}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-muted mb-2">
                      <span>⭐ {(agent.rating ?? 0).toFixed(1)}</span>
                      <span>✓ {agent.completedTasks ?? 0} tasks</span>
                      {agent.hourlyRate != null && <span>💰 {formatMoney(agent.hourlyRate, 'KES')}/hr</span>}
                      <span>Joined {formatDate(agent.createdAt)}</span>
                    </div>
                    {agent.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agent.skills.map((s) => (
                          <span key={s.skill} className="rounded-md bg-surface-2 border border-border px-2 py-0.5 text-[11px] text-fg">
                            {s.skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right — actions */}
                  {isPending && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => approve(agent)}
                        disabled={busy}
                        className="rounded-lg bg-success px-4 py-2 text-xs font-semibold text-white hover:bg-success/90 disabled:opacity-50 whitespace-nowrap"
                      >
                        {busy ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => { setRejectTarget(agent); setRejectNote(''); }}
                        disabled={busy}
                        className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {!isPending && agent.status === 'ACTIVE' && (
                    <button
                      onClick={() => { setRejectTarget(agent); setRejectNote(''); }}
                      disabled={busy}
                      className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 shrink-0"
                    >
                      Suspend
                    </button>
                  )}
                  {!isPending && agent.status === 'SUSPENDED' && (
                    <button
                      onClick={() => approve(agent)}
                      disabled={busy}
                      className="rounded-lg bg-success px-4 py-2 text-xs font-semibold text-white hover:bg-success/90 disabled:opacity-50 shrink-0"
                    >
                      Reinstate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-2xl">
            <h3 className="mb-1 font-bold text-fg">
              {rejectTarget.status === 'ACTIVE' ? 'Suspend' : 'Reject'} freelancer
            </h3>
            <p className="mb-4 text-sm text-muted">
              Optionally provide a reason for <strong>{rejectTarget.fullName || rejectTarget.email}</strong>.
            </p>
            <textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Optional reason…"
              className="mb-4 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none dark:bg-surface-2"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <button
                onClick={confirmReject}
                disabled={!!acting}
                className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {acting ? 'Processing…' : (rejectTarget.status === 'ACTIVE' ? 'Suspend' : 'Reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type TabFilter = 'PENDING_REVIEW' | 'ALL' | 'BIDS' | 'FREELANCERS';

export default function AdminMarketplacePage() {
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [stats, setStats] = useState({ total: 0, pendingReview: 0, approved: 0, active: 0, rejected: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabFilter>('PENDING_REVIEW');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MarketplaceStatus | 'ALL'>('ALL');

  // Detail flyout
  const [selectedListing, setSelectedListing] = useState<AdminListing | null>(null);

  // Reject drawer
  const [rejectTarget, setRejectTarget] = useState<AdminListing | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await get<AdminListingsResult>('/marketplace/admin');
      const items = Array.isArray(res) ? res : (res as any).items ?? [];
      setListings(items);
      if ((res as any).stats) setStats((res as any).stats);
      else {
        // Derive stats from items if not returned
        const s = items.reduce(
          (acc: any, l: AdminListing) => {
            acc.total++;
            if (l.marketplaceStatus === 'PENDING_REVIEW') acc.pendingReview++;
            if (l.marketplaceStatus === 'APPROVED') acc.approved++;
            if (l.marketplaceStatus === 'ACTIVE') acc.active++;
            if (l.marketplaceStatus === 'REJECTED') acc.rejected++;
            if (l.marketplaceStatus === 'CLOSED') acc.closed++;
            return acc;
          },
          { total: 0, pendingReview: 0, approved: 0, active: 0, rejected: 0, closed: 0 }
        );
        setStats(s);
      }
    } catch (e: any) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleApprove = async (id: string) => {
    await patch(`/marketplace/admin/${id}/approve`, {});
    setToast({ msg: 'Listing approved and published.', tone: 'success' });
    // Update local state
    setListings((prev) =>
      prev.map((l) => l.id === id ? { ...l, marketplaceStatus: 'APPROVED' as MarketplaceStatus } : l)
    );
    await load();
  };

  const handleReject = async (note: string) => {
    if (!rejectTarget) return;
    await patch(`/marketplace/admin/${rejectTarget.id}/reject`, { note });
    setToast({ msg: 'Listing rejected.', tone: 'error' });
    setRejectTarget(null);
    setSelectedListing(null);
    await load();
  };

  const filtered = listings.filter((l) => {
    if (tab === 'PENDING_REVIEW' && l.marketplaceStatus !== 'PENDING_REVIEW') return false;
    if (statusFilter !== 'ALL' && l.marketplaceStatus !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !l.title.toLowerCase().includes(q) &&
        !l.business.name.toLowerCase().includes(q) &&
        !(l.category ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const columns: Column<AdminListing>[] = [
    {
      key: 'title',
      header: 'Listing',
      render: (l) => (
        <div>
          <p className="font-semibold text-fg line-clamp-1">{l.title}</p>
          <p className="text-xs text-muted">{l.business.name} · {l.category ?? 'No category'}</p>
        </div>
      ),
    },
    {
      key: 'business',
      header: 'Posted by',
      render: (l) => (
        <div>
          <p className="text-sm text-fg">{l.business.name}</p>
          <p className="text-xs text-muted">{l.business.email}</p>
        </div>
      ),
    },
    {
      key: 'budget',
      header: 'Budget',
      render: (l) => (
        <span className="font-semibold text-fg">
          {formatMoney(l.budgetCents / 100, l.currency)}
        </span>
      ),
    },
    {
      key: 'bids',
      header: 'Bids',
      render: (l) => (
        <span className={`font-semibold ${l._count.bids > 0 ? 'text-brand' : 'text-muted'}`}>
          {l._count.bids}
        </span>
      ),
    },
    {
      key: 'dueAt',
      header: 'Deadline',
      render: (l) => {
        const days = Math.ceil((new Date(l.dueAt).getTime() - Date.now()) / 86400000);
        return (
          <span className={`text-sm ${days < 3 ? 'font-semibold text-danger' : 'text-fg'}`}>
            {formatDate(l.dueAt)}
          </span>
        );
      },
    },
    {
      key: 'marketplaceStatus',
      header: 'Status',
      render: (l) => (
        <Badge tone={STATUS_TONE[l.marketplaceStatus] as any}>
          {STATUS_LABEL[l.marketplaceStatus]}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Posted',
      render: (l) => <span className="text-sm text-muted">{formatDate(l.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (l) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); setSelectedListing(l); }}
          >
            Review
          </Button>
          {l.marketplaceStatus === 'PENDING_REVIEW' && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await handleApprove(l.id);
                } catch {}
              }}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg hover:bg-brand/90"
            >
              Approve
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Free Agents Marketplace"
        description="Review and moderate task listings posted by organisations"
      />

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total listings" value={stats.total} />
        <StatCard label="Pending review" value={stats.pendingReview} trend={stats.pendingReview > 0 ? 1 : undefined} />
        <StatCard label="Approved" value={stats.approved} />
        <StatCard label="Active (bid accepted)" value={stats.active} />
        <StatCard label="Rejected" value={stats.rejected} />
        <StatCard label="Closed" value={stats.closed} />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1 w-fit">
        {([
          { value: 'PENDING_REVIEW', label: `Pending Review${stats.pendingReview > 0 ? ` (${stats.pendingReview})` : ''}` },
          { value: 'ALL', label: 'All Listings' },
          { value: 'BIDS', label: 'Bids Management' },
          { value: 'FREELANCERS', label: 'Free Agent Applications' },
        ] as Array<{ value: TabFilter; label: string }>).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.value
                ? 'bg-brand text-brand-fg shadow-sm'
                : 'text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (only on ALL tab) */}
      {tab === 'ALL' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <Input
              placeholder="Search listings, orgs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none dark:bg-surface-2"
          >
            <option value="ALL">All statuses</option>
            {(Object.keys(STATUS_LABEL) as MarketplaceStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <span className="ml-auto text-sm text-muted">{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Table or Bids Management or Freelancers */}
      {tab === 'FREELANCERS' ? (
        <FreelancerReviewTab />
      ) : tab === 'BIDS' ? (
        <AllBidsView listings={listings} />
      ) : (
        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted">Loading listings…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
                  <svg className="h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <p className="font-semibold text-fg">
                  {tab === 'PENDING_REVIEW' ? 'No listings pending review' : 'No listings found'}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {tab === 'PENDING_REVIEW'
                    ? 'All caught up! New listings from organisations will appear here.'
                    : 'Try adjusting your search or filters.'}
                </p>
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                getRowId={(r) => r.id}
                onRowClick={(l) => setSelectedListing(l)}
              />
            )}
          </CardBody>
        </Card>
      )}

      {/* Detail flyout */}
      <ListingDetail
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
        onApprove={handleApprove}
        onReject={(l) => {
          setRejectTarget(l);
          setSelectedListing(null);
        }}
      />

      {/* Reject drawer */}
      <RejectDrawer
        listing={rejectTarget}
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-xl ${
            toast.tone === 'success' ? 'bg-success' : 'bg-danger'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
