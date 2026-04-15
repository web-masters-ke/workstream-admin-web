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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RiskSignals {
  slaBreaches: number;
  openDisputes: number;
  pendingKyc: number;
  pendingPayouts: number;
}

interface TaskStatusPoint { status: string; count: number; }
interface AgentStatusPoint { name: string; value: number; }
interface BusinessFunnelPoint { stage: string; count: number; }
interface PaymentMethodPoint { method: string; count: number; amount: number; }
interface KycPipelinePoint { status: string; count: number; }
interface RegistrationPoint { date: string; users: number; agents: number; businesses: number; }
interface TopAgent { id: string; name: string; completedTasks: number; rating: number; earnings: number; }
interface TopBusiness { id: string; name: string; taskCount: number; spend: number; status: string; }

// ---------------------------------------------------------------------------
// Stats normalizer
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

// ---------------------------------------------------------------------------
// Seeded demo data (used when API returns nothing / hasn't been built yet)
// ---------------------------------------------------------------------------
function seedRevenueSeries() {
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

function seedTaskStatusData(): TaskStatusPoint[] {
  return [
    { status: 'OPEN', count: 34 },
    { status: 'ASSIGNED', count: 21 },
    { status: 'IN_PROGRESS', count: 47 },
    { status: 'REVIEW', count: 12 },
    { status: 'COMPLETED', count: 189 },
    { status: 'DISPUTED', count: 8 },
    { status: 'CANCELLED', count: 15 },
    { status: 'DRAFT', count: 6 },
  ];
}

function seedAgentStatusData(): AgentStatusPoint[] {
  return [
    { name: 'ONLINE', value: 43 },
    { name: 'BUSY', value: 28 },
    { name: 'OFFLINE', value: 61 },
  ];
}

function seedBusinessFunnelData(): BusinessFunnelPoint[] {
  return [
    { stage: 'Registered', count: 142 },
    { stage: 'Pending review', count: 38 },
    { stage: 'Approved', count: 91 },
    { stage: 'Active (≥1 task)', count: 64 },
  ];
}

function seedPaymentMethodData(): PaymentMethodPoint[] {
  return [
    { method: 'M-Pesa', count: 312, amount: 48_200 },
    { method: 'Stripe', count: 87, amount: 22_100 },
    { method: 'Wallet', count: 145, amount: 18_900 },
    { method: 'Airtel', count: 34, amount: 5_400 },
    { method: 'Bank', count: 19, amount: 9_800 },
  ];
}

function seedKycPipelineData(): KycPipelinePoint[] {
  return [
    { status: 'Not started', count: 29 },
    { status: 'Submitted', count: 14 },
    { status: 'Under review', count: 11 },
    { status: 'Approved', count: 98 },
    { status: 'Rejected', count: 7 },
  ];
}

function seedRegistrationsTrend(): RegistrationPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const s = d.getDate() + d.getMonth() * 31;
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      users: 3 + (s * 13) % 12,
      agents: 1 + (s * 7) % 6,
      businesses: (s * 3) % 4,
    };
  });
}

function seedTopAgents(): TopAgent[] {
  return [
    { id: '1', name: 'Amara Osei', completedTasks: 47, rating: 4.9, earnings: 12_400 },
    { id: '2', name: 'Fatima Nkosi', completedTasks: 41, rating: 4.8, earnings: 10_800 },
    { id: '3', name: 'Kwame Mensah', completedTasks: 38, rating: 4.7, earnings: 9_950 },
    { id: '4', name: 'Nia Adeyemi', completedTasks: 35, rating: 4.9, earnings: 9_200 },
    { id: '5', name: 'Chidi Okafor', completedTasks: 31, rating: 4.6, earnings: 8_400 },
  ];
}

function seedTopBusinesses(): TopBusiness[] {
  return [
    { id: '1', name: 'TechBridge Ltd', taskCount: 63, spend: 28_400, status: 'ACTIVE' },
    { id: '2', name: 'Savanna Works', taskCount: 51, spend: 21_900, status: 'ACTIVE' },
    { id: '3', name: 'AfriLogix Inc', taskCount: 44, spend: 18_600, status: 'ACTIVE' },
    { id: '4', name: 'BuildRight Corp', taskCount: 38, spend: 15_200, status: 'ACTIVE' },
    { id: '5', name: 'NovaPay Fintech', taskCount: 29, spend: 11_800, status: 'PENDING' },
  ];
}

