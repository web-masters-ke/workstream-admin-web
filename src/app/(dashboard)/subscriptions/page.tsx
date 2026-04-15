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
import { get, patch, post, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadCsv } from '@/lib/export';
import type { Business } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubscriptionPlanTier = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CHURNED';

interface PlanDef {
  id: string;
  name: string;
  description: string;
  price: number;
  priceCents: number;
  currency: string;
  features: string[];
  isActive: boolean;
  createdAt: string;
}

// Keep old alias for page-local use
type SubscriptionPlan = SubscriptionPlanTier;

interface SubscribedBusiness extends Business {
  plan?: SubscriptionPlan | 'TRIAL';
  mrr?: number;
  renewalDate?: string;
  subscriptionStatus?: SubscriptionStatus;
  memberCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planTone(plan?: string): 'neutral' | 'info' | 'success' | 'brand' {
  if (plan === 'GROWTH') return 'info';
  if (plan === 'ENTERPRISE') return 'brand';
  if (plan === 'TRIAL') return 'success';
  return 'neutral'; // STARTER / undefined
}

function subStatusTone(status?: string): 'success' | 'danger' | 'warn' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'CHURNED') return 'danger';
  if (status === 'SUSPENDED') return 'danger';
  if (status === 'TRIAL') return 'warn';
  return 'neutral';
}

