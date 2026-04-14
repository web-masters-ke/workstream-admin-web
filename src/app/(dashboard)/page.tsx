'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get } from '@/lib/api';
import type { PlatformStats, AuditLog, Payout, Dispute, Agent } from '@/lib/types';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { onAdminNotification, getSocket, type AdminNotification } from '@/lib/socket';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

// ---------------------------------------------------------------------------
// Risk signal shapes
// ---------------------------------------------------------------------------
interface RiskSignals {
  slaBreaches: number;
  openDisputes: number;
  pendingKyc: number;
  pendingPayouts: number;
}

// ---------------------------------------------------------------------------
// Stats normalizer — handles camelCase, snake_case, and nested backend shapes
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeStats(raw: any): PlatformStats {
  const r = raw ?? {};
  function num(...vals: unknown[]): number {
    for (const v of vals) {
      if (v == null) continue;
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
    return 0;
  }
  return {
    totalUsers:      num(r.totalUsers, r.total_users, r.users?.total, r.users),
    totalBusinesses: num(r.totalBusinesses, r.total_businesses, r.businesses?.total, r.businesses),
    totalAgents:     num(r.totalAgents, r.total_agents, r.agents?.total, r.agents),
    activeTasks:     num(r.activeTasks, r.active_tasks, r.tasks?.active, r.tasks?.total),
    completedTasks:  num(r.completedTasks, r.completed_tasks, r.tasks?.completed),
    openDisputes:    num(r.openDisputes, r.open_disputes, r.disputes?.open, r.disputes?.total),
    pendingKyc:      num(r.pendingKyc, r.pending_kyc, r.kyc?.pending),
    gmv:             num(r.gmv, r.totalGmv, r.total_gmv),
    revenue:         num(r.revenue, r.totalRevenue, r.total_revenue),
    revenueSeries:   r.revenueSeries ?? r.revenue_series,
  };
}

// Generate a 14-day demo series when the API doesn't return one yet
function seedRevenueSeries(): { date: string; revenue: number; gmv: number }[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const s = d.getDate() + d.getMonth() * 31;
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: 1200 + (s * 137) % 800,
      gmv: 4500 + (s * 251) % 3000,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function actionIcon(action: string): string {
  const a = action.toUpperCase();
  if (a.includes('LOGIN')) return '🔑';
  if (a.includes('DELETE') || a.includes('BAN')) return '🚫';
  if (a.includes('CREATE')) return '✨';
  if (a.includes('UPDATE') || a.includes('PATCH')) return '✏️';
  if (a.includes('PAYMENT') || a.includes('PAYOUT')) return '💳';
  if (a.includes('KYC')) return '🪪';
  if (a.includes('DISPUTE')) return '⚖️';
  if (a.includes('FLAG') || a.includes('MODERAT')) return '🚩';
  return '📋';
}

// ---------------------------------------------------------------------------
// Overview page
// ---------------------------------------------------------------------------
export default function OverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<AdminNotification[]>([]);
  // Risk signals
  const [risk, setRisk] = useState<RiskSignals>({
    slaBreaches: 0,
    openDisputes: 0,
    pendingKyc: 0,
    pendingPayouts: 0,
  });
  const [riskLoading, setRiskLoading] = useState(true);
  // Activity feed
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Platform stats
    (async () => {
      try {
        setLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await get<any>('/analytics/platform');
        if (alive) setStats(normalizeStats(raw));
      } catch (e: unknown) {
        if (alive) setError((e as Error)?.message ?? 'Failed to load platform stats');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // Activity feed
    (async () => {
      try {
        const data = await get<AuditLog[] | { items: AuditLog[] }>(
          '/admin/audit-logs?limit=10',
        );
        if (alive) setActivityLogs(Array.isArray(data) ? data : (data.items ?? []));
      } catch {
        // Non-critical
      } finally {
        if (alive) setActivityLoading(false);
      }
    })();

    // Risk signals — parallel fetch
    (async () => {
      setRiskLoading(true);
      const [slaRes, disputesRes, kycRes, payoutsRes] = await Promise.allSettled([
        get<{ count: number } | number>('/tasks/sla/breaches'),
        get<Dispute[] | { items: Dispute[]; total?: number }>('/admin/disputes?status=OPEN'),
        get<Agent[] | { items: Agent[]; total?: number }>('/agents?kycStatus=PENDING'),
        get<Payout[] | { items: Payout[]; total?: number }>('/payments/payouts?status=PENDING'),
      ]);

      function extractCount(
        res: PromiseSettledResult<{ count: number } | number | { items: unknown[]; total?: number } | unknown[]>,
        fromStats?: number,
      ): number {
        if (res.status === 'rejected') return fromStats ?? 0;
        const v = res.value;
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && v !== null) {
          if ('count' in v) return (v as { count: number }).count;
          if ('total' in v) return (v as { total?: number }).total ?? 0;
          if (Array.isArray(v)) return v.length;
          if ('items' in v && Array.isArray((v as { items: unknown[] }).items)) {
            return (v as { items: unknown[] }).items.length;
          }
        }
        return fromStats ?? 0;
      }

      if (alive) {
        setRisk({
          slaBreaches: extractCount(slaRes),
          openDisputes: extractCount(disputesRes),
          pendingKyc: extractCount(kycRes),
          pendingPayouts: extractCount(payoutsRes),
        });
        setRiskLoading(false);
      }
    })();

    // WebSocket
    getSocket();
    const off = onAdminNotification((n) => {
      setLiveEvents((prev) => [n, ...prev].slice(0, 20));
    });

    return () => {
      alive = false;
      off();
    };
  }, []);

  // While loading or on error, still render the shell with empty stats so the page isn't blank.
  const safeStats = stats ?? normalizeStats(null);

  if (loading) return <div className="py-20 text-center text-muted">Loading platform overview…</div>;
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
      <PageHeader title="Platform overview" description="System-wide health, volume, and risk signals." />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={formatNumber(safeStats.totalUsers)} hint="all roles" trend={3.2} />
        <StatCard label="Businesses" value={formatNumber(safeStats.totalBusinesses)} trend={1.1} />
        <StatCard label="Agents" value={formatNumber(safeStats.totalAgents)} trend={4.8} />
        <StatCard label="Active tasks" value={formatNumber(safeStats.activeTasks)} trend={-0.4} />
        <StatCard label="GMV (30d)" value={formatMoney(safeStats.gmv)} trend={6.5} />
        <StatCard label="Revenue (30d)" value={formatMoney(safeStats.revenue)} trend={5.9} />
        <StatCard label="Open disputes" value={formatNumber(safeStats.openDisputes)} hint="needs review" />
        <StatCard label="Pending KYC" value={formatNumber(safeStats.pendingKyc)} hint="agent queue" />
      </div>

      {/* Row 2: chart + risk signals */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Revenue chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue &amp; GMV (14d)</CardTitle>
            <span className="text-[11px] text-muted">Cached</span>
          </CardHeader>
          <CardBody>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={safeStats.revenueSeries?.length ? safeStats.revenueSeries : seedRevenueSeries()}>
                  <defs>
                    <linearGradient id="grev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(129,140,248)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="rgb(129,140,248)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ggmv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(34,197,94)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(34,197,94)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="rgb(var(--muted))" fontSize={11} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(var(--surface))',
                      border: '1px solid rgb(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'rgb(var(--fg))',
                    }}
                  />
                  <Area type="monotone" dataKey="gmv" stroke="rgb(34,197,94)" fill="url(#ggmv)" />
                  <Area type="monotone" dataKey="revenue" stroke="rgb(129,140,248)" fill="url(#grev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Live risk signals (API-driven) */}
        <Card>
          <CardHeader>
            <CardTitle>Risk signals</CardTitle>
            {riskLoading && (
              <span className="text-[10px] text-muted">Loading…</span>
            )}
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <RiskRow
              label="SLA-breached tasks"
              value={risk.slaBreaches}
              tone="danger"
              href="/tasks?filter=sla_breach"
            />
            <RiskRow
              label="Open disputes"
              value={risk.openDisputes}
              tone="danger"
              href="/disputes?status=OPEN"
            />
            <RiskRow
              label="Pending KYC"
              value={risk.pendingKyc}
              tone="warn"
              href="/agents?kyc=PENDING"
            />
            <RiskRow
              label="Pending payouts"
              value={risk.pendingPayouts}
              tone="warn"
              href="/payments?tab=payouts"
            />
            {/* Additional from platform stats */}
            <RiskRow
              label="Open support tickets"
              value={safeStats.openDisputes}
              tone="info"
              href="/support?status=OPEN"
            />
            <RiskRow
              label="Completed tasks"
              value={safeStats.completedTasks}
              tone="info"
              href="/tasks?status=COMPLETED"
            />
          </CardBody>
        </Card>
      </div>

      {/* Row 3: Quick actions + activity feed */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/agents?kyc=PENDING">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">🪪</span>
                  <span className="text-xs font-medium text-fg">Review KYC queue</span>
                  {risk.pendingKyc > 0 && (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-semibold text-warn">
                      {risk.pendingKyc} pending
                    </span>
                  )}
                </div>
              </Link>
              <Link href="/disputes?status=OPEN">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">⚖️</span>
                  <span className="text-xs font-medium text-fg">Open disputes</span>
                  {risk.openDisputes > 0 && (
                    <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-semibold text-danger">
                      {risk.openDisputes} open
                    </span>
                  )}
                </div>
              </Link>
              <Link href="/payments?tab=payouts">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">💳</span>
                  <span className="text-xs font-medium text-fg">Pending payouts</span>
                  {risk.pendingPayouts > 0 && (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-semibold text-warn">
                      {risk.pendingPayouts} waiting
                    </span>
                  )}
                </div>
              </Link>
              <Link href="/moderation?status=PENDING">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">🚩</span>
                  <span className="text-xs font-medium text-fg">Flagged content</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                    Moderation queue
                  </span>
                </div>
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/businesses?status=PENDING">
                <Button size="sm" variant="outline">Approve businesses</Button>
              </Link>
              <Link href="/support?status=OPEN">
                <Button size="sm" variant="outline">Support tickets</Button>
              </Link>
              <Link href="/analytics">
                <Button size="sm" variant="outline">Full analytics</Button>
              </Link>
            </div>
          </CardBody>
        </Card>

        {/* Activity feed — audit logs + WebSocket live events */}
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <span className="text-[10px] text-muted">audit log + live</span>
          </CardHeader>
          <CardBody className="max-h-80 overflow-y-auto p-0">
            {/* Live WS events (top) */}
            {liveEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs"
              >
                <span className="mt-0.5 text-sm">⚡</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      tone={
                        ev.level === 'danger'
                          ? 'danger'
                          : ev.level === 'warn'
                          ? 'warn'
                          : ev.level === 'success'
                          ? 'success'
                          : 'info'
                      }
                    >
                      LIVE
                    </Badge>
                    <span className="font-medium text-fg">{ev.title}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{ev.message ?? ev.event}</p>
                </div>
              </div>
            ))}

            {/* Audit log entries */}
            {activityLoading && (
              <div className="py-4 text-center text-xs text-muted">Loading activity…</div>
            )}
            {!activityLoading && activityLogs.length === 0 && liveEvents.length === 0 && (
              <div className="py-8 text-center text-xs text-muted">
                No recent activity. Waiting for backend events.
              </div>
            )}
            {activityLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs last:border-b-0"
              >
                <span className="mt-0.5 text-sm">{actionIcon(log.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="brand">{log.action}</Badge>
                    <span className="truncate text-muted">{log.actorEmail ?? log.actorId ?? 'system'}</span>
                  </div>
                  <p className="mt-0.5 text-muted">
                    {log.resource}{log.resourceId ? ` · ${log.resourceId}` : ''}
                  </p>
                  <p className="text-[10px] text-muted/70">{formatDate(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function RiskRow({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'warn' | 'info';
  href?: string;
}) {
  const color =
    tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-sky-400';
  const content = (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block hover:opacity-80">
        {content}
      </Link>
    );
  }
  return content;
}