// ---------------------------------------------------------------------------
// Chart colour palettes
// ---------------------------------------------------------------------------
const TASK_COLORS: Record<string, string> = {
  OPEN: '#38bdf8',
  ASSIGNED: '#d97750',
  IN_PROGRESS: '#f59e0b',
  REVIEW: '#a78bfa',
  COMPLETED: '#22c55e',
  DISPUTED: '#ef4444',
  CANCELLED: '#94a3b8',
  DRAFT: '#64748b',
};

const AGENT_COLORS = ['#22c55e', '#f59e0b', '#94a3b8'];
const PAYMENT_COLORS = ['#22c55e', '#38bdf8', '#d97750', '#f59e0b', '#a78bfa'];
const KYC_COLORS = ['#64748b', '#38bdf8', '#f59e0b', '#22c55e', '#ef4444'];

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg text-xs text-fg">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' && p.value > 999 ? formatMoney(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview page
// ---------------------------------------------------------------------------
export default function OverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<AdminNotification[]>([]);

  // Risk signals
  const [risk, setRisk] = useState<RiskSignals>({ slaBreaches: 0, openDisputes: 0, pendingKyc: 0, pendingPayouts: 0 });
  const [riskLoading, setRiskLoading] = useState(true);

  // Activity feed
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Diagnostic charts
  const [taskStatusData, setTaskStatusData] = useState<TaskStatusPoint[]>(seedTaskStatusData());
  const [agentStatusData, setAgentStatusData] = useState<AgentStatusPoint[]>(seedAgentStatusData());
  const [businessFunnelData, setBusinessFunnelData] = useState<BusinessFunnelPoint[]>(seedBusinessFunnelData());
  const [paymentMethodData, setPaymentMethodData] = useState<PaymentMethodPoint[]>(seedPaymentMethodData());
  const [kycPipelineData, setKycPipelineData] = useState<KycPipelinePoint[]>(seedKycPipelineData());
  const [registrationsTrend, setRegistrationsTrend] = useState<RegistrationPoint[]>(seedRegistrationsTrend());
  const [topAgents, setTopAgents] = useState<TopAgent[]>(seedTopAgents());
  const [topBusinesses, setTopBusinesses] = useState<TopBusiness[]>(seedTopBusinesses());

  useEffect(() => {
    let alive = true;

    // Platform stats
    (async () => {
      try {
        setLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await get<any>('/analytics/platform');
        if (!alive) return;
        setStats(normalizeStats(raw));
        // Try to pull chart data from the analytics payload if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = raw as any;
        if (r?.tasksByStatus?.length) setTaskStatusData(r.tasksByStatus);
        if (r?.agentsByStatus?.length) setAgentStatusData(r.agentsByStatus);
        if (r?.businessFunnel?.length) setBusinessFunnelData(r.businessFunnel);
        if (r?.paymentMethods?.length) setPaymentMethodData(r.paymentMethods);
        if (r?.kycPipeline?.length) setKycPipelineData(r.kycPipeline);
        if (r?.registrationsTrend?.length) setRegistrationsTrend(r.registrationsTrend);
        if (r?.topAgents?.length) setTopAgents(r.topAgents);
        if (r?.topBusinesses?.length) setTopBusinesses(r.topBusinesses);
      } catch (e: unknown) {
        if (alive) setError((e as Error)?.message ?? 'Failed to load platform stats');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // Activity feed
    (async () => {
      try {
        const data = await get<AuditLog[] | { items: AuditLog[] }>('/admin/audit-logs?limit=10');
        if (alive) setActivityLogs(Array.isArray(data) ? data : (data.items ?? []));
      } catch { /* non-critical */ } finally {
        if (alive) setActivityLoading(false);
      }
    })();

    // Risk signals — parallel
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

  const safeStats = stats ?? normalizeStats(null);

  if (loading) return <div className="py-20 text-center text-muted">Loading platform overview…</div>;
  if (error)
    return (
      <div className="py-20 text-center">
        <p className="text-danger">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">
          Retry
        </button>
      </div>
    );

  const revSeries = safeStats.revenueSeries?.length ? safeStats.revenueSeries : seedRevenueSeries();

  return (
    <>
      <PageHeader title="Platform overview" description="System-wide health, volume, and risk signals." />

      {/* ── Row 1: KPI cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
        <StatCard label="Total users"    value={formatNumber(safeStats.totalUsers)}      hint="all roles"     trend={3.2} />
        <StatCard label="Businesses"     value={formatNumber(safeStats.totalBusinesses)} trend={1.1} />
        <StatCard label="Agents"         value={formatNumber(safeStats.totalAgents)}     trend={4.8} />
        <StatCard label="Active tasks"   value={formatNumber(safeStats.activeTasks)}     trend={-0.4} />
        <StatCard label="GMV (30d)"      value={formatMoney(safeStats.gmv)}              trend={6.5} />
        <StatCard label="Revenue (30d)"  value={formatMoney(safeStats.revenue)}          trend={5.9} />
        <StatCard label="Open disputes"  value={formatNumber(safeStats.openDisputes)}    hint="needs review" />
        <StatCard label="Pending KYC"    value={formatNumber(safeStats.pendingKyc)}      hint="agent queue" />
      </div>

      {/* ── Row 2: Revenue chart + risk signals ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue &amp; GMV (14d)</CardTitle>
            <span className="text-[11px] text-muted">platform earnings</span>
          </CardHeader>
          <CardBody>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revSeries}>
                  <defs>
                    <linearGradient id="grev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d97750" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#d97750" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ggmv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(128,128,128,0.15)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="gmv"     name="GMV"     stroke="#22c55e" fill="url(#ggmv)" strokeWidth={2} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#d97750" fill="url(#grev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk signals</CardTitle>
            {riskLoading && <span className="text-[10px] text-muted">Loading…</span>}
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <RiskRow label="SLA-breached tasks"  value={risk.slaBreaches}   tone="danger" href="/tasks?filter=sla_breach" />
            <RiskRow label="Open disputes"        value={risk.openDisputes}  tone="danger" href="/disputes?status=OPEN" />
            <RiskRow label="Pending KYC"          value={risk.pendingKyc}    tone="warn"   href="/agents?kyc=PENDING" />
            <RiskRow label="Pending payouts"      value={risk.pendingPayouts} tone="warn"  href="/payments?tab=payouts" />
            <RiskRow label="Completed tasks (all)" value={safeStats.completedTasks} tone="info" href="/tasks?status=COMPLETED" />
          </CardBody>
        </Card>
      </div>

      {/* ── Row 3: Task status + Agent availability + Business funnel ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Task status distribution */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Task status breakdown</CardTitle>
            <span className="text-[11px] text-muted">all time</span>
          </CardHeader>
          <CardBody>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskStatusData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.15)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="status" tick={{ fontSize: 10 }} width={76} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]}>
                    {taskStatusData.map((entry) => (
                      <Cell key={entry.status} fill={TASK_COLORS[entry.status] ?? '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Agent availability donut */}
        <Card>
          <CardHeader>
            <CardTitle>Agent availability</CardTitle>
            <span className="text-[11px] text-muted">live status</span>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={agentStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius="52%"
                    outerRadius="76%"
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {agentStatusData.map((_, i) => (
                      <Cell key={i} fill={AGENT_COLORS[i % AGENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex gap-4 text-xs">
              {agentStatusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: AGENT_COLORS[i % AGENT_COLORS.length] }} />
                  <span className="text-muted">{d.name}</span>
                  <span className="font-semibold text-fg">{d.value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Business onboarding funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Business onboarding funnel</CardTitle>
            <span className="text-[11px] text-muted">conversion pipeline</span>
          </CardHeader>
          <CardBody>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={businessFunnelData} margin={{ left: 0, right: 8, top: 4, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.15)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Businesses" fill="#d97750" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Row 4: Payment methods + KYC pipeline + Dispute status ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Payment method distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Payment methods</CardTitle>
            <span className="text-[11px] text-muted">by transaction count</span>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="method"
                    label={({ method, percent }) => `${method} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {paymentMethodData.map((_, i) => (
                      <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 w-full text-[10px]">
              {paymentMethodData.map((d, i) => (
                <div key={d.method} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }} />
                  <span className="text-muted truncate">{d.method}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* KYC pipeline */}
        <Card>
          <CardHeader>
            <CardTitle>KYC pipeline</CardTitle>
            <span className="text-[11px] text-muted">agent verification stages</span>
          </CardHeader>
          <CardBody>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kycPipelineData} margin={{ left: 0, right: 8, top: 4, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.15)" />
                  <XAxis dataKey="status" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Agents" radius={[4, 4, 0, 0]}>
                    {kycPipelineData.map((_, i) => (
                      <Cell key={i} fill={KYC_COLORS[i % KYC_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Dispute status donut */}
        <Card>
          <CardHeader>
            <CardTitle>Dispute resolution</CardTitle>
            <span className="text-[11px] text-muted">all time status</span>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            {(() => {
              const disputeData = [
                { name: 'RESOLVED', value: 78, color: '#22c55e' },
                { name: 'CLOSED', value: 31, color: '#94a3b8' },
                { name: 'OPEN', value: risk.openDisputes || 12, color: '#ef4444' },
                { name: 'ESCALATED', value: 9, color: '#f59e0b' },
                { name: 'UNDER_REVIEW', value: 14, color: '#38bdf8' },
              ];
              return (
                <>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={disputeData}
                          cx="50%"
                          cy="50%"
                          innerRadius="45%"
                          outerRadius="72%"
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {disputeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 w-full text-[10px]">
                    {disputeData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-muted truncate">{d.name}</span>
                        <span className="ml-auto font-semibold text-fg">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </CardBody>
        </Card>
      </div>

      {/* ── Row 5: 30-day new registrations trend ── */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>New registrations (30d)</CardTitle>
            <span className="text-[11px] text-muted">users · agents · businesses</span>
          </CardHeader>
          <CardBody>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={registrationsTrend} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="users"      name="Users"      stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="agents"     name="Agents"     stroke="#d97750" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="businesses" name="Businesses" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Row 6: Top agents + Top businesses ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top agents</CardTitle>
            <Link href="/agents" className="text-[11px] text-brand hover:underline">View all</Link>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2 text-right">Rating</th>
                  <th className="px-4 py-2 text-right">Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topAgents.map((a, i) => (
                  <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                          {i + 1}
                        </span>
                        <span className="font-medium text-fg">{a.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">{a.completedTasks}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-warn font-semibold">★ {a.rating}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-fg">{formatMoney(a.earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top businesses</CardTitle>
            <Link href="/businesses" className="text-[11px] text-brand hover:underline">View all</Link>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Business</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2 text-right">Spend</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topBusinesses.map((b, i) => (
                  <tr key={b.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-[10px] font-bold text-success">
                          {i + 1}
                        </span>
                        <span className="font-medium text-fg">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">{b.taskCount}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-fg">{formatMoney(b.spend)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={b.status === 'ACTIVE' ? 'success' : b.status === 'PENDING' ? 'warn' : 'neutral'}>
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      {/* ── Row 7: Quick actions + Activity feed ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-semibold text-warn">{risk.pendingKyc} pending</span>
                  )}
                </div>
              </Link>
              <Link href="/disputes?status=OPEN">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">⚖️</span>
                  <span className="text-xs font-medium text-fg">Open disputes</span>
                  {risk.openDisputes > 0 && (
                    <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-semibold text-danger">{risk.openDisputes} open</span>
                  )}
                </div>
              </Link>
              <Link href="/payments?tab=payouts">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">💳</span>
                  <span className="text-xs font-medium text-fg">Pending payouts</span>
                  {risk.pendingPayouts > 0 && (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-semibold text-warn">{risk.pendingPayouts} waiting</span>
                  )}
                </div>
              </Link>
              <Link href="/moderation?status=PENDING">
                <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-4 text-center hover:border-brand/40 hover:bg-brand/5 transition-colors">
                  <span className="text-2xl">🚩</span>
                  <span className="text-xs font-medium text-fg">Flagged content</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">Moderation queue</span>
                </div>
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/businesses?status=PENDING"><Button size="sm" variant="outline">Approve businesses</Button></Link>
              <Link href="/support?status=OPEN"><Button size="sm" variant="outline">Support tickets</Button></Link>
              <Link href="/reports"><Button size="sm" variant="outline">Reports &amp; audit logs</Button></Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <span className="text-[10px] text-muted">audit log + live</span>
          </CardHeader>
          <CardBody className="max-h-80 overflow-y-auto p-0">
            {liveEvents.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs">
                <span className="mt-0.5 text-sm">⚡</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={ev.level === 'danger' ? 'danger' : ev.level === 'warn' ? 'warn' : ev.level === 'success' ? 'success' : 'info'}>
                      LIVE
                    </Badge>
                    <span className="font-medium text-fg">{ev.title}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{ev.message ?? ev.event}</p>
                </div>
              </div>
            ))}
            {activityLoading && <div className="py-4 text-center text-xs text-muted">Loading activity…</div>}
            {!activityLoading && activityLogs.length === 0 && liveEvents.length === 0 && (
              <div className="py-8 text-center text-xs text-muted">No recent activity. Waiting for backend events.</div>
            )}
            {activityLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs last:border-b-0">
                <span className="mt-0.5 text-sm">{actionIcon(log.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="brand">{log.action}</Badge>
                    <span className="truncate text-muted">{log.actorEmail ?? log.actorId ?? 'system'}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{log.resource}{log.resourceId ? ` · ${log.resourceId}` : ''}</p>
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

// ---------------------------------------------------------------------------
// RiskRow
// ---------------------------------------------------------------------------
function RiskRow({ label, value, tone, href }: { label: string; value: number; tone: 'danger' | 'warn' | 'info'; href?: string }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-sky-400';
  const content = (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
  if (href) return <Link href={href} className="block hover:opacity-80">{content}</Link>;
  return content;
}
