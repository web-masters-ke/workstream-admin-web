'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Column } from '@/components/ui/DataTable';
import { get, patch } from '@/lib/api';
import type { User, Agent, AuditLog } from '@/lib/types';
import { formatDate, toFixed } from '@/lib/format';

type Tab = 'profile' | 'sessions' | 'notifications' | 'activity' | 'related';

interface Session {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  createdAt: string;
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setUserLoading(true);
        const data = await get<User>(`/admin/users/${id}`);
        if (alive) setUser(data);
      } catch (e: any) {
        if (alive) setUserError(e?.message ?? 'Failed to load user');
      } finally {
        if (alive) setUserLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (userLoading) return <div className="py-20 text-center text-muted">Loading user…</div>;
  if (userError) return (
    <div className="py-20 text-center">
      <p className="text-danger">{userError}</p>
      <Link href="/users" className="mt-2 block text-sm text-brand">← Back to users</Link>
    </div>
  );
  if (!user) {
    return (
      <>
        <PageHeader title="User not found" />
        <Link href="/users" className="text-sm text-brand">← Back to users</Link>
      </>
    );
  }

  const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const tabs: Tab[] = ['profile', 'sessions', 'notifications', 'activity', 'related'];

  return (
    <>
      <PageHeader title={displayName} description={user.email} />
      <Link href="/users" className="text-sm text-brand">← Back to users</Link>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
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

      <div className="mt-4">
        {tab === 'profile' && <ProfileTab user={user} onUpdate={setUser} />}
        {tab === 'sessions' && <SessionsTab userId={user.id} />}
        {tab === 'notifications' && <NotificationsTab userId={user.id} />}
        {tab === 'activity' && <ActivityTab userId={user.id} />}
        {tab === 'related' && <RelatedTab user={user} />}
      </div>
    </>
  );
}

/* ─── Profile Tab ───────────────────────────────────────────────────────────── */

