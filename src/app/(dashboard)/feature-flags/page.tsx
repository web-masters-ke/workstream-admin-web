'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { get, patch, post, del } from '@/lib/api';
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

  // Create flag
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [cKey, setCKey] = useState('');
  const [cLabel, setCLabel] = useState('');
  const [cDescription, setCDescription] = useState('');
  const [cScope, setCScope] = useState<FeatureFlag['scope']>('GLOBAL');
  const [cEnabled, setCEnabled] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleCreate = async () => {
    const key = cKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) { setCreateError('Key is required'); return; }
    if (flags.find((f) => f.key === key)) { setCreateError('A flag with this key already exists'); return; }
    setCreating(true);
    setCreateError(null);
    const newFlag: FeatureFlag = { key, label: cLabel.trim() || key, description: cDescription.trim() || undefined, enabled: cEnabled, scope: cScope, updatedAt: new Date().toISOString() };
    setFlags((prev) => [...prev, newFlag]);
    setShowCreate(false);
    setCKey(''); setCLabel(''); setCDescription(''); setCScope('GLOBAL'); setCEnabled(false);
    try {
      await post('/admin/feature-flags', newFlag);
    } catch {
      // optimistic — already in list
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete flag "${key}"? This cannot be undone.`)) return;
    setDeleting(key);
    setFlags((prev) => prev.filter((f) => f.key !== key));
    try {
      await del(`/admin/feature-flags/${key}`);
    } catch {} finally {
      setDeleting(null);
    }
  };

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
        actions={<Button onClick={() => setShowCreate(true)}>+ New Flag</Button>}
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
                <th className="px-4 py-3 text-left"></th>
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
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(flag.key)}
                      disabled={deleting === flag.key}
                      className="rounded px-2 py-1 text-[10px] font-medium text-muted hover:bg-danger/10 hover:text-danger transition-colors disabled:opacity-40"
                      title="Delete flag"
                    >
                      {deleting === flag.key ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create flag drawer */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-semibold text-fg">Create Feature Flag</h3>
            {createError && <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{createError}</div>}
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Key * (snake_case)</label>
                  <input
                    type="text"
                    value={cKey}
                    onChange={(e) => setCKey(e.target.value)}
                    placeholder="my_feature_flag"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono text-fg focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Label</label>
                  <input
                    type="text"
                    value={cLabel}
                    onChange={(e) => setCLabel(e.target.value)}
                    placeholder="My Feature Flag"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Description</label>
                <input
                  type="text"
                  value={cDescription}
                  onChange={(e) => setCDescription(e.target.value)}
                  placeholder="What does this flag control?"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Scope</label>
                  <select
                    value={cScope}
                    onChange={(e) => setCScope(e.target.value as FeatureFlag['scope'])}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
                  >
                    <option value="GLOBAL">GLOBAL</option>
                    <option value="PER_BUSINESS">PER_BUSINESS</option>
                    <option value="PER_AGENT">PER_AGENT</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                    <input type="checkbox" checked={cEnabled} onChange={(e) => setCEnabled(e.target.checked)} className="accent-brand rounded" />
                    Start enabled
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
              >
                {creating ? 'Creating…' : 'Create flag'}
              </button>
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-fg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
