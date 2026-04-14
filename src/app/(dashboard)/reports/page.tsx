'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ReportType {
  id: string;
  title: string;
  description: string;
  category: string;
}

interface GeneratedReport {
  id: string;
  title: string;
  format: string;
  generatedAt: string;
  status: 'READY' | 'GENERATING' | 'FAILED';
}

const REPORT_TYPES: ReportType[] = [
  {
    id: 'task-performance',
    title: 'Task Performance',
    description: 'Task completion rates, SLA adherence, and average resolution times by business and agent.',
    category: 'Operations',
  },
  {
    id: 'agent-earnings',
    title: 'Agent Earnings',
    description: 'Payout history, earnings breakdown, and top earners over a selected period.',
    category: 'Finance',
  },
  {
    id: 'sla-compliance',
    title: 'SLA Compliance',
    description: 'SLA breach analysis, at-risk tasks, and compliance score by business.',
    category: 'Operations',
  },
  {
    id: 'business-activity',
    title: 'Business Activity',
    description: 'Business onboarding, task posting volume, spend, and churn indicators.',
    category: 'Growth',
  },
  {
    id: 'payment-history',
    title: 'Payment History',
    description: 'Full transaction log including deposits, escrows, releases, and payouts.',
    category: 'Finance',
  },
];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<'CSV' | 'PDF'>('CSV');
  const [generated, setGenerated] = useState<GeneratedReport[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = (report: ReportType) => {
    setGenerating(report.id);
    // Simulate async generation
    setTimeout(() => {
      const entry: GeneratedReport = {
        id: `${report.id}-${Date.now()}`,
        title: report.title,
        format,
        generatedAt: new Date().toISOString(),
        status: 'READY',
      };
      setGenerated((prev) => [entry, ...prev]);
      setGenerating(null);
    }, 1500);
  };

  return (
    <>
      <PageHeader
        title="Reports & Exports"
        description="Generate and download platform data reports in CSV or PDF format."
      />

      {/* Global date range + format */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Format</label>
          <div className="flex gap-2">
            {(['CSV', 'PDF'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  format === f
                    ? 'border-brand bg-brand text-brand-fg'
                    : 'border-border text-muted hover:text-fg hover:bg-surface-2'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Report cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map((report) => (
          <div
            key={report.id}
            className="rounded-lg border border-border bg-surface p-5 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-fg text-sm">{report.title}</div>
                <Badge tone="neutral" className="mt-1">{report.category}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted flex-1">{report.description}</p>
            <Button
              size="sm"
              onClick={() => handleGenerate(report)}
              loading={generating === report.id}
              disabled={!!generating}
            >
              Generate {format}
            </Button>
          </div>
        ))}
      </div>

      {/* Generated reports */}
      {generated.length > 0 && (
        <>
          <h3 className="mb-3 text-sm font-semibold text-fg">Generated Reports</h3>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Report</th>
                  <th className="px-4 py-3 text-left">Format</th>
                  <th className="px-4 py-3 text-left">Generated</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {generated.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 font-medium text-fg">{r.title}</td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{r.format}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {new Date(r.generatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === 'READY' ? 'success' : r.status === 'FAILED' ? 'danger' : 'warn'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'READY' && (
                        <button className="text-xs text-brand hover:underline">
                          Download
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
    </>
  );
}
