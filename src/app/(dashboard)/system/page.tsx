'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { get, patch, post } from '@/lib/api';
import type { SystemConfig, SystemFlag } from '@/lib/types';

type SysTab = 'flags' | 'pricing' | 'notifications' | 'integrations' | 'maintenance';

export default function SystemPage() {
  const [cfg, setCfg] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SysTab>('flags');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('The platform is under scheduled maintenance. Please check back shortly.');

  const DEFAULT_FLAGS: SystemFlag[] = [
    { key: 'agent_wallet_enabled',   label: 'Agent wallet',         description: 'Allow agents to hold earnings in platform wallet', enabled: true },
    { key: 'mpesa_payouts_enabled',  label: 'M-Pesa payouts',       description: 'Enable M-Pesa payout method for agents',           enabled: true },
    { key: 'kyc_required',           label: 'KYC required',         description: 'Block agent task access until KYC is approved',    enabled: true },
    { key: 'dispute_auto_escalate',  label: 'Auto-escalate disputes', description: 'Escalate disputes unresolved after 48 h',        enabled: false },
    { key: 'maintenance_mode',       label: 'Maintenance mode',     description: 'Show maintenance page to non-admin users',         enabled: false },
    { key: 'new_agent_signup',       label: 'Agent sign-up',        description: 'Allow new agents to register on the platform',     enabled: true },
  ];

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await get<any>('/admin/settings');
        const normalized: SystemConfig = {
          flags:   Array.isArray(raw?.flags)   ? raw.flags   : DEFAULT_FLAGS,
          pricing: raw?.pricing ?? { platformFeePct: 5, minPayoutAmount: 10, payoutCurrencies: ['USD', 'KES'] },
        };
        setCfg(normalized);
      } catch {
        // API unavailable — use defaults so the page is functional
        setCfg({ flags: DEFAULT_FLAGS, pricing: { platformFeePct: 5, minPayoutAmount: 10, payoutCurrencies: ['USD', 'KES'] } });
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleFlag(flag: SystemFlag) {
    const next = !flag.enabled;
    setCfg((prev) => prev ? ({
      ...prev,
      flags: prev.flags.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)),
    }) : prev);
    try { await patch(`/admin/system/flags/${flag.key}`, { enabled: next }); } catch {}
  }

  function updatePricing(field: 'platformFeePct' | 'minPayoutAmount', value: number) {
    setCfg((prev) => prev ? ({
      ...prev,
      pricing: prev.pricing ? { ...prev.pricing, [field]: value } : prev.pricing,
    }) : prev);
  }

  async function savePricing() {
    if (!cfg) return;
    try { await patch('/admin/system/pricing', cfg.pricing); alert('Saved'); } catch { alert('Backend unavailable.'); }
  }

  async function toggleMaintenance() {
    const next = !maintenanceMode;
    setMaintenanceMode(next);
    try { await post('/admin/system/maintenance', { enabled: next, message: maintenanceMsg }); } catch {}
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading system configuration…</div>;
  if (!cfg) return null;

  return (
    <>
      <PageHeader title="System configuration" description="Feature flags, pricing rules, notification templates, integrations, and maintenance mode." />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {(['flags', 'pricing', 'notifications', 'integrations', 'maintenance'] as SysTab[]).map((t) => (
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

      {tab === 'flags' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Feature flags</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {cfg.flags.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-fg">{flag.label}</div>
                    <div className="text-xs text-muted">{flag.description}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted/80">{flag.key}</div>
                  </div>
                  <Switch checked={flag.enabled} onChange={() => toggleFlag(flag)} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'pricing' && (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <LabeledInput label="Platform fee (%)" type="number" value={cfg.pricing?.platformFeePct ?? 0} onChange={(v) => updatePricing('platformFeePct', Number(v))} />
            <LabeledInput label="Minimum payout amount (USD)" type="number" value={cfg.pricing?.minPayoutAmount ?? 0} onChange={(v) => updatePricing('minPayoutAmount', Number(v))} />
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Supported payout currencies</div>
              <div className="flex flex-wrap gap-2">
                {(cfg.pricing?.payoutCurrencies ?? []).map((c) => (
                  <span key={c} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg">{c}</span>
                ))}
              </div>
            </div>
            <SlaDefaults />
            <div className="pt-2"><Button size="sm" onClick={savePricing}>Save changes</Button></div>
          </CardBody>
        </Card>
      )}

      {tab === 'notifications' && <NotificationTemplates />}
      {tab === 'integrations' && <IntegrationKeys />}
      {tab === 'maintenance' && (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Maintenance mode</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={maintenanceMode} onChange={toggleMaintenance} />
              <span className="text-sm text-fg">{maintenanceMode ? 'ON — platform shows maintenance page' : 'OFF — platform is live'}</span>
            </div>
            <LabeledInput label="Public maintenance message" value={maintenanceMsg} onChange={setMaintenanceMsg} />
            {maintenanceMode && <Badge tone="danger">Maintenance mode is ACTIVE. All non-admin users see the maintenance page.</Badge>}
          </CardBody>
        </Card>
      )}
    </>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-surface'} border border-border`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function LabeledInput({ label, value, type = 'text', onChange }: { label: string; value: string | number; type?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SlaDefaults() {
  const [dispute, setDispute] = useState('48');
  const [support, setSupport] = useState('24');
  const [kyc, setKyc] = useState('72');
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">SLA defaults (hours)</div>
      <div className="grid grid-cols-3 gap-3">
        <LabeledInput label="Dispute resolution" type="number" value={dispute} onChange={setDispute} />
        <LabeledInput label="Support ticket" type="number" value={support} onChange={setSupport} />
        <LabeledInput label="KYC review" type="number" value={kyc} onChange={setKyc} />
      </div>
    </div>
  );
}

function NotificationTemplates() {
  const [templates, setTemplates] = useState([
    { id: 'nt_1', event: 'user.welcome', subject: 'Welcome to WorkStream', channel: 'EMAIL', body: 'Hi {{name}}, welcome to WorkStream...' },
    { id: 'nt_2', event: 'payout.processed', subject: 'Your payout has been sent', channel: 'EMAIL+PUSH', body: 'Your payout of {{amount}} has been processed.' },
    { id: 'nt_3', event: 'kyc.approved', subject: 'KYC approved', channel: 'EMAIL+SMS', body: 'Your identity has been verified.' },
    { id: 'nt_4', event: 'task.assigned', subject: 'New task assignment', channel: 'PUSH', body: 'You have been assigned "{{taskTitle}}".' },
    { id: 'nt_5', event: 'dispute.opened', subject: 'Dispute opened', channel: 'EMAIL+PUSH', body: 'A dispute has been raised on task "{{taskTitle}}".' },
  ]);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Notification templates</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-fg">{t.subject}</div>
                <div className="text-xs text-muted">{t.event} · {t.channel}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                {editing === t.id ? 'Close' : 'Edit'}
              </Button>
            </div>
            {editing === t.id && (
              <div className="mt-3 space-y-2">
                <Input value={t.subject} onChange={(e) => setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, subject: e.target.value } : x)))} />
                <textarea
                  value={t.body}
                  onChange={(e) => setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, body: e.target.value } : x)))}
                  className="h-20 w-full rounded-md border border-border bg-surface p-2 text-sm text-fg focus:border-brand focus:outline-none"
                />
                <Button size="sm" onClick={() => { setEditing(null); /* save */ }}>Save</Button>
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function IntegrationKeys() {
  const [keys] = useState([
    { id: 'ik_1', name: 'Stripe Secret Key', masked: 'sk_live_****…gK4H', active: true },
    { id: 'ik_2', name: 'M-Pesa Consumer Key', masked: '5F9a…****…Tx3Q', active: true },
    { id: 'ik_3', name: 'Sentry DSN', masked: 'https://****…@sentry.io/6', active: true },
    { id: 'ik_4', name: 'SMTP Password', masked: '****…hidden', active: true },
    { id: 'ik_5', name: 'Webhook Signing Secret', masked: 'whsec_****…xv2R', active: false },
  ]);
  return (
    <Card>
      <CardHeader><CardTitle>Integration keys</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-fg">{k.name}</div>
              <div className="font-mono text-xs text-muted">{k.masked}</div>
            </div>
            <Badge tone={k.active ? 'success' : 'neutral'}>{k.active ? 'Active' : 'Inactive'}</Badge>
          </div>
        ))}
        <div className="mt-2 text-xs text-muted">Keys are masked. Full values are managed in the backend environment.</div>
      </CardBody>
    </Card>
  );
}
