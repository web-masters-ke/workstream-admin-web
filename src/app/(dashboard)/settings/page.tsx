'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { get, patch } from '@/lib/api';

type Tab = 'general' | 'notifications' | 'integrations' | 'security';

interface PlatformSettings {
  platformName?: string;
  supportEmail?: string;
  defaultCurrency?: string;
  maxAgentsPerBusiness?: number;
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

  useEffect(() => {
    setLoading(true);
    get<PlatformSettings>('/admin/settings')
      .catch(() => DEFAULT_SETTINGS)
      .then((data) => {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await patch('/admin/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore — still show local changes
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
