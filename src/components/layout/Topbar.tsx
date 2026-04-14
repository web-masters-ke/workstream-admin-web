'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import { tokenStore } from '@/lib/api';
import {
  getSocket,
  onAdminNotification,
  onSocketConnection,
  type AdminNotification,
} from '@/lib/socket';
import { impersonate, type ImpersonateTarget } from '@/lib/impersonate';
import { formatDate } from '@/lib/format';

export function Topbar({ title }: { title?: string }) {
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [imp, setImp] = useState<ImpersonateTarget | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // kick off socket (idempotent)
    getSocket();
    const off1 = onAdminNotification((n) => {
      setNotifications((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    });
    const off2 = onSocketConnection((v) => setConnected(v));
    const off3 = impersonate.subscribe(setImp);
    const onDoc = (e: MouseEvent) => {
      if (!bellRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      off1();
      off2();
      off3();
      document.removeEventListener('mousedown', onDoc);
    };
  }, []);

  const logout = () => {
    tokenStore.clear();
    impersonate.clear();
    router.push('/login');
  };

  const stopImpersonate = () => {
    impersonate.clear();
    router.refresh();
  };

  const markAllRead = () => setUnread(0);

  return (
    <>
      {imp && (
        <div className="flex items-center justify-between gap-3 border-b border-warn/40 bg-warn/15 px-6 py-2 text-xs text-warn">
          <div>
            <span className="font-semibold">Viewing as:</span>{' '}
            <span className="font-mono">{imp.label ?? imp.id}</span>
            <span className="ml-2 text-warn/70">
              All requests carry <code>X-Impersonate-User-Id</code>.
            </span>
          </div>
          <button
            onClick={stopImpersonate}
            className="rounded border border-warn/40 px-2 py-0.5 text-[11px] font-medium hover:bg-warn/20"
          >
            Stop impersonating
          </button>
        </div>
      )}
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-fg">{title ?? 'Admin Console'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] ${connected ? 'text-success' : 'text-muted'}`}
            title={connected ? 'Realtime connected' : 'Realtime disconnected'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-success' : 'bg-muted'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
          <div ref={bellRef} className="relative">
            <button
              onClick={() => {
                setOpen((v) => !v);
                if (!open) markAllRead();
              }}
              className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-sm text-fg hover:bg-surface"
              aria-label="Notifications"
              title="Notifications"
            >
              🔔
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute right-0 top-10 z-50 w-80 rounded-md border border-border bg-surface shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold text-fg">Notifications</span>
                  <button
                    onClick={() => setNotifications([])}
                    className="text-[11px] text-muted hover:text-fg"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 && (
                    <div className="px-4 py-8 text-center text-xs text-muted">
                      No live events yet. Waiting for backend.
                    </div>
                  )}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="border-b border-border/60 px-3 py-2 text-xs last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold ${
                            n.level === 'danger'
                              ? 'text-danger'
                              : n.level === 'warn'
                                ? 'text-warn'
                                : n.level === 'success'
                                  ? 'text-success'
                                  : 'text-fg'
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="text-[10px] text-muted">{formatDate(n.createdAt)}</span>
                      </div>
                      <div className="mt-0.5 text-muted">{n.message ?? n.event}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-sm text-fg hover:bg-surface"
            title="Toggle theme"
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-fg">
              AD
            </div>
            <span className="text-xs text-fg">admin@workstream</span>
          </div>
          <button
            onClick={logout}
            className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
          >
            Sign out
          </button>
        </div>
      </header>
    </>
  );
}