const PLAN_MRR: Record<string, number> = {
  STARTER: 2500,
  GROWTH: 8500,
  ENTERPRISE: 25000,
  TRIAL: 0,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [businesses, setBusinesses] = useState<SubscribedBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [statusTab, setStatusTab] = useState<'ALL' | SubscriptionStatus>('ALL');
  const [planFilter, setPlanFilter] = useState<'' | SubscriptionPlan | 'TRIAL'>('');
  const [q, setQ] = useState('');

  // Plan definitions (from backend)
  const [planDefs, setPlanDefs] = useState<PlanDef[]>([]);
  const [showPlans, setShowPlans] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', description: '', priceCents: 0, currency: 'KES', features: '' });
  const [newPlanBusy, setNewPlanBusy] = useState(false);
  const [newPlanErr, setNewPlanErr] = useState<string | null>(null);

  // Change plan drawer
  const [editing, setEditing] = useState<SubscribedBusiness | null>(null);
  const [planForm, setPlanForm] = useState<{
    plan: SubscriptionPlan | 'TRIAL';
    subscriptionStatus: SubscriptionStatus;
    notes: string;
  }>({ plan: 'STARTER', subscriptionStatus: 'ACTIVE', notes: '' });
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Load ──
  function load() {
    setLoading(true);
    setError(null);
    get<SubscribedBusiness[] | { items: SubscribedBusiness[] }>('/businesses?limit=100')
      .then((raw) => {
        setBusinesses(Array.isArray(raw) ? raw : (raw as { items: SubscribedBusiness[] }).items ?? []);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    get<PlanDef[]>('/admin/subscription-plans').then(setPlanDefs).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived stats ──
  const totalBusinesses = businesses.length;

  const activeCount = useMemo(
    () => businesses.filter((b) => (b.subscriptionStatus ?? 'ACTIVE') === 'ACTIVE').length,
    [businesses],
  );

  const trialCount = useMemo(
    () => businesses.filter((b) => b.subscriptionStatus === 'TRIAL' || b.plan === 'TRIAL').length,
    [businesses],
  );

  const mrr = useMemo(
    () =>
      businesses
        .filter((b) => (b.subscriptionStatus ?? 'ACTIVE') === 'ACTIVE')
        .reduce((a, b) => a + (b.mrr ?? PLAN_MRR[b.plan ?? 'STARTER'] ?? 0), 0),
    [businesses],
  );

  // ── Filtered rows ──
  const filtered = useMemo(() => {
    return businesses.filter((b) => {
      const effectiveStatus = b.subscriptionStatus ?? 'ACTIVE';
      if (statusTab !== 'ALL' && effectiveStatus !== statusTab) return false;
      if (planFilter && b.plan !== planFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        return b.name.toLowerCase().includes(s) || b.email.toLowerCase().includes(s);
      }
      return true;
    });
  }, [businesses, statusTab, planFilter, q]);

  // ── Open edit drawer ──
  function openEdit(biz: SubscribedBusiness) {
    setEditing(biz);
    setPlanForm({
      plan: (biz.plan as SubscriptionPlan | 'TRIAL') ?? 'STARTER',
      subscriptionStatus: biz.subscriptionStatus ?? 'ACTIVE',
      notes: '',
    });
    setSaveErr(null);
  }

  // ── Save plan change ──
  async function savePlan() {
    if (!editing) return;
    setSaveBusy(true);
    setSaveErr(null);
    try {
      await patch(`/businesses/${editing.id}`, {
        plan: planForm.plan,
        subscriptionStatus: planForm.subscriptionStatus,
      });
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === editing.id
            ? { ...b, plan: planForm.plan as SubscribedBusiness['plan'], subscriptionStatus: planForm.subscriptionStatus }
            : b,
        ),
      );
      setEditing(null);
      showToast(`Plan updated for ${editing.name}.`);
    } catch (e) {
      setSaveErr(errorMessage(e));
    } finally {
      setSaveBusy(false);
    }
  }

  // ── Export ──
  function exportCsv() {
    const rows = selectedIds.size > 0 ? businesses.filter((b) => selectedIds.has(b.id)) : filtered;
    downloadCsv('subscriptions.csv', rows, [
      ['Business', 'name'],
      ['Email', 'email'],
      ['Plan', 'plan'],
      ['Status', 'subscriptionStatus'],
      ['MRR (KES)', (b: SubscribedBusiness) => b.mrr ?? PLAN_MRR[b.plan ?? 'STARTER'] ?? 0],
      ['Members', (b: SubscribedBusiness) => b.memberCount ?? b.agentCount ?? 0],
      ['Renewal', 'renewalDate'],
      ['Joined', 'createdAt'],
    ]);
    setSelectedIds(new Set());
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function createPlan() {
    if (!newPlan.name.trim()) { setNewPlanErr('Plan name is required'); return; }
    setNewPlanBusy(true);
    setNewPlanErr(null);
    try {
      const created = await post<PlanDef>('/admin/subscription-plans', {
        name: newPlan.name.trim(),
        description: newPlan.description.trim() || undefined,
        priceCents: Number(newPlan.priceCents) || 0,
        currency: newPlan.currency || 'KES',
        features: newPlan.features ? newPlan.features.split('\n').map((f) => f.trim()).filter(Boolean) : [],
      });
      setPlanDefs((prev) => [...prev, created]);
      setShowNewPlan(false);
      setNewPlan({ name: '', description: '', priceCents: 0, currency: 'KES', features: '' });
      showToast(`Plan "${created.name}" created.`);
    } catch (e) {
      setNewPlanErr(errorMessage(e));
    } finally {
      setNewPlanBusy(false);
    }
  }

  async function togglePlanActive(plan: PlanDef) {
    try {
      const updated = await patch<PlanDef>(`/admin/subscription-plans/${plan.id}`, { isActive: !plan.isActive });
      setPlanDefs((prev) => prev.map((p) => (p.id === plan.id ? updated : p)));
    } catch {}
  }

  // ── Columns ──
  const columns: Column<SubscribedBusiness>[] = [
    {
      key: 'business',
      header: 'Business',
      render: (b) => (
        <div>
          <div className="font-medium text-fg">{b.name}</div>
          <div className="text-xs text-muted">{b.email}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (b) => (
        <Badge tone={planTone(b.plan)}>{b.plan ?? 'STARTER'}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <Badge tone={subStatusTone(b.subscriptionStatus ?? b.status)}>
          {b.subscriptionStatus ?? b.status}
        </Badge>
      ),
    },
    {
      key: 'mrr',
      header: 'MRR',
      render: (b) => (
        <span className="font-medium text-fg">
          {formatMoney(b.mrr ?? PLAN_MRR[b.plan ?? 'STARTER'] ?? 0, 'KES')}
        </span>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      render: (b) => (
        <span className="text-muted">{b.memberCount ?? b.agentCount ?? 0}</span>
      ),
    },
    {
      key: 'renewal',
      header: 'Renewal',
      render: (b) => <span className="text-muted text-xs">{formatDate(b.renewalDate)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); openEdit(b); }}
        >
          Change plan
        </Button>
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
        title="Subscription Management"
        description="Business subscription plans, MRR, and churn overview."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowNewPlan(true)}>+ New Plan</Button>
            <Button variant="outline" onClick={() => setShowPlans((v) => !v)}>
              {showPlans ? 'Hide plans' : `Manage plans (${planDefs.length})`}
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              Export CSV{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Businesses" value={totalBusinesses} />
        <StatCard label="Active Subscriptions" value={activeCount} />
        <StatCard label="Trial" value={trialCount} />
        <StatCard label="MRR" value={formatMoney(mrr, 'KES')} />
      </div>

      {/* Filter tabs + plan filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['ALL', 'ACTIVE', 'TRIAL', 'CHURNED', 'SUSPENDED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusTab === s
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
          >
            <option value="">All plans</option>
            <option value="STARTER">STARTER</option>
            <option value="GROWTH">GROWTH</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
            <option value="TRIAL">TRIAL</option>
          </Select>
          <Input
            placeholder="Search business, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-52"
          />
          <span className="text-xs text-muted">{filtered.length} of {businesses.length}</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-fg">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              Export selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(b) => b.id}
        loading={loading}
        onRowClick={openEdit}
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-brand/40 bg-brand/10 px-5 py-2.5 text-sm text-brand shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Subscription Plan Definitions panel ── */}
      {showPlans && (
        <div className="mb-6 rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
            <h3 className="text-sm font-semibold text-fg">Subscription Plan Tiers</h3>
            <Button size="sm" onClick={() => setShowNewPlan(true)}>+ New Plan</Button>
          </div>
          {planDefs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              No plan tiers defined yet.{' '}
              <button onClick={() => setShowNewPlan(true)} className="text-brand underline">Create one now.</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-0 divide-y divide-border sm:grid-cols-2 lg:grid-cols-3">
              {planDefs.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-fg">{p.name}</span>
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="mb-2 text-sm font-bold text-brand">
                    {formatMoney(p.price, p.currency as 'KES')}<span className="text-xs font-normal text-muted"> / mo</span>
                  </div>
                  {p.description && <p className="mb-2 text-xs text-muted">{p.description}</p>}
                  {p.features.length > 0 && (
                    <ul className="mb-3 space-y-0.5 text-xs text-muted">
                      {p.features.map((f, i) => <li key={i} className="flex items-start gap-1"><span className="text-success">✓</span> {f}</li>)}
                    </ul>
                  )}
                  <button
                    onClick={() => togglePlanActive(p)}
                    className="text-xs text-muted underline hover:text-fg"
                  >
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── New Plan Drawer ── */}
      <Drawer
        open={showNewPlan}
        onClose={() => { setShowNewPlan(false); setNewPlanErr(null); }}
        title="Create Subscription Plan"
        footer={
          <div className="flex gap-2">
            <Button loading={newPlanBusy} onClick={createPlan}>Create plan</Button>
            <Button variant="ghost" onClick={() => { setShowNewPlan(false); setNewPlanErr(null); }}>Cancel</Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          {newPlanErr && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{newPlanErr}</div>
          )}
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Plan name *</label>
            <Input value={newPlan.name} onChange={(e) => setNewPlan((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Starter, Growth, Enterprise" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Description</label>
            <Input value={newPlan.description} onChange={(e) => setNewPlan((f) => ({ ...f, description: e.target.value }))} placeholder="Short description of this plan" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Price (smallest unit)</label>
              <Input type="number" value={newPlan.priceCents} onChange={(e) => setNewPlan((f) => ({ ...f, priceCents: Number(e.target.value) }))} placeholder="299900" />
              <div className="mt-0.5 text-[10px] text-muted">In cents — e.g. 299900 = KES 2,999</div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Currency</label>
              <Select value={newPlan.currency} onChange={(e) => setNewPlan((f) => ({ ...f, currency: e.target.value }))}>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                <option value="NGN">NGN</option>
                <option value="GHS">GHS</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Features (one per line)</label>
            <textarea
              value={newPlan.features}
              onChange={(e) => setNewPlan((f) => ({ ...f, features: e.target.value }))}
              placeholder={"Up to 5 agents\n100 tasks/month\nBasic SLA tracking"}
              className="h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>
      </Drawer>

      {/* ── Change Plan Drawer ── */}
      <Drawer
        open={!!editing}
        onClose={() => { setEditing(null); setSaveErr(null); }}
        title="Change Plan"
        footer={
          <div className="flex gap-2">
            <Button loading={saveBusy} onClick={savePlan}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => { setEditing(null); setSaveErr(null); }}>
              Cancel
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-5 text-sm">
            {saveErr && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {saveErr}
              </div>
            )}

            {/* Business info (read-only) */}
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Business</div>
              <div className="font-semibold text-fg">{editing.name}</div>
              <div className="text-xs text-muted mt-0.5">{editing.email}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={planTone(editing.plan)}>{editing.plan ?? 'STARTER'}</Badge>
                <Badge tone={subStatusTone(editing.subscriptionStatus ?? editing.status)}>
                  {editing.subscriptionStatus ?? editing.status}
                </Badge>
              </div>
            </div>

            {/* Plan selector */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Plan
              </div>
              <div className="flex flex-wrap gap-2">
                {(['STARTER', 'GROWTH', 'ENTERPRISE', 'TRIAL'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlanForm((f) => ({ ...f, plan: p }))}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      planForm.plan === p
                        ? 'border-brand bg-brand text-brand-fg'
                        : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {planForm.plan && planForm.plan !== 'TRIAL' && (
                <div className="mt-1.5 text-xs text-muted">
                  MRR: {formatMoney(PLAN_MRR[planForm.plan] ?? 0, 'KES')} / month
                </div>
              )}
            </div>

            {/* Status selector */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                Subscription Status
              </label>
              <Select
                value={planForm.subscriptionStatus}
                onChange={(e) =>
                  setPlanForm((f) => ({ ...f, subscriptionStatus: e.target.value as SubscriptionStatus }))
                }
                className="w-full"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="TRIAL">TRIAL</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="CHURNED">CHURNED</option>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                Notes (internal)
              </label>
              <textarea
                value={planForm.notes}
                onChange={(e) => setPlanForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Reason for plan change, any context…"
                className="h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>

            {/* Current details */}
            <div className="space-y-2 border-t border-border pt-4">
              <Row label="Current plan"><Badge tone={planTone(editing.plan)}>{editing.plan ?? 'STARTER'}</Badge></Row>
              <Row label="Members">{editing.memberCount ?? editing.agentCount ?? 0}</Row>
              <Row label="Renewal">{formatDate(editing.renewalDate)}</Row>
              <Row label="Joined">{formatDate(editing.createdAt)}</Row>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
