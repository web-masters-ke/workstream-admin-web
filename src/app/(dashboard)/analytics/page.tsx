'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, Column } from '@/components/ui/DataTable';
import { get } from '@/lib/api';
import type { AnalyticsBundle } from '@/lib/types';
import { formatMoney, formatNumber } from '@/lib/format';
import { downloadCsv } from '@/lib/export';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

type Tab = 'revenue' | 'retention' | 'funnel' | 'geo' | 'leaderboard';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('revenue');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const d = await get<AnalyticsBundle>('/analytics/platform?period=30d');
        setData(d);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-20 text-center text-muted">Loading analytics…</div>;
  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );
  if (!data) return <div className="py-20 text-center text-muted">No analytics data available.</div>;

  function exportCurrent() {
    if (!data) return;
    // data is non-null below this point
    switch (tab) {
      case 'revenue':
        downloadCsv('revenue.csv', data.revenueSeries);
        break;
      case 'retention':
        downloadCsv('retention.csv', data.cohortRetention);
        break;
      case 'funnel':
        downloadCsv('funnel.csv', data.funnel);
        break;
      case 'geo':
        downloadCsv('geo.csv', data.geoBreakdown);
        break;
      case 'leaderboard':
        downloadCsv('leaderboard.csv', [
          ...data.topBusinesses.map((b) => ({ type: 'business', ...b })),
          ...data.topAgents.map((a) => ({ type: 'agent', ...a })),
        ]);
        break;
    }
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue trends, cohort retention, funnel, geo breakdown, and leaderboards."
        actions={<Button variant="secondary" onClick={exportCurrent}>Export {tab} CSV</Button>}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {(['revenue', 'retention', 'funnel', 'geo', 'leaderboard'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'revenue' && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue, GMV &amp; Fees (30d)</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueSeries}>
                  <defs>
                    <linearGradient id="grev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(129,140,248)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="rgb(129,140,248)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ggmv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(34,197,94)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(34,197,94)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gfees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(250,204,21)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(250,204,21)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="rgb(var(--muted))" fontSize={11} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12, color: 'rgb(var(--fg))' }} />
                  <Area type="monotone" dataKey="gmv" stroke="rgb(34,197,94)" fill="url(#ggmv)" />
                  <Area type="monotone" dataKey="revenue" stroke="rgb(129,140,248)" fill="url(#grev)" />
                  <Area type="monotone" dataKey="fees" stroke="rgb(250,204,21)" fill="url(#gfees)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'retention' && (
        <Card>
          <CardHeader><CardTitle>Cohort retention</CardTitle></CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted">Cohort</th>
                    <th className="px-3 py-2 text-right text-muted">Size</th>
                    <th className="px-3 py-2 text-right text-muted">W1</th>
                    <th className="px-3 py-2 text-right text-muted">W2</th>
                    <th className="px-3 py-2 text-right text-muted">W4</th>
                    <th className="px-3 py-2 text-right text-muted">W8</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohortRetention.map((c) => (
                    <tr key={c.cohort} className="border-t border-border">
                      <td className="px-3 py-2 text-fg">{c.cohort}</td>
                      <td className="px-3 py-2 text-right text-fg">{formatNumber(c.size)}</td>
                      {[c.w1, c.w2, c.w4, c.w8].map((v, i) => {
                        const pct = c.size > 0 ? Math.round((v / c.size) * 100) : 0;
                        const bg = pct > 60 ? 'bg-success/20' : pct > 30 ? 'bg-warn/20' : 'bg-danger/20';
                        return (
                          <td key={i} className={`px-3 py-2 text-right text-fg ${bg}`}>
                            {pct}% <span className="text-muted">({v})</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'funnel' && (
        <Card>
          <CardHeader><CardTitle>Signup → First payout funnel</CardTitle></CardHeader>
          <CardBody>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.funnel} layout="vertical">
                  <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="rgb(var(--muted))" fontSize={11} />
                  <YAxis dataKey="step" type="category" stroke="rgb(var(--muted))" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12, color: 'rgb(var(--fg))' }} />
                  <Bar dataKey="users" fill="rgb(129,140,248)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-xs text-muted">
              {data.funnel.length >= 2 && (() => {
                const first = data.funnel[0].users;
                const last = data.funnel[data.funnel.length - 1].users;
                return `Overall conversion: ${first > 0 ? ((last / first) * 100).toFixed(1) : 0}%`;
              })()}
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'geo' && (
        <Card>
          <CardHeader><CardTitle>Geographic breakdown</CardTitle></CardHeader>
          <CardBody>
            <DataTable
              columns={geoCols}
              rows={data.geoBreakdown}
              getRowId={(r) => r.country}
            />
          </CardBody>
        </Card>
      )}

      {tab === 'leaderboard' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Top businesses</CardTitle></CardHeader>
            <CardBody>
              <DataTable columns={bizCols} rows={data.topBusinesses} getRowId={(r) => r.id} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top agents</CardTitle></CardHeader>
            <CardBody>
              <DataTable columns={agentCols} rows={data.topAgents} getRowId={(r) => r.id} />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

const geoCols: Column<{ country: string; users: number; gmv: number }>[] = [
  { key: 'country', header: 'Country', render: (r) => <span className="font-medium text-fg">{r.country}</span> },
  { key: 'users', header: 'Users', render: (r) => <span className="text-fg">{formatNumber(r.users)}</span> },
  { key: 'gmv', header: 'GMV', render: (r) => <span className="text-fg">{formatMoney(r.gmv)}</span> },
];

const bizCols: Column<{ id: string; name: string; gmv: number; tasks: number }>[] = [
  { key: 'name', header: 'Business', render: (r) => <span className="font-medium text-fg">{r.name}</span> },
  { key: 'gmv', header: 'GMV', render: (r) => <span className="text-fg">{formatMoney(r.gmv)}</span> },
  { key: 'tasks', header: 'Tasks', render: (r) => <span className="text-muted">{formatNumber(r.tasks)}</span> },
];

const agentCols: Column<{ id: string; name: string; earnings: number; tasks: number; rating: number }>[] = [
  { key: 'name', header: 'Agent', render: (r) => <span className="font-medium text-fg">{r.name}</span> },
  { key: 'earnings', header: 'Earnings', render: (r) => <span className="text-fg">{formatMoney(r.earnings)}</span> },
  { key: 'tasks', header: 'Tasks', render: (r) => <span className="text-muted">{formatNumber(r.tasks)}</span> },
  { key: 'rating', header: 'Rating', render: (r) => <span className="text-fg">{r.rating.toFixed(2)}</span> },
];
