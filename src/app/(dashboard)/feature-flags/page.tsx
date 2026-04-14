'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get, patch } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface FeatureFlag {
  key: string;
  label?: string;
  description?: string;
  enabled: boolean;
  scope?: 'GLOBAL' | 'PER_BUSINESS' | 'PER_AGENT';
  updatedAt?: string;
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: 'agent_wallet_payouts', label: 'Agent Wallet Payouts', description: 'Allow agents to receive payouts directly to their wallet.', enabled: true, scope: 'GLOBAL' },
  { key: 'sla_auto_escalation', label: 'SLA Auto Escalation', description: 'Automatically escalate tasks that breach SLA to a senior agent.', enabled: true, scope: 'GLOBAL' },
  { key: 'mpesa_payouts', label: 'M-Pesa Payouts', description: 'Enable M-Pesa as a payout method for agents in Kenya.', enabled: true, scope: 'GLOBAL' },
  { key: 'multi_workspace', label: 'Multi-Workspace', description: 'Allow businesses to create multiple workspaces.', enabled: false, scope: 'PER_BUSINESS' },
  { key: 'qa_reviews', label: 'QA Reviews', description: 'Enable quality assurance review step before task completion.', enabled: false, scope: 'PER_BUSINESS' },
  { key: 'advanced_analytics', label: 'Advanced Analytics', description: 'Unlock detailed analytics dashboards for business owners.', enabled: false, scope: 'PER_BUSINESS' },
];

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    get<FeatureFlag[] | { items: FeatureFlag[] }>('/admin/feature-flags')
      .catch(() => DEFAULT_FLAGS)
      .then((raw) => {
        const items = Array.isArray(raw) ? raw : ((raw as { items: FeatureFlag[] }).items ?? []);
        setFlags(items.length > 0 ? items : DEFAULT_FLAGS);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (key: string, current: boolean) => {
    setToggling(key);
    // Optimistic update
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !current } : f)));
    try {
      await patch('/admin/feature-flags', { key, enabled: !current });
    } catch {
      // Revert on failure
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: current } : f)));
    } finally {
      setToggling(null);
    }
  };

  const enabled = flags.filter((f) => f.enabled).length;
  const disabled = flags.length - enabled;

  return (
    <>
      <PageHeader
        title="Feature Flags"
        description="Enable or disable platform features globally or per business."
      />

      <div className="mb-6 flex gap-4 text-sm text-muted">
        <span><span className="font-semibold text-success">{enabled}</span> enabled</span>
        <span><span className="font-semibold text-muted">{disabled}</span> disabled</span>
        <span><span className="font-semibold text-fg">{flags.length}</span> total flags</span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted text-sm">Loading feature flags…</div>
      ) : (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Flag</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Scope</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-left">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {flags.map((flag) => (
                <tr key={flag.key} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{flag.label ?? flag.key}</div>
                    <div className="text-[10px] font-mono text-muted">{flag.key}</div>
                  </td>
                  <td className="px-4 py-3 text-muted max-w-xs">{flag.description ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={flag.scope === 'GLOBAL' ? 'brand' : 'neutral'}>
                      {flag.scope ?? 'GLOBAL'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(flag.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      role="switch"
                      aria-checked={flag.enabled}
                      disabled={toggling === flag.key}
                      onClick={() => handleToggle(flag.key, flag.enabled)}
                      className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 ${
                        flag.enabled ? 'bg-brand' : 'bg-surface-2 border border-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          flag.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
