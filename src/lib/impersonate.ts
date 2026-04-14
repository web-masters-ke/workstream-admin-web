'use client';

// Simple impersonation store: persists the target user id in localStorage and
// the Axios request interceptor reads it and attaches `X-Impersonate-User-Id`.

const KEY = 'ws-admin-impersonate';

export interface ImpersonateTarget {
  id: string;
  label?: string;
}

const LISTENERS = new Set<(t: ImpersonateTarget | null) => void>();

function read(): ImpersonateTarget | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonateTarget;
  } catch {
    return null;
  }
}

export const impersonate = {
  get(): ImpersonateTarget | null {
    return read();
  },
  set(target: ImpersonateTarget) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, JSON.stringify(target));
    LISTENERS.forEach((l) => l(target));
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(KEY);
    LISTENERS.forEach((l) => l(null));
  },
  subscribe(cb: (t: ImpersonateTarget | null) => void): () => void {
    LISTENERS.add(cb);
    cb(read());
    return () => {
      LISTENERS.delete(cb);
    };
  },
};
