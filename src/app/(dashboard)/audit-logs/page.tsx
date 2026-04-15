'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { StatCard } from '@/components/ui/StatCard';
import { get, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

// ── types ──────────────────────────────────────────────────────────────────
type Severity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

// Backend may send userId/userEmail (new) or actorId/actorEmail (legacy)
interface AuditLog {
  id: string;
  userId?: string;
  userEmail?: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown> | string;
  severity?: Severity;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface LogPage {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

// ── severity helpers ───────────────────────────────────────────────────────
const CRITICAL_ACTIONS = ['USER_BANNED', 'ADMIN_DELETED', 'SYSTEM_CONFIG_CHANGED', 'BULK_DELETE', 'ROLE_CHANGED'];
const ERROR_ACTIONS = ['LOGIN_FAILED', 'PAYMENT_FAILED', 'KYC_REJECTED', 'PAYOUT_FAILED', 'VERIFICATION_FAILED'];
const WARN_ACTIONS = ['USER_SUSPENDED', 'BUSINESS_REJECTED', 'TASK_FORCE_CANCELLED', 'FLAG_CONTENT', 'AGENT_SUSPENDED'];

function resolveSeverity(log: AuditLog): Severity {
  if (log.severity) return log.severity;
  const a = log.action.toUpperCase();
  if (CRITICAL_ACTIONS.some((x) => a.includes(x))) return 'CRITICAL';
  if (ERROR_ACTIONS.some((x) => a.includes(x))) return 'ERROR';
  if (WARN_ACTIONS.some((x) => a.includes(x))) return 'WARN';
  return 'INFO';
}

function resolveActor(log: AuditLog): string {
  return log.userEmail ?? log.actorEmail ?? log.userId ?? log.actorId ?? 'system';
}

function resolveDetails(log: AuditLog): Record<string, unknown> | null {
  if (log.details) {
    if (typeof log.details === 'string') {
      try { return JSON.parse(log.details); } catch { return { raw: log.details }; }
    }
    return log.details;
  }
  if (log.metadata) return log.metadata;
  return null;
}

const SEV_CONFIG: Record<Severity, { cls: string; dot: string }> = {
  INFO:     { cls: 'bg-surface-2 text-muted border-border',          dot: 'bg-muted' },
  WARN:     { cls: 'bg-warn/15 text-warn border-warn/30',            dot: 'bg-warn' },
  ERROR:    { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  CRITICAL: { cls: 'bg-danger/15 text-danger border-danger/30',      dot: 'bg-danger animate-pulse' },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const { cls, dot } = SEV_CONFIG[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {severity}
    </span>
  );
}

const PAGE_SIZE = 20;

// ── component ──────────────────────────────────────────────────────────────
export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // detail drawer
  const [selected, setSelected] = useState<AuditLog | null>(null);

  // auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── load ──────────────────────────────────────────────────────────────────
  const buildQuery = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
    if (actionFilter) params.set('action', actionFilter);
    if (userSearch) params.set('userId', userSearch);
    if (fromDate) params.set('from', new Date(fromDate).toISOString());
    if (toDate) params.set('to', new Date(`${toDate}T23:59:59`).toISOString());
    return `/admin/audit-logs?${params.toString()}`;
  }, [actionFilter, userSearch, fromDate, toDate]);

  const load = useCallback(async (p = 1, silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await get<AuditLog[] | LogPage>(buildQuery(p));
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
      } else {
        setRows((data as LogPage).items ?? []);
        setTotal((data as LogPage).total ?? 0);
      }
      setPage(p);
    } catch (e) {
      if (!silent) setError(errorMessage(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(1); }, [load]);

  // auto-refresh timer
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => load(page, true), 30_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, load, page]);

  // ── client-side severity filter (applied on top of server results) ─────────
  const filtered = useMemo(() => {
    if (!severity) return rows;
    return rows.filter((r) => resolveSeverity(r) === severity);
  }, [rows, severity]);

  // ── stats (derived from current page — server would ideally return these) ──
  const today = new Date().toDateString();
  const todayRows = rows.filter((r) => new Date(r.createdAt).toDateString() === today);
  const warnErrorToday = todayRows.filter((r) => ['WARN', 'ERROR'].includes(resolveSeverity(r))).length;
  const criticalCount = rows.filter((r) => resolveSeverity(r) === 'CRITICAL').length;
  const activeUsers = new Set(rows.map((r) => r.userEmail ?? r.actorEmail ?? r.userId ?? r.actorId).filter(Boolean)).size;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── columns ───────────────────────────────────────────────────────────────
  const cols: Column<AuditLog>[] = [
    {
      key: 'severity',
      header: 'Severity',
      render: (r) => <SeverityBadge severity={resolveSeverity(r)} />,
    },
    {
      key: 'actor',
      header: 'User / Email',
      render: (r) => (
        <div>
          <div className="text-fg text-xs font-medium">{resolveActor(r)}</div>
          {(r.userId ?? r.actorId) && (
            <div className="text-[10px] text-muted font-mono truncate max-w-[160px]">
              {r.userId ?? r.actorId}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => <Badge tone="brand">{r.action}</Badge>,
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (r) => (
        <div>
          <span className="text-fg text-xs">{r.resource}</span>
          {r.resourceId && (
            <span className="ml-1 font-mono text-[10px] text-muted">· {r.resourceId}</span>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (r) => {
        const d = resolveDetails(r);
        if (!d) return <span className="text-muted text-xs">—</span>;
        const preview = Object.entries(d).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
        return (
          <span className="text-xs text-muted truncate max-w-[200px] block" title={JSON.stringify(d, null, 2)}>
            {preview || '…'}
          </span>
        );
      },
    },
    {
      key: 'time',
      header: 'Timestamp',
      render: (r) => <span className="text-xs text-muted whitespace-nowrap">{formatDate(r.createdAt)}</span>,
    },
  ];

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCsv = () => {
    downloadCsv('audit-logs.csv', filtered, [
      ['Timestamp', 'createdAt'],
      ['Severity', (r) => resolveSeverity(r as AuditLog)],
      ['User', (r) => resolveActor(r as AuditLog)],
      ['Action', 'action'],
      ['Resource', 'resource'],
      ['Resource ID', 'resourceId'],
      ['Details', (r) => { const d = resolveDetails(r as AuditLog); return d ? JSON.stringify(d) : ''; }],
      ['IP', 'ipAddress'],
    ] as [string, keyof AuditLog | ((r: AuditLog) => unknown)][]);
  };

  const clearFilters = () => {
    setSeverity(''); setActionFilter(''); setUserSearch(''); setFromDate(''); setToDate('');
  };
  const hasFilters = !!(severity || actionFilter || userSearch || fromDate || toDate);

  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => load(1)} className="mt-2 text-sm text-brand-600 underline">Retry</button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Tamper-evident record of every privileged action on the platform."
        actions={
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                autoRefresh
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-border text-muted hover:text-fg'
              }`}
              title="Auto-refresh every 30 seconds"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-success animate-pulse' : 'bg-muted'}`} />
              {autoRefresh ? 'Live' : 'Auto-refresh'}
            </button>
            <Button variant="secondary" onClick={() => load(page)}>Refresh</Button>
            <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Logs today" value={todayRows.length} hint="on this page" />
        <StatCard label="Warn / Error today" value={warnErrorToday} hint="flagged actions" />
        <StatCard
          label="Critical alerts"
          value={criticalCount}
          hint={criticalCount > 0 ? 'requires review' : 'all clear'}
        />
        <StatCard label="Distinct users" value={activeUsers} hint="in current results" />
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity chips */}
          <div className="flex gap-1">
            {(['', 'INFO', 'WARN', 'ERROR', 'CRITICAL'] as (Severity | '')[]).map((s) => (
              <button
                key={s || 'ALL'}
                onClick={() => setSeverity(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  severity === s
                    ? s === ''
                      ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                      : s === 'CRITICAL'
                        ? 'border-danger bg-danger/10 text-danger'
                        : s === 'ERROR'
                          ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                          : s === 'WARN'
                            ? 'border-warn bg-warn/10 text-warn'
                            : 'border-border bg-surface-2 text-fg'
                    : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {s || 'ALL'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search action…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-52"
          />
          <Input
            placeholder="User email or ID…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-56"
          />
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-36"
            title="From date"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-36"
            title="To date"
          />
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
          )}
          <div className="ml-auto text-xs text-muted">
            {filtered.length} shown · {total} total
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={cols}
        rows={filtered}
        getRowId={(r) => r.id}
        loading={loading}
        onRowClick={setSelected}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>Page {page} of {totalPages} · {total} logs</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
              Prev
            </Button>
            {/* page numbers — show window of 5 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => load(p)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    p === page
                      ? 'bg-brand-600 text-white'
                      : 'text-muted hover:bg-surface-2 hover:text-fg'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <Button size="sm" variant="ghost" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Log · ${selected.id}` : ''}
        width="w-[560px]"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            {/* Severity + action header */}
            <div className="flex items-center gap-2">
              <SeverityBadge severity={resolveSeverity(selected)} />
              <Badge tone="brand">{selected.action}</Badge>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 divide-y divide-border overflow-hidden">
              <LogRow label="Log ID"><span className="font-mono text-xs">{selected.id}</span></LogRow>
              <LogRow label="Timestamp">{formatDate(selected.createdAt)}</LogRow>
              <LogRow label="User / Actor">{resolveActor(selected)}</LogRow>
              {(selected.userId ?? selected.actorId) && (
                <LogRow label="User ID">
                  <span className="font-mono text-xs text-muted">{selected.userId ?? selected.actorId}</span>
                </LogRow>
              )}
              <LogRow label="Resource">
                <span>
                  {selected.resource}
                  {selected.resourceId && (
                    <span className="ml-1.5 font-mono text-xs text-muted">· {selected.resourceId}</span>
                  )}
                </span>
              </LogRow>
              {selected.ipAddress && <LogRow label="IP address">
                <span className="font-mono text-xs">{selected.ipAddress}</span>
              </LogRow>}
              {selected.userAgent && <LogRow label="User agent">
                <span className="text-xs text-muted break-all">{selected.userAgent}</span>
              </LogRow>}
            </div>

            {/* Details / metadata */}
            {(() => {
              const d = resolveDetails(selected);
              if (!d) return null;
              const before = d.before as Record<string, unknown> | undefined;
              const after = d.after as Record<string, unknown> | undefined;

              if (before || after) {
                const keys = Array.from(
                  new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
                ).sort();
                return (
                  <div>
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Change diff</div>
                    <div className="overflow-auto rounded-md border border-border bg-surface-2 text-xs">
                      <table className="min-w-full">
                        <thead className="bg-surface-2 border-b border-border">
                          <tr>
                            <th className="px-3 py-2 text-left text-muted">Field</th>
                            <th className="px-3 py-2 text-left text-danger/80">Before</th>
                            <th className="px-3 py-2 text-left text-success">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keys.map((k) => {
                            const b = before?.[k];
                            const a = after?.[k];
                            const changed = JSON.stringify(b) !== JSON.stringify(a);
                            return (
                              <tr key={k} className={`border-t border-border ${changed ? 'bg-warn/5' : ''}`}>
                                <td className="px-3 py-1 font-mono text-muted">{k}</td>
                                <td className="px-3 py-1 text-danger/70">{b != null ? String(b) : '—'}</td>
                                <td className="px-3 py-1 text-success">{a != null ? String(a) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              return (
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Details</div>
                  <pre className="overflow-auto rounded-md border border-border bg-surface-2 p-3 text-xs text-muted leading-relaxed">
                    {JSON.stringify(d, null, 2)}
                  </pre>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>
    </>
  );
}

function LogRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 px-4 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted self-start pt-0.5">{label}</div>
      <div className="text-fg break-words">{children}</div>
    </div>
  );
}