function ProfileTab({ user, onUpdate }: { user: User; onUpdate: (u: User) => void }) {
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const initials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || user.email[0].toUpperCase();

  async function doStatus(newStatus: 'ACTIVE' | 'SUSPENDED') {
    if (!confirm(`${newStatus === 'SUSPENDED' ? 'Suspend' : 'Activate'} user ${user.email}?`)) return;
    setSuspendLoading(true);
    try {
      await patch(`/admin/users/${user.id}/status`, { status: newStatus });
      onUpdate({ ...user, status: newStatus });
      alert(`User ${newStatus.toLowerCase()} successfully.`);
    } catch {
      alert('Action failed — check console.');
    } finally {
      setSuspendLoading(false);
    }
  }

  async function resetMfa() {
    if (!confirm(`Reset MFA for ${user.email}?`)) return;
    setMfaLoading(true);
    try {
      await patch(`/admin/users/${user.id}/mfa-reset`, {});
      alert('MFA reset queued.');
    } catch {
      alert('MFA reset stub — not yet wired.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function sendPasswordReset() {
    if (!confirm(`Send password reset email to ${user.email}?`)) return;
    setPwLoading(true);
    try {
      await patch(`/admin/users/${user.id}/password-reset`, {});
      alert('Password reset email sent.');
    } catch {
      alert('Password reset stub — not yet wired.');
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Profile card */}
      <Card className="lg:col-span-2">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-xl font-bold text-brand">
              {initials}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-fg">
                {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
              </h2>
              <div className="text-sm text-muted">{user.email}</div>
              {user.phone && <div className="text-sm text-muted">{user.phone}</div>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' ? 'brand' : 'neutral'}>{user.role}</Badge>
                <Badge tone={statusTone(user.status)}>{user.status}</Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <VerifiedChip label="Email verified" ok={!!user.emailVerified} />
            <VerifiedChip label="Phone verified" ok={false} />
            <VerifiedChip label="MFA enabled" ok={false} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Metric label="Last login" value={formatDate(user.lastLoginAt)} />
            <Metric label="Joined" value={formatDate(user.createdAt)} />
            <Metric label="Updated" value={formatDate(user.updatedAt)} />
          </div>
        </CardBody>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
        <CardBody className="space-y-2">
          {user.status !== 'SUSPENDED' ? (
            <Button
              className="w-full"
              size="sm"
              variant="danger"
              loading={suspendLoading}
              disabled={suspendLoading}
              onClick={() => doStatus('SUSPENDED')}
            >
              Suspend account
            </Button>
          ) : (
            <Button
              className="w-full"
              size="sm"
              loading={suspendLoading}
              disabled={suspendLoading}
              onClick={() => doStatus('ACTIVE')}
            >
              Activate account
            </Button>
          )}
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            loading={mfaLoading}
            disabled={mfaLoading}
            onClick={resetMfa}
          >
            Reset MFA
          </Button>
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            loading={pwLoading}
            disabled={pwLoading}
            onClick={sendPasswordReset}
          >
            Send password reset
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─── Sessions Tab ──────────────────────────────────────────────────────────── */

function SessionsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessError, setSessError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Session[] | { items: Session[] }>(`/admin/users/${userId}/sessions`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setSessError(e?.message ?? 'Failed to load sessions');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (sessError) return <div className="py-8 text-center text-sm text-danger">{sessError}</div>;

  async function revokeSession(sessionId: string) {
    if (!confirm('Revoke this session?')) return;
    setRevoking(sessionId);
    try {
      await patch(`/admin/users/${userId}/sessions/${sessionId}/revoke`, {});
      setRows((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      alert('Revoke stub — not yet wired.');
    } finally {
      setRevoking(null);
    }
  }

  const cols: Column<Session>[] = [
    {
      key: 'ua',
      header: 'User agent',
      render: (s) => <span className="max-w-[240px] truncate block text-xs text-muted">{s.userAgent}</span>,
    },
    { key: 'ip', header: 'IP', render: (s) => <span className="font-mono text-xs text-muted">{s.ipAddress}</span> },
    { key: 'created', header: 'Started', render: (s) => <span className="text-muted">{formatDate(s.createdAt)}</span> },
    { key: 'expires', header: 'Expires', render: (s) => <span className="text-muted">{formatDate(s.expiresAt)}</span> },
    {
      key: 'revoke',
      header: '',
      render: (s) => (
        <Button
          size="sm"
          variant="danger"
          loading={revoking === s.id}
          disabled={!!revoking}
          onClick={() => revokeSession(s.id)}
        >
          Revoke
        </Button>
      ),
    },
  ];

  return <DataTable columns={cols} rows={rows} getRowId={(s) => s.id} loading={loading} empty="No active sessions." />;
}

/* ─── Notifications Tab ─────────────────────────────────────────────────────── */

function NotificationsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifError, setNotifError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<Notification[] | { items: Notification[] }>(`/notifications/user/${userId}`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setNotifError(e?.message ?? 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (notifError) return <div className="py-8 text-center text-sm text-danger">{notifError}</div>;

  const cols: Column<Notification>[] = [
    {
      key: 'title',
      header: 'Notification',
      render: (n) => (
        <div>
          <div className="font-medium text-fg">{n.title}</div>
          <div className="text-xs text-muted">{n.body}</div>
        </div>
      ),
    },
    { key: 'channel', header: 'Channel', render: (n) => <Badge tone="neutral">{n.channel}</Badge> },
    { key: 'status', header: 'Status', render: (n) => <Badge tone={statusTone(n.status)}>{n.status}</Badge> },
    { key: 'date', header: 'Date', render: (n) => <span className="text-muted">{formatDate(n.createdAt)}</span> },
  ];

  return <DataTable columns={cols} rows={rows} getRowId={(n) => n.id} loading={loading} empty="No notifications found." />;
}

/* ─── Activity Tab ──────────────────────────────────────────────────────────── */

function ActivityTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actError, setActError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await get<AuditLog[] | { items: AuditLog[] }>(`/admin/audit-logs?entityId=${userId}`);
        setRows(Array.isArray(d) ? d : d.items);
      } catch (e: any) {
        setActError(e?.message ?? 'Failed to load activity');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (actError) return <div className="py-8 text-center text-sm text-danger">{actError}</div>;

  const cols: Column<AuditLog>[] = [
    { key: 'action', header: 'Action', render: (l) => <span className="font-mono text-xs text-fg">{l.action}</span> },
    { key: 'resource', header: 'Entity', render: (l) => <span className="text-muted">{l.resource}</span> },
    { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-xs text-muted">{l.ipAddress ?? '—'}</span> },
    { key: 'ts', header: 'Timestamp', render: (l) => <span className="text-muted">{formatDate(l.createdAt)}</span> },
  ];

  return <DataTable columns={cols} rows={rows} getRowId={(l) => l.id} loading={loading} empty="No activity found." />;
}

/* ─── Related Tab ───────────────────────────────────────────────────────────── */

function RelatedTab({ user }: { user: User }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user.role !== 'AGENT') return;
    setLoading(true);
    (async () => {
      try {
        const d = await get<Agent>(`/agents/${user.id}`);
        setAgent(d);
      } catch {
        // No mock fallback — leave null, show "no agent profile" message
      } finally {
        setLoading(false);
      }
    })();
  }, [user.id, user.role]);

  if (user.role !== 'AGENT' && user.role !== 'BUSINESS') {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-center text-sm text-muted">
        No related entity for role <strong>{user.role}</strong>.
      </div>
    );
  }

  if (user.role === 'AGENT') {
    if (loading) return <div className="py-8 text-center text-muted text-sm">Loading agent profile…</div>;
    if (!agent) {
      return (
        <div className="rounded-md border border-border bg-surface p-6 text-center text-sm text-muted">
          No agent profile found for this user.
        </div>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent profile</CardTitle>
          <Link href={`/agents/${agent.id}`} className="text-sm text-brand hover:underline">
            Open full agent page →
          </Link>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Metric label="Status" value={<Badge tone={statusTone(agent.status)}>{agent.status}</Badge>} />
            <Metric label="KYC" value={<Badge tone={statusTone(agent.kycStatus)}>{agent.kycStatus}</Badge>} />
            <Metric label="Rating" value={toFixed(agent.rating, 2)} />
            <Metric label="Tasks completed" value={String(agent.tasksCompleted ?? 0)} />
            <Metric label="Country" value={agent.country ?? '—'} />
            <Metric label="Last seen" value={formatDate(agent.lastSeenAt)} />
          </div>
          {(agent.skills ?? []).length > 0 && (
            <div className="mt-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Skills</div>
              <div className="flex flex-wrap gap-2">
                {(agent.skills ?? []).map((s) => (
                  <span key={s} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-fg">{s}</span>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  // BUSINESS role
  return (
    <div className="rounded-md border border-border bg-surface p-6 text-center text-sm text-muted">
      Business members list — navigate to the Business detail page for full details.
    </div>
  );
}

/* ─── Shared helpers ────────────────────────────────────────────────────────── */

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-fg">{value}</div>
    </div>
  );
}

function VerifiedChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
      ok ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-surface-2 text-muted'
    }`}>
      <span>{ok ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  );
}
