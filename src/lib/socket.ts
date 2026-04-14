'use client';

// Minimal socket.io-client wrapper for admin-side realtime events.
// Namespace: `/notifications` on the backend gateway.
//
// Admin channel event names (server must emit these — invented if they don't yet exist):
//   admin.task.created
//   admin.task.updated
//   admin.task.assigned
//   admin.dispute.raised
//   admin.dispute.updated
//   admin.payment.completed
//   admin.payment.failed
//   admin.payout.pending
//   admin.kyc.submitted
//   admin.ticket.created
//   admin.ticket.updated
//   admin.moderation.flagged
//   admin.user.registered
//   admin.business.registered
//
// The client joins the `admin` room on connect.

import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';

let singleton: Socket | null = null;

export interface AdminNotification {
  id: string;
  event: string;
  title: string;
  message?: string;
  level: 'info' | 'warn' | 'danger' | 'success';
  createdAt: string;
  payload?: Record<string, unknown>;
}

const LISTENERS = new Set<(n: AdminNotification) => void>();
const CONN_LISTENERS = new Set<(connected: boolean) => void>();

let connected = false;

function notifyConn(v: boolean) {
  connected = v;
  CONN_LISTENERS.forEach((l) => l(v));
}

function levelFor(event: string): AdminNotification['level'] {
  if (event.includes('failed') || event.includes('dispute.raised')) return 'danger';
  if (event.includes('pending') || event.includes('flagged') || event.includes('submitted')) return 'warn';
  if (event.includes('completed')) return 'success';
  return 'info';
}

function titleFor(event: string): string {
  const tail = event.replace(/^admin\./, '').replace(/\./g, ' ');
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (singleton) return singleton;

  const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  // drop the /api/... path suffix — socket lives at origin + /notifications
  const origin = rawBase.replace(/\/api\/?.*$/, '');
  const token = tokenStore.get();

  const s = io(`${origin}/notifications`, {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    auth: token ? { token } : undefined,
  });

  s.on('connect', () => {
    notifyConn(true);
    s.emit('join', { room: 'admin' });
  });
  s.on('disconnect', () => notifyConn(false));
  s.on('connect_error', () => notifyConn(false));

  // Generic catch-all for admin.* events
  const adminEvents = [
    'admin.task.created',
    'admin.task.updated',
    'admin.task.assigned',
    'admin.dispute.raised',
    'admin.dispute.updated',
    'admin.payment.completed',
    'admin.payment.failed',
    'admin.payout.pending',
    'admin.kyc.submitted',
    'admin.ticket.created',
    'admin.ticket.updated',
    'admin.moderation.flagged',
    'admin.user.registered',
    'admin.business.registered',
  ];
  adminEvents.forEach((event) => {
    s.on(event, (payload: Record<string, unknown>) => {
      const n: AdminNotification = {
        id: (payload?.id as string) || `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        event,
        title: titleFor(event),
        message: (payload?.message as string) || (payload?.title as string) || undefined,
        level: levelFor(event),
        createdAt: (payload?.createdAt as string) || new Date().toISOString(),
        payload,
      };
      LISTENERS.forEach((l) => l(n));
    });
  });

  singleton = s;
  return s;
}

export function onAdminNotification(cb: (n: AdminNotification) => void): () => void {
  LISTENERS.add(cb);
  return () => {
    LISTENERS.delete(cb);
  };
}

export function onSocketConnection(cb: (connected: boolean) => void): () => void {
  CONN_LISTENERS.add(cb);
  // fire once with current state
  cb(connected);
  return () => {
    CONN_LISTENERS.delete(cb);
  };
}

export function isSocketConnected(): boolean {
  return connected;
}

export function disconnectSocket() {
  if (singleton) {
    singleton.disconnect();
    singleton = null;
  }
}
