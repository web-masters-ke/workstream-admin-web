'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';

interface Shift {
  id: string;
  agentName: string;
  shiftStart: string;
  shiftEnd: string;
  hours: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ABSENT';
}

// Stub data — no live API yet
const STUB_SHIFTS: Shift[] = [
  { id: '1', agentName: 'Amina Osei', shiftStart: '2026-04-14T08:00:00Z', shiftEnd: '2026-04-14T16:00:00Z', hours: 8, status: 'ACTIVE' },
  { id: '2', agentName: 'David Mwangi', shiftStart: '2026-04-14T09:00:00Z', shiftEnd: '2026-04-14T17:00:00Z', hours: 8, status: 'ACTIVE' },
  { id: '3', agentName: 'Grace Nkosi', shiftStart: '2026-04-14T07:00:00Z', shiftEnd: '2026-04-14T15:00:00Z', hours: 8, status: 'COMPLETED' },
  { id: '4', agentName: 'James Otieno', shiftStart: '2026-04-14T10:00:00Z', shiftEnd: '2026-04-14T18:00:00Z', hours: 8, status: 'ABSENT' },
  { id: '5', agentName: 'Fatima Hassan', shiftStart: '2026-04-14T08:30:00Z', shiftEnd: '2026-04-14T16:30:00Z', hours: 8, status: 'ACTIVE' },
  { id: '6', agentName: 'Samuel Kimani', shiftStart: '2026-04-13T09:00:00Z', shiftEnd: '2026-04-13T17:00:00Z', hours: 8, status: 'COMPLETED' },
  { id: '7', agentName: 'Lucy Adhiambo', shiftStart: '2026-04-13T08:00:00Z', shiftEnd: '2026-04-13T16:00:00Z', hours: 8, status: 'COMPLETED' },
  { id: '8', agentName: 'Peter Njoroge', shiftStart: '2026-04-13T10:00:00Z', shiftEnd: '2026-04-13T18:00:00Z', hours: 8, status: 'ABSENT' },
];

function shiftTone(status: Shift['status']): 'success' | 'neutral' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'COMPLETED') return 'neutral';
  return 'danger';
}

function formatShiftTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ShiftsPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'ABSENT'>('ALL');

  const filtered = statusFilter === 'ALL'
    ? STUB_SHIFTS
    : STUB_SHIFTS.filter((s) => s.status === statusFilter);

  const active = STUB_SHIFTS.filter((s) => s.status === 'ACTIVE').length;
  const totalHours = STUB_SHIFTS.filter((s) => s.status !== 'ABSENT').reduce((a, s) => a + s.hours, 0);
  const absent = STUB_SHIFTS.filter((s) => s.status === 'ABSENT').length;
  const absenceRate = STUB_SHIFTS.length > 0
    ? ((absent / STUB_SHIFTS.length) * 100).toFixed(0)
    : '0';

  return (
    <>
      <PageHeader
        title="Shifts & Schedules"
        description="Agent shift records and attendance overview."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Active shifts" value={String(active)} />
        <StatCard label="Total hours today" value={String(totalHours)} />
        <StatCard label="Absence rate" value={`${absenceRate}%`} />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex gap-2">
        {(['ALL', 'ACTIVE', 'COMPLETED', 'ABSENT'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-muted hover:text-fg hover:bg-surface-2'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 text-left">Agent</th>
              <th className="px-4 py-3 text-left">Shift Start</th>
              <th className="px-4 py-3 text-left">Shift End</th>
              <th className="px-4 py-3 text-left">Hours</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((shift) => (
              <tr key={shift.id} className="hover:bg-surface-2 transition-colors">
                <td className="px-4 py-3 font-medium text-fg">{shift.agentName}</td>
                <td className="px-4 py-3 text-muted text-xs">{formatShiftTime(shift.shiftStart)}</td>
                <td className="px-4 py-3 text-muted text-xs">{formatShiftTime(shift.shiftEnd)}</td>
                <td className="px-4 py-3 text-muted">{shift.hours}h</td>
                <td className="px-4 py-3">
                  <Badge tone={shiftTone(shift.status)}>{shift.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
