'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { get, errorMessage } from '@/lib/api';
import { downloadCsv } from '@/lib/export';
import { formatDate, formatMoney } from '@/lib/format';
import type { User, Business, Payment, Agent, Task, PlatformStats } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportTypeId =
  | 'platform-overview'
  | 'agent-performance'
  | 'financial-summary'
  | 'task-analytics'
  | 'business-activity';

type ReportFormat = 'CSV' | 'JSON';
type ReportStatus = 'READY' | 'GENERATING' | 'FAILED';

interface ReportTypeDef {
  id: ReportTypeId;
  title: string;
  description: string;
  category: string;
  icon: string;
}

interface GeneratedReport {
  id: string;
  typeId: ReportTypeId;
  title: string;
  format: ReportFormat;
  dateFrom: string;
  dateTo: string;
  businessFilter: string;
  generatedAt: string;
  status: ReportStatus;
  rowCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedRows: Record<string, unknown>[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORT_TYPES: ReportTypeDef[] = [
  {
    id: 'platform-overview',
    title: 'Platform Overview',
    description: 'Users, agents, tasks, and revenue summary across the entire platform.',
    category: 'Overview',
    icon: '📊',
  },
  {
    id: 'agent-performance',
    title: 'Agent Performance',
    description: 'Agent task counts, ratings, completion rates, and earnings breakdown.',
    category: 'People',
    icon: '🤝',
  },
  {
    id: 'financial-summary',
    title: 'Financial Summary',
    description: 'Payments, invoices, payouts, fees, and net revenue over the period.',
    category: 'Finance',
    icon: '💳',
  },
  {
    id: 'task-analytics',
    title: 'Task Analytics',
    description: 'Task counts by status, SLA adherence, priority breakdown, and durations.',
    category: 'Operations',
    icon: '✅',
  },
  {
    id: 'business-activity',
    title: 'Business Activity',
    description: 'Active businesses, workspace utilisation, task volume, and spend.',
    category: 'Growth',
    icon: '🏢',
  },
];

const CATEGORY_TONE: Record<string, 'neutral' | 'success' | 'warn' | 'info' | 'brand'> = {
  Overview: 'brand',
  People: 'info',
  Finance: 'success',
  Operations: 'warn',
  Growth: 'neutral',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadJson(filename: string, rows: Record<string, unknown>[]) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function inDateRange(iso: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

function safeItems<T>(raw: T[] | { items: T[] } | null | undefined): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : ((raw as { items: T[] }).items ?? []);
}

// ─── Data Fetchers ─────────────────────────────────────────────────────────────

async function fetchPlatformOverview(
  _dateFrom: string,
  _dateTo: string,
  _bizFilter: string,
): Promise<Record<string, unknown>[]> {
  const [stats, users, agents] = await Promise.all([
    get<PlatformStats>('/analytics/overview').catch(() => null),
    get<User[] | { items: User[] }>('/admin/users?limit=1000').catch(() => [] as User[]),
    get<Agent[] | { items: Agent[] }>('/agents?limit=1000').catch(() => [] as Agent[]),
  ]);
  const userArr = safeItems(users);
  const agentArr = safeItems(agents);
  const row: Record<string, unknown> = {
    totalUsers: stats?.totalUsers ?? userArr.length,
    totalAgents: stats?.totalAgents ?? agentArr.length,
    activeTasks: stats?.activeTasks ?? 0,
    completedTasks: stats?.completedTasks ?? 0,
    openDisputes: stats?.openDisputes ?? 0,
    pendingKyc: stats?.pendingKyc ?? 0,
    gmv: stats?.gmv ?? 0,
    revenue: stats?.revenue ?? 0,
    generatedAt: new Date().toISOString(),
  };
  return [row];
}

async function fetchAgentPerformance(
  dateFrom: string,
  dateTo: string,
  _bizFilter: string,
): Promise<Record<string, unknown>[]> {
  const raw = await get<Agent[] | { items: Agent[] }>('/agents?limit=1000').catch(() => [] as Agent[]);
  const agents = safeItems(raw);
  return agents.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone ?? '',
    country: a.country ?? '',
    skills: (a.skills ?? []).join(', '),
    rating: a.rating ?? 0,
    tasksCompleted: a.tasksCompleted ?? 0,
    status: a.status,
    kycStatus: a.kycStatus,
    lastSeenAt: a.lastSeenAt ?? '',
    createdAt: a.createdAt,
  })).filter((a) => inDateRange(a.createdAt as string, dateFrom, dateTo));
}

