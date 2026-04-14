'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, post, tokenStore } from '@/lib/api';

interface LoginResponse {
  token?: string;
  accessToken?: string;
  user?: { id: string; email: string; role: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@workstream.io');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await post<LoginResponse>('/auth/login', { email, password });
      const token = resp.token || resp.accessToken;
      if (token) tokenStore.set(token);
      router.push('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel – brand / illustration ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'linear-gradient(145deg, #0B0F1C 0%, #14192E 60%, #1C2240 100%)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
            style={{ background: 'rgb(196 148 90)', color: '#0B0F1C' }}
          >
            WS
          </div>
          <div>
            <div className="text-sm font-semibold text-white">WorkStream</div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: 'rgb(196 148 90 / 0.7)' }}>Admin Console</div>
          </div>
        </div>

        {/* Center copy */}
        <div>
          <div className="mb-6 flex gap-2">
            {['Platform', 'Finance', 'Compliance'].map((t) => (
              <span
                key={t}
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{ background: 'rgb(196 148 90 / 0.15)', color: 'rgb(196 148 90)' }}
              >
                {t}
              </span>
            ))}
          </div>
          <h1 className="text-4xl font-bold leading-tight text-white">
            The nerve centre<br />
            of WorkStream<br />
            <span style={{ color: 'rgb(196 148 90)' }}>operations.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Manage agents, businesses, payouts, KYC, disputes, and platform health — all from one secure console.
          </p>

          {/* Fake metric cards */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { label: 'Active Agents', value: '12,480' },
              { label: 'Tasks Today', value: '38,291' },
              { label: 'KES Paid Out', value: '₭ 480M' },
              { label: 'SLA Compliance', value: '99.2%' },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl p-4"
                style={{ background: 'rgb(255 255 255 / 0.04)', border: '1px solid rgb(255 255 255 / 0.07)' }}
              >
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-slate-600">
          Internal access only · All actions are logged and audited
        </div>
      </div>

      {/* ── Right panel – form ── */}
      <div className="flex w-full flex-col items-center justify-center bg-bg px-6 lg:w-1/2 lg:px-16">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-fg"
            style={{ background: 'rgb(var(--brand))' }}
          >
            WS
          </div>
          <span className="text-sm font-semibold text-fg">WorkStream Admin</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-fg">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Access the operations console.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="admin@workstream.dev"
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-fg">Password</label>
                <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={showPwd}
                    onChange={(e) => setShowPwd(e.target.checked)}
                    className="h-3 w-3 cursor-pointer"
                  />
                  Show password
                </label>
              </div>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="••••••••"
              />
              <p className="mt-1.5 text-[11px] text-muted">Seed password: <span className="font-mono">Password123!</span></p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-60"
              style={{ background: 'rgb(var(--brand))', color: 'rgb(var(--brand-fg))' }}
            >
              {loading ? 'Signing in…' : 'Sign in to console'}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-muted">
            WorkStream · Internal use only · All actions are logged
          </p>
        </div>
      </div>
    </div>
  );
}
