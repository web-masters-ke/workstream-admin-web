'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { get, patch, put } from '@/lib/api';

type Tab = 'general' | 'notifications' | 'integrations' | 'payments' | 'security';

interface PlatformSettings {
  platformName?: string;
  supportEmail?: string;
  defaultCurrency?: string;
  maxAgentsPerBusiness?: number;
  platformFeePercent?: number;
  payoutFeePercent?: number;
  timezone?: string;
  notifications?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    pushEnabled?: boolean;
    onTaskAssigned?: boolean;
    onPaymentComplete?: boolean;
    onKycApproved?: boolean;
    onDisputeOpened?: boolean;
  };
  integrations?: {
    slackWebhookUrl?: string;
    twilioSid?: string;
    twilioAuthToken?: string;
    s3Bucket?: string;
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPassword?: string;
    smtpFromEmail?: string;
  };
  payments?: {
    mpesaConsumerKey?: string;
    mpesaConsumerSecret?: string;
    mpesaShortcode?: string;
    mpesaPasskey?: string;
    stripePublishableKey?: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    escrowEnabled?: boolean;
    autoReleaseHours?: number;
  };
  security?: {
    sessionTimeoutMinutes?: number;
    require2fa?: boolean;
    ipWhitelist?: string;
  };
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: 'WorkStream',
  supportEmail: 'support@workstream.io',
  defaultCurrency: 'KES',
  maxAgentsPerBusiness: 50,
  platformFeePercent: 12,
  payoutFeePercent: 0.9,
  timezone: 'Africa/Nairobi',
  notifications: {
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true,
    onTaskAssigned: true,
    onPaymentComplete: true,
    onKycApproved: true,
    onDisputeOpened: true,
  },
  integrations: {
    slackWebhookUrl: '',
    twilioSid: '',
    twilioAuthToken: '',
    s3Bucket: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    smtpFromEmail: '',
  },
  payments: {
    mpesaConsumerKey: '',
    mpesaConsumerSecret: '',
    mpesaShortcode: '',
    mpesaPasskey: '',
    stripePublishableKey: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    escrowEnabled: true,
    autoReleaseHours: 72,
  },
  security: {
    sessionTimeoutMinutes: 60,
    require2fa: false,
    ipWhitelist: '',
  },
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
        checked ? 'bg-brand' : 'bg-surface-2 border border-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Backend returns a flat array: [{ key, value, category }]
  // We reconstruct the nested PlatformSettings shape from it
  function hydrate(rows: { key: string; value: any }[]): PlatformSettings {
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const bool = (k: string, def: boolean) => (map[k] !== undefined ? map[k] === true || map[k] === 'true' : def);
    const num = (k: string, def: number) => (map[k] !== undefined ? Number(map[k]) : def);
    const str = (k: string, def: string) => map[k] ?? def;
    return {
      platformName: str('platformName', DEFAULT_SETTINGS.platformName!),
      supportEmail: str('supportEmail', DEFAULT_SETTINGS.supportEmail!),
      defaultCurrency: str('defaultCurrency', DEFAULT_SETTINGS.defaultCurrency!),
      maxAgentsPerBusiness: num('maxAgentsPerBusiness', DEFAULT_SETTINGS.maxAgentsPerBusiness!),
      platformFeePercent: num('platformFeePercent', DEFAULT_SETTINGS.platformFeePercent!),
      payoutFeePercent: num('payoutFeePercent', DEFAULT_SETTINGS.payoutFeePercent!),
      timezone: str('timezone', DEFAULT_SETTINGS.timezone!),
      notifications: {
        emailEnabled: bool('notifications.emailEnabled', true),
        smsEnabled: bool('notifications.smsEnabled', false),
        pushEnabled: bool('notifications.pushEnabled', true),
        onTaskAssigned: bool('notifications.onTaskAssigned', true),
        onPaymentComplete: bool('notifications.onPaymentComplete', true),
        onKycApproved: bool('notifications.onKycApproved', true),
        onDisputeOpened: bool('notifications.onDisputeOpened', true),
      },
      integrations: {
        slackWebhookUrl: str('integrations.slackWebhookUrl', ''),
        twilioSid: str('integrations.twilioSid', ''),
        twilioAuthToken: str('integrations.twilioAuthToken', ''),
        s3Bucket: str('integrations.s3Bucket', ''),
        smtpHost: str('integrations.smtpHost', ''),
        smtpPort: str('integrations.smtpPort', '587'),
        smtpUser: str('integrations.smtpUser', ''),
        smtpPassword: str('integrations.smtpPassword', ''),
        smtpFromEmail: str('integrations.smtpFromEmail', ''),
      },
      payments: {
        mpesaConsumerKey: str('payments.mpesaConsumerKey', ''),
        mpesaConsumerSecret: str('payments.mpesaConsumerSecret', ''),
        mpesaShortcode: str('payments.mpesaShortcode', ''),
        mpesaPasskey: str('payments.mpesaPasskey', ''),
        stripePublishableKey: str('payments.stripePublishableKey', ''),
        stripeSecretKey: str('payments.stripeSecretKey', ''),
        stripeWebhookSecret: str('payments.stripeWebhookSecret', ''),
        escrowEnabled: bool('payments.escrowEnabled', true),
        autoReleaseHours: num('payments.autoReleaseHours', 72),
      },
      security: {
        sessionTimeoutMinutes: num('security.sessionTimeoutMinutes', 60),
        require2fa: bool('security.require2fa', false),
        ipWhitelist: str('security.ipWhitelist', ''),
      },
    };
  }

  useEffect(() => {
    setLoading(true);
    get<{ key: string; value: any }[]>('/admin/settings')
      .then((rows) => setSettings(hydrate(Array.isArray(rows) ? rows : [])))
      .catch(() => setSettings(DEFAULT_SETTINGS))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Flatten the nested settings object into individual key-value pairs with categories
      const pairs: { key: string; value: any; category: string }[] = [
        { key: 'platformName', value: settings.platformName, category: 'general' },
        { key: 'supportEmail', value: settings.supportEmail, category: 'general' },
        { key: 'defaultCurrency', value: settings.defaultCurrency, category: 'general' },
        { key: 'maxAgentsPerBusiness', value: settings.maxAgentsPerBusiness, category: 'general' },
        { key: 'platformFeePercent', value: settings.platformFeePercent, category: 'general' },
        { key: 'payoutFeePercent', value: settings.payoutFeePercent, category: 'general' },
        { key: 'timezone', value: settings.timezone, category: 'general' },
        ...Object.entries(settings.notifications ?? {}).map(([k, v]) => ({ key: `notifications.${k}`, value: v, category: 'notifications' })),
        ...Object.entries(settings.integrations ?? {}).map(([k, v]) => ({ key: `integrations.${k}`, value: v, category: 'integrations' })),
        ...Object.entries(settings.payments ?? {}).map(([k, v]) => ({ key: `payments.${k}`, value: v, category: 'payments' })),
        ...Object.entries(settings.security ?? {}).map(([k, v]) => ({ key: `security.${k}`, value: v, category: 'security' })),
      ];
      await Promise.all(
        pairs
          .filter((p) => p.value !== undefined && p.value !== null)
          .map((p) => put('/admin/settings', p).catch(() => {})),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore — local state still reflects changes
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const setNested = <K extends keyof PlatformSettings>(
    section: K,
    key: string,
    value: unknown,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown>), [key]: value },
    }));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'payments', label: 'Payments' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'security', label: 'Security' },
  ];

  return (
    <>
      <PageHeader
        title="Platform Settings"
        description="Configure global WorkStream platform behaviour and integrations."
        actions={
          <Button size="sm" onClick={save} loading={saving}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted text-sm">Loading settings…</div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {/* General tab */}
          {tab === 'general' && (
            <>
              <SettingRow label="Platform Name" description="Display name shown across the platform.">
                <Input
                  value={settings.platformName ?? ''}
                  onChange={(e) => set('platformName', e.target.value)}
                />
              </SettingRow>
              <SettingRow label="Support Email" description="Email address for platform support.">
                <Input
                  type="email"
                  value={settings.supportEmail ?? ''}
                  onChange={(e) => set('supportEmail', e.target.value)}
                />
              </SettingRow>
              <SettingRow label="Default Currency" description="Primary currency for all financial displays.">
                <Input
                  value={settings.defaultCurrency ?? 'KES'}
                  onChange={(e) => set('defaultCurrency', e.target.value)}
                  className="w-32"
                />
              </SettingRow>
              <SettingRow label="Max Agents Per Business" description="Hard cap on agents a single business can onboard.">
                <Input
                  type="number"
                  value={settings.maxAgentsPerBusiness ?? 50}
                  onChange={(e) => set('maxAgentsPerBusiness', Number(e.target.value))}
                  className="w-32"
                />
              </SettingRow>
              <SettingRow label="Platform Fee %" description="Commission the platform takes on each completed task.">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.platformFeePercent ?? 12}
                    onChange={(e) => set('platformFeePercent', Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted">%</span>
                </div>
              </SettingRow>
              <SettingRow label="Payout Processing Fee %" description="Fee deducted when processing agent payouts.">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={settings.payoutFeePercent ?? 0.9}
                    onChange={(e) => set('payoutFeePercent', Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted">%</span>
                </div>
              </SettingRow>
              <SettingRow label="Platform Timezone" description="Timezone used for all scheduled jobs and reports.">
                <Input
                  value={settings.timezone ?? 'Africa/Nairobi'}
                  onChange={(e) => set('timezone', e.target.value)}
                  className="w-56"
                  placeholder="Africa/Nairobi"
                />
              </SettingRow>
            </>
          )}

          {/* Notifications tab */}
          {tab === 'notifications' && (
            <>
              <SettingRow label="Email Notifications" description="Send email notifications to users.">
                <Toggle
                  checked={settings.notifications?.emailEnabled ?? false}
                  onChange={(v) => setNested('notifications', 'emailEnabled', v)}
                />
              </SettingRow>
              <SettingRow label="SMS Notifications" description="Send SMS via Twilio for critical events.">
                <Toggle
                  checked={settings.notifications?.smsEnabled ?? false}
                  onChange={(v) => setNested('notifications', 'smsEnabled', v)}
                />
              </SettingRow>
              <SettingRow label="Push Notifications" description="Send push notifications to mobile apps.">
                <Toggle
                  checked={settings.notifications?.pushEnabled ?? false}
                  onChange={(v) => setNested('notifications', 'pushEnabled', v)}
                />
              </SettingRow>
              <div className="border-t border-border pt-4">
                <div className="mb-3 text-[10px] uppercase tracking-wider text-muted">Event Triggers</div>
                {[
                  { key: 'onTaskAssigned', label: 'Task Assigned' },
                  { key: 'onPaymentComplete', label: 'Payment Complete' },
                  { key: 'onKycApproved', label: 'KYC Approved' },
                  { key: 'onDisputeOpened', label: 'Dispute Opened' },
                ].map((ev) => (
                  <SettingRow key={ev.key} label={ev.label} description="">
                    <Toggle
                      checked={Boolean((settings.notifications as Record<string, unknown>)?.[ev.key])}
                      onChange={(v) => setNested('notifications', ev.key, v)}
                    />
                  </SettingRow>
                ))}
              </div>
            </>
          )}

          {/* Payments tab */}
          {tab === 'payments' && (
            <>
              <div className="mb-4 rounded-md border border-brand/20 bg-brand/5 p-3 text-xs text-muted">
                All credentials are encrypted at rest. Never share secret keys. Changes take effect immediately.
              </div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted">M-Pesa (Safaricom Daraja)</div>
              <SettingRow label="Consumer Key" description="From Safaricom Daraja portal.">
                <Input
                  value={settings.payments?.mpesaConsumerKey ?? ''}
                  onChange={(e) => setNested('payments', 'mpesaConsumerKey', e.target.value)}
                  placeholder="Consumer key"
                />
              </SettingRow>
              <SettingRow label="Consumer Secret" description="">
                <Input
                  type="password"
                  value={settings.payments?.mpesaConsumerSecret ?? ''}
                  onChange={(e) => setNested('payments', 'mpesaConsumerSecret', e.target.value)}
                  placeholder="••••••••••••"
                />
              </SettingRow>
              <SettingRow label="Shortcode" description="Paybill or Till number.">
                <Input
                  value={settings.payments?.mpesaShortcode ?? ''}
                  onChange={(e) => setNested('payments', 'mpesaShortcode', e.target.value)}
                  placeholder="123456"
                  className="w-36"
                />
              </SettingRow>
              <SettingRow label="Lipa Na M-Pesa Passkey" description="Used for STK push transactions.">
                <Input
                  type="password"
                  value={settings.payments?.mpesaPasskey ?? ''}
                  onChange={(e) => setNested('payments', 'mpesaPasskey', e.target.value)}
                  placeholder="••••••••••••"
                />
              </SettingRow>
              <div className="mb-3 border-t border-border pt-5 text-[10px] font-semibold uppercase tracking-wider text-muted">Stripe</div>
              <SettingRow label="Publishable Key" description="Client-side key for Stripe.js.">
                <Input
                  value={settings.payments?.stripePublishableKey ?? ''}
                  onChange={(e) => setNested('payments', 'stripePublishableKey', e.target.value)}
                  placeholder="pk_live_…"
                />
              </SettingRow>
              <SettingRow label="Secret Key" description="Server-side key — never expose to client.">
                <Input
                  type="password"
                  value={settings.payments?.stripeSecretKey ?? ''}
                  onChange={(e) => setNested('payments', 'stripeSecretKey', e.target.value)}
                  placeholder="sk_live_…"
                />
              </SettingRow>
              <SettingRow label="Webhook Secret" description="From Stripe Dashboard > Webhooks.">
                <Input
                  type="password"
                  value={settings.payments?.stripeWebhookSecret ?? ''}
                  onChange={(e) => setNested('payments', 'stripeWebhookSecret', e.target.value)}
                  placeholder="whsec_…"
                />
              </SettingRow>
              <div className="mb-3 border-t border-border pt-5 text-[10px] font-semibold uppercase tracking-wider text-muted">Escrow</div>
              <SettingRow label="Escrow Enabled" description="Hold task payment in escrow until work is approved.">
                <Toggle
                  checked={settings.payments?.escrowEnabled ?? true}
                  onChange={(v) => setNested('payments', 'escrowEnabled', v)}
                />
              </SettingRow>
              <SettingRow label="Auto-release after (hours)" description="Automatically release escrow if business doesn't dispute within this window.">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    value={settings.payments?.autoReleaseHours ?? 72}
                    onChange={(e) => setNested('payments', 'autoReleaseHours', Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted">hrs</span>
                </div>
              </SettingRow>
            </>
          )}

          {/* Integrations tab */}
          {tab === 'integrations' && (
            <>
              <SettingRow label="Slack Webhook URL" description="Post admin alerts to a Slack channel.">
                <Input
                  placeholder="https://hooks.slack.com/services/…"
                  value={settings.integrations?.slackWebhookUrl ?? ''}
                  onChange={(e) => setNested('integrations', 'slackWebhookUrl', e.target.value)}
                />
              </SettingRow>
              <SettingRow label="Twilio SID" description="Twilio Account SID for SMS sending.">
                <Input
                  placeholder="ACxxxxxxxxxxxxxxxx"
                  value={settings.integrations?.twilioSid ?? ''}
                  onChange={(e) => setNested('integrations', 'twilioSid', e.target.value)}
                />
              </SettingRow>
              <SettingRow label="Twilio Auth Token" description="Twilio auth token (stored encrypted).">
                <Input
                  type="password"
                  placeholder="••••••••••••"
                  value={settings.integrations?.twilioAuthToken ?? ''}
                  onChange={(e) => setNested('integrations', 'twilioAuthToken', e.target.value)}
                />
              </SettingRow>
              <SettingRow label="S3 Bucket" description="S3 bucket for file storage (KYC docs, attachments).">
                <Input
                  placeholder="my-workstream-bucket"
                  value={settings.integrations?.s3Bucket ?? ''}
                  onChange={(e) => setNested('integrations', 's3Bucket', e.target.value)}
                />
              </SettingRow>
              <div className="mb-3 border-t border-border pt-5 text-[10px] font-semibold uppercase tracking-wider text-muted">SMTP (Transactional Email)</div>
              <SettingRow label="SMTP Host" description="e.g. smtp.sendgrid.net">
                <Input
                  placeholder="smtp.sendgrid.net"
                  value={settings.integrations?.smtpHost ?? ''}
                  onChange={(e) => setNested('integrations', 'smtpHost', e.target.value)}
                />
              </SettingRow>
              <SettingRow label="SMTP Port" description="Usually 587 (TLS) or 465 (SSL).">
                <Input
                  value={settings.integrations?.smtpPort ?? '587'}
                  onChange={(e) => setNested('integrations', 'smtpPort', e.target.value)}
                  className="w-24"
                />
              </SettingRow>
              <SettingRow label="SMTP Username" description="">
                <Input
                  value={settings.integrations?.smtpUser ?? ''}
                  onChange={(e) => setNested('integrations', 'smtpUser', e.target.value)}
                  placeholder="apikey or username"
                />
              </SettingRow>
              <SettingRow label="SMTP Password" description="">
                <Input
                  type="password"
                  value={settings.integrations?.smtpPassword ?? ''}
                  onChange={(e) => setNested('integrations', 'smtpPassword', e.target.value)}
                  placeholder="••••••••••••"
                />
              </SettingRow>
              <SettingRow label="From Email" description="Sender address for all platform emails.">
                <Input
                  type="email"
                  value={settings.integrations?.smtpFromEmail ?? ''}
                  onChange={(e) => setNested('integrations', 'smtpFromEmail', e.target.value)}
                  placeholder="no-reply@workstream.io"
                />
              </SettingRow>
            </>
          )}

          {/* Security tab */}
          {tab === 'security' && (
            <>
              <SettingRow label="Session Timeout (minutes)" description="Automatically log out inactive admin users.">
                <Input
                  type="number"
                  value={settings.security?.sessionTimeoutMinutes ?? 60}
                  onChange={(e) => setNested('security', 'sessionTimeoutMinutes', Number(e.target.value))}
                  className="w-32"
                />
              </SettingRow>
              <SettingRow label="Require 2FA" description="Enforce two-factor authentication for all admin accounts.">
                <Toggle
                  checked={settings.security?.require2fa ?? false}
                  onChange={(v) => setNested('security', 'require2fa', v)}
                />
              </SettingRow>
              <SettingRow label="IP Whitelist" description="Comma-separated IPs allowed to access the admin (leave blank to disable).">
                <Input
                  placeholder="10.0.0.1, 192.168.1.1"
                  value={settings.security?.ipWhitelist ?? ''}
                  onChange={(e) => setNested('security', 'ipWhitelist', e.target.value)}
                />
              </SettingRow>
            </>
          )}
        </div>
      )}
    </>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8 border-b border-border pb-5">
      <div className="flex-1">
        <div className="text-sm font-medium text-fg">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
