'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { get, put, errorMessage } from '@/lib/api';
import type { SystemFlag } from '@/lib/types';

type SysTab = 'flags' | 'pricing' | 'notifications' | 'integrations' | 'maintenance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function saveSetting(key: string, value: unknown, category: string) {
  return put('/admin/settings', { key, value, category });
}

async function loadSettings(): Promise<Record<string, any>> {
  const rows = await get<{ key: string; value: any }[]>('/admin/settings').catch(() => []);
  return Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
}

// ---------------------------------------------------------------------------
// Default flag definitions
// ---------------------------------------------------------------------------
const DEFAULT_FLAGS: SystemFlag[] = [
  { key: 'agent_wallet_enabled',   label: 'Agent wallet',            description: 'Allow agents to hold earnings in platform wallet', enabled: true },
  { key: 'mpesa_payouts_enabled',  label: 'M-Pesa payouts',          description: 'Enable M-Pesa payout method for agents',           enabled: true },
  { key: 'kyc_required',           label: 'KYC required',            description: 'Block agent task access until KYC is approved',    enabled: true },
  { key: 'dispute_auto_escalate',  label: 'Auto-escalate disputes',  description: 'Escalate disputes unresolved after 48 h',          enabled: false },
  { key: 'maintenance_mode',       label: 'Maintenance mode',        description: 'Show maintenance page to non-admin users',         enabled: false },
  { key: 'new_agent_signup',       label: 'Agent sign-up',           description: 'Allow new agents to register on the platform',     enabled: true },
  { key: 'escrow_enabled',         label: 'Escrow payments',         description: 'Hold task payment in escrow until work is approved', enabled: true },
  { key: 'freelancer_marketplace', label: 'Freelancer marketplace',  description: 'Allow free agents to bid on public listings',      enabled: true },
];

