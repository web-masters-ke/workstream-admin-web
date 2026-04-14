'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { get, errorMessage } from '@/lib/api';
import type { AuditLog } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

// ---------------------------------------------------------------------------
// Severity inference
// ---------------------------------------------------------------------------
type Severity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

const CRITICAL_ACTIONS = ['USER_BANNED', 'ADMIN_DELETED', 'SYSTEM_CONFIG_CHANGED', 'BULK_DELETE', 'ROLE_CHANGED'];
const ERROR_ACTIONS = ['LOGIN_FAILED', 'PAYMENT_FAILED', 'KYC_REJECTED', 'PAYOUT_FAILED', 'VERIFICATION_FAILED'];
const WARN_ACTIONS = ['USER_SUSPENDED', 'BUSINESS_REJECTED', 'TASK_FORCE_CANCELLED', 'FLAG_CONTENT', 'AGENT_SUSPENDED'];

function inferSeverity(action: string): Severity {
  const a = action.toUpperCase();
  if (CRITICAL_ACTIONS.some((x) => a.includes(x))) return 'CRITICAL';
  if (ERROR_ACTIONS.some((x) => a.includes(x))) return 'ERROR';
  if (WARN_ACTIONS.some((x) => a.includes(x))) return 'WARN';
  return 'INFO';
}

function severityBadge(s: Severity) {
  const map: Record<Severity, { cls: string; label: string }> = {
    INFO: { cls: 'bg-surface-2 text-muted border-border', label: 'INFO' },
    WARN: { cls: 'bg-warn/15 text-warn border-warn/30', label: 'WARN' },
    ERROR: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'ERROR' },
    CRITICAL: { cls: 'bg-danger/15 text-danger border-danger/30', label: 'CRITICAL' },
  };
  const { cls, label } = map[s];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

const ENTITY_TYPES = ['User', 'Agent', 'Business', 'Task', 'Payment', 'Dispute', 'System'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filters
  const [q, setQ] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [entityType, setEntityType] = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Detail
  const [selected, setSelected] = useState<AuditLog | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await get<AuditLog[] | { items: AuditLog[] }>('/admin/audit-logs');
        setRows(Array.isArray(data) ? data : (data.items ?? []));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }

  useEffect(() => { load(); }, []);

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);
  const resources = useMemo(() => Array.from(new Set(rows.map((r) => r.resource))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (action && r.action !== action) return false;
      if (resource && r.resource !== resource) return false;
      if (entityType && !r.resource.toLowerCase().includes(entityType.toLowerCase())) return false;
      if (severity && inferSeverity(r.action) !== severity) return false;
      if (actorSearch) {
        const s = actorSearch.toLowerCase();
        if (!(r.actorEmail ?? '').toLowerCase().includes(s) && !(r.actorId ?? '').toLowerCase().includes(s)) return false;
      }
      if (fromDate && new Date(r.createdAt) < new Date(fromDate)) return false;
      if (toDate && new Date(r.createdAt) > new Date(`${toDate}T23:59:59`)) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          r.action.toLowerCase().includes(s) ||
          (r.actorEmail ?? '').toLowerCase().includes(s) ||
          r.resource.toLowerCase().includes(s) ||
          (r.resourceId ?? '').toLowerCase().includes(s) ||
          (r.ipAddress ?? '').includes(s)
        );
      }
      return true;
    });
  }, [rows, q, actorSearch, action, resource, entityType, severity, fromDate, toDate]);

  const cols: Column<AuditLog>[] = [
    { key: 'time', header: 'Time', render: (r) => <span className="text-muted">{formatDate(r.createdAt)}</span> },
    { key: 'severity', header: 'Severity', render: (r) => severityBadge(inferSeverity(r.action)) },
    { key: 'actor', header: 'Actor', render: (r) => <span className="text-fg">{r.actorEmail ?? r.actorId ?? 'system'}</span> },
    { key: 'action', header: 'Action', render: (r) => <Badge tone="brand">{r.action}</Badge> },
    {
      key: 'resource',
      header: 'Resource',
      render: (r) => (
        <span className="text-muted">
          {r.resource}
          {r.resourceId ? ` · ${r.resourceId}` : ''}
        </span>
      ),
    },
    { key: 'ip', header: 'IP', render: (r) => <span className="font-mono text-xs text-muted">{r.ipAddress}</span> },
  ];

  if (loading) return <div className="py-20 text-center text-muted">Loading audit logs…</div>;
  if (error)
    return (
      <div className="py-20 text-center">
        <p className="text-danger">{error}</p>
        <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
      </div>
    );

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Tamper-evident record of every privileged action on the platform."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv('audit-logs.csv', filtered, [
                ['Time', 'createdAt'],
                ['Severity', (r) => inferSeverity((r as AuditLog).action)],
                ['Actor', 'actorEmail'],
                ['Action', 'action'],
                ['Resource', 'resource'],
                ['Resource ID', 'resourceId'],
                ['IP', 'ipAddress'],
                ['User agent', 'userAgent'],
              ] as [string, keyof AuditLog | ((r: AuditLog) => unknown)][])
            }
          >
            Export CSV
          </Button>
        }
      />

      {/* Filter bar — row 1 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search action, resource, IP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-72"
        />
        <Input
          placeholder="Actor email or ID…"
          value={actorSearch}
          onChange={(e) => setActorSearch(e.target.value)}
          className="w-52"
        />
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={resource} onChange={(e) => setResource(e.target.value)}>
          <option value="">All resources</option>
          {resources.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>

      {/* Filter bar — row 2 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
          <option value="">All severities</option>
          {(['INFO', 'WARN', 'ERROR', 'CRITICAL'] as Severity[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
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
        {(q || actorSearch || action || resource || entityType || severity || fromDate || toDate) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQ(''); setActorSearch(''); setAction(''); setResource('');
              setEntityType(''); setSeverity(''); setFromDate(''); setToDate('');
            }}
          >
            Clear filters
          </Button>
        )}
        <div className="ml-auto text-xs text-muted">{filtered.length} of {rows.length}</div>
      </div>

      <DataTable columns={cols} rows={filtered} getRowId={(r) => r.id} onRowClick={setSelected} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Log · ${selected.id}` : ''}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="ID">{selected.id}</Row>
            <Row label="Severity">{severityBadge(inferSeverity(selected.action))}</Row>
            <Row label="Actor">{selected.actorEmail ?? selected.actorId ?? 'system'}</Row>
            <Row label="Action"><Badge tone="brand">{selected.action}</Badge></Row>
            <Row label="Resource">
              {selected.resource}{selected.resourceId ? ` · ${selected.resourceId}` : ''}
            </Row>
            <Row label="IP">{selected.ipAddress}</Row>
            <Row label="User agent">{selected.userAgent}</Row>
            <Row label="Time">{formatDate(selected.createdAt)}</Row>

            {selected.metadata && (
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">
                  Metadata / Diff
                </div>
                <DiffViewer metadata={selected.metadata} />
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

function DiffViewer({ metadata }: { metadata: Record<string, unknown> }) {
  const before = metadata.before as Record<string, unknown> | undefined;
  const after = metadata.after as Record<string, unknown> | undefined;

  if (!before && !after) {
    return (
      <pre className="overflow-auto rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    );
  }

  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).sort();

  return (
    <div className="overflow-auto rounded-md border border-border bg-surface-2 text-xs">
      <table className="min-w-full">
        <thead className="bg-surface-2">
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
  );
}