async function fetchFinancialSummary(
  dateFrom: string,
  dateTo: string,
  _bizFilter: string,
): Promise<Record<string, unknown>[]> {
  const raw = await get<Payment[] | { items: Payment[] }>('/payments?limit=1000').catch(() => [] as Payment[]);
  const payments = safeItems(raw);
  return payments
    .filter((p) => inDateRange(p.createdAt, dateFrom, dateTo))
    .map((p) => ({
      id: p.id,
      type: p.type,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      fee: p.fee ?? 0,
      net: (p.amount ?? 0) - (p.fee ?? 0),
      method: p.method ?? '',
      reference: p.reference ?? '',
      businessId: p.businessId ?? '',
      agentId: p.agentId ?? '',
      createdAt: p.createdAt,
      completedAt: p.completedAt ?? '',
    }));
}

async function fetchTaskAnalytics(
  dateFrom: string,
  dateTo: string,
  bizFilter: string,
): Promise<Record<string, unknown>[]> {
  const url = bizFilter
    ? `/tasks?limit=1000&businessId=${bizFilter}`
    : '/tasks?limit=1000';
  const raw = await get<Task[] | { items: Task[] }>(url).catch(() => [] as Task[]);
  const tasks = safeItems(raw);
  return tasks
    .filter((t) => inDateRange(t.createdAt, dateFrom, dateTo))
    .map((t) => ({
      id: t.id,
      title: t.title,
      businessId: t.businessId,
      businessName: t.businessName ?? '',
      assignedAgentId: t.assignedAgentId ?? '',
      assignedAgentName: t.assignedAgentName ?? '',
      status: t.status,
      priority: t.priority ?? '',
      budget: t.budget ?? 0,
      currency: t.currency ?? '',
      dueAt: t.dueAt ?? '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
}

async function fetchBusinessActivity(
  dateFrom: string,
  dateTo: string,
  bizFilter: string,
): Promise<Record<string, unknown>[]> {
  const url = bizFilter
    ? `/businesses?limit=1000&id=${bizFilter}`
    : '/businesses?limit=1000';
  const raw = await get<Business[] | { items: Business[] }>(url).catch(() => [] as Business[]);
  const businesses = safeItems(raw);
  return businesses
    .filter((b) => inDateRange(b.createdAt, dateFrom, dateTo))
    .map((b) => ({
      id: b.id,
      name: b.name,
      legalName: b.legalName ?? '',
      email: b.email,
      phone: b.phone ?? '',
      country: b.country ?? '',
      industry: b.industry ?? '',
      status: b.status,
      taskCount: b.taskCount ?? 0,
      agentCount: b.agentCount ?? 0,
      verifiedAt: b.verifiedAt ?? '',
      createdAt: b.createdAt,
    }));
}

const FETCHERS: Record<ReportTypeId, (f: string, t: string, b: string) => Promise<Record<string, unknown>[]>> = {
  'platform-overview': fetchPlatformOverview,
  'agent-performance': fetchAgentPerformance,
  'financial-summary': fetchFinancialSummary,
  'task-analytics': fetchTaskAnalytics,
  'business-activity': fetchBusinessActivity,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  // Parameters
  const [selectedType, setSelectedType] = useState<ReportTypeId | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<ReportFormat>('CSV');
  const [bizFilter, setBizFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Businesses for the filter dropdown
  const [businesses, setBusinesses] = useState<Business[]>([]);

  // Session history
  const [history, setHistory] = useState<GeneratedReport[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Load businesses for dropdown
  useEffect(() => {
    get<Business[] | { items: Business[] }>('/businesses?limit=100')
      .then((raw) => setBusinesses(safeItems(raw)))
      .catch(() => {});
  }, []);

  const selectedDef = REPORT_TYPES.find((r) => r.id === selectedType) ?? null;

  // Stats derived from history
  const totalGenerated = history.length;
  const totalReady = history.filter((h) => h.status === 'READY').length;
  const totalFailed = history.filter((h) => h.status === 'FAILED').length;
  const totalRows = useMemo(() => history.filter((h) => h.status === 'READY').reduce((s, h) => s + h.rowCount, 0), [history]);

  const triggerDownload = useCallback(
    (report: GeneratedReport) => {
      const ts = new Date(report.generatedAt).toISOString().slice(0, 10);
      const name = `${report.typeId}-${ts}`;
      if (report.format === 'JSON') {
        downloadJson(name, report.cachedRows);
      } else {
        downloadCsv(name, report.cachedRows);
      }
    },
    [],
  );

  async function generate() {
    if (!selectedType) return;
    setGenerating(true);
    setGenError(null);
    const entry: GeneratedReport = {
      id: `${selectedType}-${Date.now()}`,
      typeId: selectedType,
      title: selectedDef?.title ?? selectedType,
      format,
      dateFrom,
      dateTo,
      businessFilter: bizFilter,
      generatedAt: new Date().toISOString(),
      status: 'GENERATING',
      rowCount: 0,
      cachedRows: [],
    };
    setHistory((prev) => [entry, ...prev]);

    try {
      const rows = await FETCHERS[selectedType](dateFrom, dateTo, bizFilter);

      // Apply optional status filter (for reports that have a `status` field)
      const filtered =
        statusFilter
          ? rows.filter((r) => !r.status || (r.status as string) === statusFilter)
          : rows;

      const ready: GeneratedReport = { ...entry, status: 'READY', rowCount: filtered.length, cachedRows: filtered };
      setHistory((prev) => prev.map((h) => (h.id === entry.id ? ready : h)));

      // Trigger download immediately
      const ts = new Date().toISOString().slice(0, 10);
      const name = `${selectedType}-${ts}`;
      if (format === 'JSON') {
        downloadJson(name, filtered);
      } else {
        downloadCsv(name, filtered);
      }
    } catch (e) {
      setGenError(errorMessage(e));
      setHistory((prev) => prev.map((h) => (h.id === entry.id ? { ...h, status: 'FAILED' } : h)));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports & Exports"
        description="Generate and download platform data reports. Data is fetched live from the API."
      />

      {/* Session stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Generated this session" value={totalGenerated} />
        <StatCard label="Ready" value={totalReady} />
        <StatCard label="Failed" value={totalFailed} />
        <StatCard label="Total rows exported" value={totalRows.toLocaleString()} />
      </div>

      {/* Report type selector */}
      <h3 className="mb-3 text-sm font-semibold text-fg">1. Choose a report type</h3>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.id}
            onClick={() => setSelectedType(rt.id)}
            className={`rounded-lg border p-5 text-left transition-all ${
              selectedType === rt.id
                ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400/40 dark:bg-brand-900/20'
                : 'border-border bg-surface hover:border-brand-400 hover:bg-surface-2'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xl">{rt.icon}</span>
              <Badge tone={CATEGORY_TONE[rt.category] ?? 'neutral'}>{rt.category}</Badge>
            </div>
            <div className="font-semibold text-fg">{rt.title}</div>
            <p className="mt-1 text-xs text-muted">{rt.description}</p>
          </button>
        ))}
      </div>

      {/* Parameters panel — shown only when a type is selected */}
      {selectedType && (
        <>
          <h3 className="mb-3 text-sm font-semibold text-fg">
            2. Configure parameters for <span className="text-brand-600">{selectedDef?.title}</span>
          </h3>
          <div className="mb-6 rounded-lg border border-border bg-surface p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Date range */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                  From date
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                  To date
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {/* Format */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                  Format
                </label>
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ReportFormat)}
                  className="w-full"
                >
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                </Select>
              </div>

              {/* Business filter */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                  Business (optional)
                </label>
                <Select
                  value={bizFilter}
                  onChange={(e) => setBizFilter(e.target.value)}
                  className="w-full"
                >
                  <option value="">All businesses</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Status filter (for task-analytics & financial-summary) */}
              {(selectedType === 'task-analytics' || selectedType === 'financial-summary') && (
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
                    Status filter
                  </label>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full"
                  >
                    {selectedType === 'task-analytics' ? (
                      <>
                        <option value="">All statuses</option>
                        {['DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED', 'DISPUTED'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </>
                    ) : (
                      <>
                        <option value="">All statuses</option>
                        {['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </>
                    )}
                  </Select>
                </div>
              )}
            </div>

            {/* Date range summary */}
            {(dateFrom || dateTo) && (
              <p className="mt-3 text-xs text-muted">
                Filtering data from{' '}
                <span className="text-fg">{dateFrom || 'beginning'}</span>{' '}
                to{' '}
                <span className="text-fg">{dateTo || 'now'}</span>.
              </p>
            )}
            {!dateFrom && !dateTo && (
              <p className="mt-3 text-xs text-muted">
                No date range set — all data will be included.
              </p>
            )}

            {genError && (
              <div className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {genError}
              </div>
            )}

            {/* Generate button */}
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={generate} loading={generating} disabled={generating}>
                Generate {format}
              </Button>
              <button
                onClick={() => { setSelectedType(null); setGenError(null); }}
                className="text-xs text-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Generated reports history */}
      {history.length > 0 && (
        <>
          <h3 className="mb-3 text-sm font-semibold text-fg">Generated reports (this session)</h3>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Report</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Date range</th>
                  <th className="px-4 py-3 text-left">Format</th>
                  <th className="px-4 py-3 text-left">Rows</th>
                  <th className="px-4 py-3 text-left">Generated at</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 font-medium text-fg">{r.title}</td>
                    <td className="px-4 py-3">
                      <Badge tone={CATEGORY_TONE[REPORT_TYPES.find((rt) => rt.id === r.typeId)?.category ?? ''] ?? 'neutral'}>
                        {REPORT_TYPES.find((rt) => rt.id === r.typeId)?.category ?? r.typeId}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.dateFrom || 'All'} → {r.dateTo || 'now'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{r.format}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.status === 'READY' ? r.rowCount.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(r.generatedAt)}</td>
                    <td className="px-4 py-3">
                      {r.status === 'GENERATING' ? (
                        <Badge tone="warn">Generating…</Badge>
                      ) : r.status === 'READY' ? (
                        <Badge tone="success">Ready</Badge>
                      ) : (
                        <Badge tone="danger">Failed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'READY' && (
                        <button
                          onClick={() => triggerDownload(r)}
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          Download {r.format}
                        </button>
                      )}
                      {r.status === 'FAILED' && (
                        <button
                          onClick={() => {
                            setSelectedType(r.typeId);
                            setDateFrom(r.dateFrom);
                            setDateTo(r.dateTo);
                            setFormat(r.format);
                            setBizFilter(r.businessFilter);
                          }}
                          className="text-xs text-muted hover:text-fg"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state for history */}
      {history.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface py-16 text-center">
          <p className="text-sm text-muted">No reports generated yet. Select a report type above to get started.</p>
        </div>
      )}
    </>
  );
}