const DEFAULT_TEMPLATES = [
  { event: 'user.welcome',      subject: 'Welcome to WorkStream',      channel: 'EMAIL',      body: 'Hi {{name}}, welcome to WorkStream. Your account is ready.' },
  { event: 'payout.processed',  subject: 'Your payout has been sent',  channel: 'EMAIL+PUSH', body: 'Your payout of {{amount}} has been processed.' },
  { event: 'kyc.approved',      subject: 'KYC approved',               channel: 'EMAIL+SMS',  body: 'Your identity has been verified. You can now accept tasks.' },
  { event: 'task.assigned',     subject: 'New task assignment',        channel: 'PUSH',       body: 'You have been assigned "{{taskTitle}}".' },
  { event: 'dispute.opened',    subject: 'Dispute opened',             channel: 'EMAIL+PUSH', body: 'A dispute has been raised on task "{{taskTitle}}".' },
  { event: 'ticket.created',    subject: 'Support ticket opened',      channel: 'EMAIL',      body: 'Ticket #{{ticketId}}: {{subject}} has been created.' },
];

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------
function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition-colors border border-border ${checked ? 'bg-brand' : 'bg-surface-2'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SystemPage() {
  const [tab, setTab] = useState<SysTab>('flags');
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<SystemFlag[]>(DEFAULT_FLAGS);
  const [settings, setSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rawFlags, map] = await Promise.all([
          get<any[]>('/admin/feature-flags').catch(() => []),
          loadSettings(),
        ]);
        setSettings(map);
        const liveMap = new Map((rawFlags ?? []).map((f: any) => [f.key, f]));
        const merged: SystemFlag[] = DEFAULT_FLAGS.map((def) => {
          const live = liveMap.get(def.key) as any;
          return live ? { ...def, enabled: live.enabled ?? live.value === 'true', description: live.description ?? def.description } : def;
        });
        for (const live of rawFlags ?? []) {
          if (!DEFAULT_FLAGS.find((d) => d.key === live.key))
            merged.push({ key: live.key, label: live.key, description: live.description ?? '', enabled: live.enabled ?? live.value === 'true' });
        }
        setFlags(merged);
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function toggleFlag(flag: SystemFlag) {
    const next = !flag.enabled;
    setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)));
    try { await put('/admin/feature-flags', { key: flag.key, enabled: next, value: String(next), description: flag.description }); } catch {}
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading system configuration…</div>;

  return (
    <>
      <PageHeader title="System configuration" description="Feature flags, pricing rules, notification templates, integrations, and maintenance mode." />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {(['flags', 'pricing', 'notifications', 'integrations', 'maintenance'] as SysTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'flags' && <FlagsTab flags={flags} onToggle={toggleFlag} />}
      {tab === 'pricing' && <PricingTab settings={settings} onChange={(k, v) => setSettings((p) => ({ ...p, [k]: v }))} />}
      {tab === 'notifications' && <NotificationsTab settings={settings} />}
      {tab === 'integrations' && <IntegrationsTab settings={settings} />}
      {tab === 'maintenance' && <MaintenanceTab settings={settings} onChange={(k, v) => setSettings((p) => ({ ...p, [k]: v }))} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Feature flags tab
// ---------------------------------------------------------------------------
function FlagsTab({ flags, onToggle }: { flags: SystemFlag[]; onToggle: (f: SystemFlag) => void }) {
  return (
    <div className="max-w-2xl space-y-2">
      {flags.map((flag) => (
        <div key={flag.key} className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
          <div>
            <div className="text-sm font-medium text-fg">{flag.label}</div>
            <div className="text-xs text-muted">{flag.description}</div>
            <div className="mt-0.5 font-mono text-[10px] text-muted/70">{flag.key}</div>
          </div>
          <Switch checked={flag.enabled} onChange={() => onToggle(flag)} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing tab
// ---------------------------------------------------------------------------
function PricingTab({ settings, onChange }: { settings: Record<string, any>; onChange: (k: string, v: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platformFee = Number(settings['pricing.platform_fee_pct'] ?? 5);
  const minPayout = Number(settings['pricing.min_payout_amount'] ?? 10);
  const slaDispute = Number(settings['sla.dispute_hours'] ?? 48);
  const slaSupport = Number(settings['sla.support_hours'] ?? 24);
  const slaKyc = Number(settings['sla.kyc_hours'] ?? 72);

  async function save() {
    setSaving(true); setError(null);
    try {
      await Promise.all([
        saveSetting('pricing.platform_fee_pct', settings['pricing.platform_fee_pct'] ?? 5, 'pricing'),
        saveSetting('pricing.min_payout_amount', settings['pricing.min_payout_amount'] ?? 10, 'pricing'),
        saveSetting('sla.dispute_hours', settings['sla.dispute_hours'] ?? 48, 'sla'),
        saveSetting('sla.support_hours', settings['sla.support_hours'] ?? 24, 'sla'),
        saveSetting('sla.kyc_hours', settings['sla.kyc_hours'] ?? 72, 'sla'),
      ]);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Pricing & SLAs</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Platform fee (%)</label>
          <Input type="number" min={0} max={100} step={0.5} value={platformFee} onChange={(e) => onChange('pricing.platform_fee_pct', Number(e.target.value))} className="w-32" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Minimum payout amount (KES)</label>
          <Input type="number" min={0} value={minPayout} onChange={(e) => onChange('pricing.min_payout_amount', Number(e.target.value))} className="w-40" />
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted">SLA defaults (hours)</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted">Dispute resolution</label>
              <Input type="number" value={slaDispute} onChange={(e) => onChange('sla.dispute_hours', Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">Support ticket</label>
              <Input type="number" value={slaSupport} onChange={(e) => onChange('sla.support_hours', Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">KYC review</label>
              <Input type="number" value={slaKyc} onChange={(e) => onChange('sla.kyc_hours', Number(e.target.value))} />
            </div>
          </div>
        </div>
        <Button size="sm" onClick={save} loading={saving}>{saved ? 'Saved!' : 'Save changes'}</Button>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notification templates tab
// ---------------------------------------------------------------------------
function NotificationsTab({ settings }: { settings: Record<string, any> }) {
  // Load templates: each template is stored as settings key `notifications.template.<event>`
  // Value is a JSON object { subject, body, channel }
  const initial = DEFAULT_TEMPLATES.map((def) => {
    const stored = settings[`notifications.template.${def.event}`];
    if (stored && typeof stored === 'object') return { ...def, ...stored };
    return def;
  });
  const [templates, setTemplates] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function saveTemplate(event: string) {
    const t = templates.find((x) => x.event === event);
    if (!t) return;
    setSaving(event); setErrors((p) => ({ ...p, [event]: '' }));
    try {
      await saveSetting(`notifications.template.${event}`, { subject: t.subject, body: t.body, channel: t.channel }, 'notifications');
      setSavedMap((p) => ({ ...p, [event]: true }));
      setTimeout(() => setSavedMap((p) => ({ ...p, [event]: false })), 2000);
      setEditing(null);
    } catch (e) {
      setErrors((p) => ({ ...p, [event]: errorMessage(e) }));
    } finally { setSaving(null); }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Notification templates</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        <p className="mb-2 text-xs text-muted">Use <code className="rounded bg-surface-2 px-1">{'{{name}}'}</code>, <code className="rounded bg-surface-2 px-1">{'{{amount}}'}</code>, <code className="rounded bg-surface-2 px-1">{'{{taskTitle}}'}</code> as variables. Changes are saved to the database immediately.</p>
        {templates.map((t) => (
          <div key={t.event} className="rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-fg">{t.subject}</div>
                <div className="text-xs text-muted">{t.event} · {t.channel}</div>
              </div>
              <div className="flex items-center gap-2">
                {savedMap[t.event] && <span className="text-xs text-success">Saved!</span>}
                <Button size="sm" variant="ghost" onClick={() => setEditing(editing === t.event ? null : t.event)}>
                  {editing === t.event ? 'Close' : 'Edit'}
                </Button>
              </div>
            </div>
            {editing === t.event && (
              <div className="mt-3 space-y-2">
                {errors[t.event] && <div className="text-xs text-danger">{errors[t.event]}</div>}
                <div>
                  <label className="mb-1 block text-[11px] text-muted uppercase tracking-wider">Subject</label>
                  <Input value={t.subject} onChange={(e) => setTemplates((prev) => prev.map((x) => (x.event === t.event ? { ...x, subject: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted uppercase tracking-wider">Body</label>
                  <textarea
                    value={t.body}
                    onChange={(e) => setTemplates((prev) => prev.map((x) => (x.event === t.event ? { ...x, body: e.target.value } : x)))}
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-surface p-2 text-sm text-fg focus:border-brand focus:outline-none"
                  />
                </div>
                <Button size="sm" loading={saving === t.event} onClick={() => saveTemplate(t.event)}>Save template</Button>
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Integrations tab — reads from settings, shows masked values
// ---------------------------------------------------------------------------
const INTEGRATION_KEYS = [
  { key: 'payments.mpesaConsumerKey',    label: 'M-Pesa Consumer Key',     category: 'payments' },
  { key: 'payments.mpesaConsumerSecret', label: 'M-Pesa Consumer Secret',  category: 'payments' },
  { key: 'payments.mpesaShortcode',      label: 'M-Pesa Shortcode',        category: 'payments' },
  { key: 'payments.stripePublishableKey',label: 'Stripe Publishable Key',  category: 'payments' },
  { key: 'payments.stripeSecretKey',     label: 'Stripe Secret Key',       category: 'payments' },
  { key: 'payments.stripeWebhookSecret', label: 'Stripe Webhook Secret',   category: 'payments' },
  { key: 'integrations.slackWebhookUrl', label: 'Slack Webhook URL',       category: 'integrations' },
  { key: 'integrations.twilioSid',       label: 'Twilio SID',              category: 'integrations' },
  { key: 'integrations.s3Bucket',        label: 'S3 Bucket',               category: 'integrations' },
  { key: 'integrations.smtpHost',        label: 'SMTP Host',               category: 'integrations' },
];

function mask(val: string): string {
  if (!val) return '— not set';
  if (val.length <= 8) return '****';
  return `${val.slice(0, 4)}****${val.slice(-4)}`;
}

function IntegrationsTab({ settings }: { settings: Record<string, any> }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Integration keys</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        <p className="mb-2 text-xs text-muted">Keys are masked for security. Edit them in <strong>Platform Settings → Payments / Integrations</strong>.</p>
        {INTEGRATION_KEYS.map((k) => {
          const val = String(settings[k.key] ?? '');
          const isSet = Boolean(val && val !== 'undefined');
          return (
            <div key={k.key} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-fg">{k.label}</div>
                <div className="font-mono text-xs text-muted">{isSet ? mask(val) : '— not set'}</div>
                <div className="text-[10px] text-muted/60">{k.key}</div>
              </div>
              <Badge tone={isSet ? 'success' : 'neutral'}>{isSet ? 'Configured' : 'Missing'}</Badge>
            </div>
          );
        })}
        <p className="mt-2 text-xs text-muted">Configure keys in <a href="/settings" className="text-brand underline">Platform Settings</a>.</p>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Maintenance tab
// ---------------------------------------------------------------------------
function MaintenanceTab({ settings, onChange }: { settings: Record<string, any>; onChange: (k: string, v: any) => void }) {
  const isOn = settings['system.maintenance_mode'] === true || settings['system.maintenance_mode'] === 'true';
  const msg = (settings['system.maintenance_message'] as string) ?? 'The platform is under scheduled maintenance. Please check back shortly.';
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !isOn;
    onChange('system.maintenance_mode', next);
    setSaving(true); setError(null);
    try {
      await saveSetting('system.maintenance_mode', next, 'system');
      if (next) await saveSetting('system.maintenance_message', msg, 'system');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(errorMessage(e)); onChange('system.maintenance_mode', isOn); }
    finally { setSaving(false); }
  }

  async function saveMessage() {
    setSaving(true); setError(null);
    try {
      await saveSetting('system.maintenance_message', msg, 'system');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Maintenance mode</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        {isOn && (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            MAINTENANCE MODE IS ACTIVE — all non-admin users see the maintenance page right now.
          </div>
        )}
        <div className="flex items-center gap-3">
          <Switch checked={isOn} onChange={toggle} />
          <span className="text-sm text-fg">{isOn ? 'ON — platform is in maintenance' : 'OFF — platform is live'}</span>
          {saving && <span className="text-xs text-muted">Saving…</span>}
          {saved && <span className="text-xs text-success">Saved!</span>}
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Public maintenance message</label>
          <textarea
            value={msg}
            onChange={(e) => onChange('system.maintenance_message', e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
          />
        </div>
        <Button size="sm" onClick={saveMessage} loading={saving}>{saved ? 'Saved!' : 'Save message'}</Button>
      </CardBody>
    </Card>
  );
}
