'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { get, post, errorMessage } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PermissionKey = string;

interface PermissionDef {
  key: PermissionKey;
  label: string;
  group: string;
}

interface RoleCol {
  name: string;
  builtIn?: boolean;
}

// ---------------------------------------------------------------------------
// Hardcoded permission catalogue
// ---------------------------------------------------------------------------
const PERMISSIONS: PermissionDef[] = [
  // Platform
  { key: 'view_dashboard', label: 'View dashboard', group: 'Platform' },
  { key: 'manage_users', label: 'Manage users', group: 'Platform' },
  { key: 'manage_businesses', label: 'Manage businesses', group: 'Platform' },
  { key: 'manage_agents', label: 'Manage agents', group: 'Platform' },
  { key: 'manage_disputes', label: 'Manage disputes', group: 'Platform' },
  { key: 'view_audit_logs', label: 'View audit logs', group: 'Platform' },
  { key: 'manage_system_settings', label: 'Manage system settings', group: 'Platform' },
  { key: 'manage_feature_flags', label: 'Manage feature flags', group: 'Platform' },
  // Tasks
  { key: 'create_tasks', label: 'Create tasks', group: 'Tasks' },
  { key: 'assign_tasks', label: 'Assign tasks', group: 'Tasks' },
  { key: 'view_all_tasks', label: 'View all tasks', group: 'Tasks' },
  { key: 'force_cancel_task', label: 'Force cancel task', group: 'Tasks' },
  { key: 'export_tasks', label: 'Export tasks', group: 'Tasks' },
  // Payments
  { key: 'view_payments', label: 'View payments', group: 'Payments' },
  { key: 'approve_payouts', label: 'Approve payouts', group: 'Payments' },
  { key: 'issue_refunds', label: 'Issue refunds', group: 'Payments' },
  { key: 'manage_invoices', label: 'Manage invoices', group: 'Payments' },
  { key: 'view_financial_reports', label: 'View financial reports', group: 'Payments' },
  // Communication
  { key: 'view_all_conversations', label: 'View all conversations', group: 'Communication' },
  { key: 'send_admin_messages', label: 'Send admin messages', group: 'Communication' },
  { key: 'moderate_content', label: 'Moderate content', group: 'Communication' },
  // QA
  { key: 'create_qa_reviews', label: 'Create QA reviews', group: 'QA' },
  { key: 'view_qa_reports', label: 'View QA reports', group: 'QA' },
  { key: 'manage_qa_rules', label: 'Manage QA rules', group: 'QA' },
];

const GROUPS = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

// ---------------------------------------------------------------------------
// Default role matrix
// ---------------------------------------------------------------------------
const DEFAULT_ROLES: RoleCol[] = [
  { name: 'ADMIN', builtIn: true },
  { name: 'SUPERVISOR' },
  { name: 'BUSINESS_OWNER' },
  { name: 'AGENT' },
  { name: 'VIEWER' },
  { name: 'BILLING_ADMIN' },
];

type Matrix = Record<string, Record<string, boolean>>; // matrix[roleName][permKey]

function defaultMatrix(roles: RoleCol[]): Matrix {
  const m: Matrix = {};
  for (const r of roles) {
    m[r.name] = {};
    for (const p of PERMISSIONS) {
      if (r.name === 'ADMIN') {
        m[r.name][p.key] = true;
      } else if (r.name === 'VIEWER') {
        m[r.name][p.key] = p.key.startsWith('view_');
      } else if (r.name === 'SUPERVISOR') {
        m[r.name][p.key] = [
          'view_dashboard','manage_disputes','view_all_tasks','view_audit_logs',
          'view_payments','view_all_conversations','create_qa_reviews','view_qa_reports',
        ].includes(p.key);
      } else if (r.name === 'BILLING_ADMIN') {
        m[r.name][p.key] = [
          'view_dashboard','view_payments','approve_payouts','issue_refunds',
          'manage_invoices','view_financial_reports',
        ].includes(p.key);
      } else if (r.name === 'BUSINESS_OWNER') {
        m[r.name][p.key] = [
          'view_dashboard','create_tasks','assign_tasks','view_all_tasks',
          'view_payments','view_all_conversations','send_admin_messages',
        ].includes(p.key);
      } else if (r.name === 'AGENT') {
        m[r.name][p.key] = [
          'view_dashboard','create_tasks','view_all_tasks',
          'view_payments','view_all_conversations',
        ].includes(p.key);
      } else {
        m[r.name][p.key] = false;
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RolesPage() {
  const [roles, setRoles] = useState<RoleCol[]>(DEFAULT_ROLES);
  const [matrix, setMatrix] = useState<Matrix>(() => defaultMatrix(DEFAULT_ROLES));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // Add role form
  const [addOpen, setAddOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  // Rename
  const [renamingRole, setRenamingRole] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  // Load saved matrix from settings
  useEffect(() => {
    (async () => {
      try {
        const data = await get<{ key: string; value: string }[] | { items: { key: string; value: string }[] }>(
          '/admin/settings',
        );
        const list = Array.isArray(data) ? data : (data.items ?? []);
        const entry = list.find((s) => s.key === 'rbac.roles');
        if (entry) {
          const parsed = JSON.parse(entry.value) as { roles: RoleCol[]; matrix: Matrix };
          setRoles(parsed.roles);
          setMatrix(parsed.matrix);
        }
      } catch {
        // Settings not available — use defaults silently
        setLoadError(null);
      }
    })();
  }, []);

  function togglePerm(roleName: string, permKey: string) {
    setMatrix((prev) => ({
      ...prev,
      [roleName]: {
        ...prev[roleName],
        [permKey]: !prev[roleName]?.[permKey],
      },
    }));
  }

  function addRole() {
    const name = newRoleName.trim().toUpperCase().replace(/\s+/g, '_');
    if (!name || roles.find((r) => r.name === name)) return;
    const newRole: RoleCol = { name };
    const newRoles = [...roles, newRole];
    setRoles(newRoles);
    setMatrix((prev) => ({
      ...prev,
      [name]: Object.fromEntries(PERMISSIONS.map((p) => [p.key, false])),
    }));
    setNewRoleName('');
    setAddOpen(false);
  }

  function deleteRole(name: string) {
    if (roles.find((r) => r.name === name)?.builtIn) return;
    setRoles((prev) => prev.filter((r) => r.name !== name));
    setMatrix((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function commitRename() {
    if (!renamingRole) return;
    const name = renameVal.trim().toUpperCase().replace(/\s+/g, '_');
    if (!name || roles.find((r) => r.name === name && r.name !== renamingRole)) {
      setRenamingRole(null);
      return;
    }
    setRoles((prev) =>
      prev.map((r) => (r.name === renamingRole ? { ...r, name } : r)),
    );
    setMatrix((prev) => {
      const next = { ...prev };
      if (renamingRole !== name) {
        next[name] = next[renamingRole];
        delete next[renamingRole];
      }
      return next;
    });
    setRenamingRole(null);
  }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await post('/admin/settings', {
        key: 'rbac.roles',
        value: JSON.stringify({ roles, matrix }),
      });
      setSaveMsg('Saved successfully.');
    } catch (e) {
      setSaveMsg(`Save failed: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Define roles and map permissions. Controls who can see and do what."
        actions={
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span
                className={`text-xs ${
                  saveMsg.startsWith('Save failed') ? 'text-danger' : 'text-success'
                }`}
              >
                {saveMsg}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => setAddOpen((o) => !o)}>
              + Add role
            </Button>
            <Button size="sm" onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        }
      />

      {loadError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {loadError}
        </div>
      )}

      {/* Add role form */}
      {addOpen && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <Input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="Role name (e.g. CONTENT_MANAGER)"
            className="w-64"
            onKeyDown={(e) => { if (e.key === 'Enter') addRole(); }}
          />
          <Button size="sm" onClick={addRole}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); setNewRoleName(''); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Matrix table */}
      <div className="overflow-auto rounded-lg border border-border bg-surface">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="w-48 px-4 py-3 text-left text-[11px] uppercase tracking-wider text-muted">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.name} className="px-3 py-3 text-center">
                  {renamingRole === r.name ? (
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        className="h-6 w-28 text-xs"
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingRole(null); }}
                        autoFocus
                      />
                      <button onClick={commitRename} className="text-success hover:underline">✓</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-semibold text-fg">{r.name}</span>
                      {!r.builtIn && (
                        <>
                          <button
                            onClick={() => { setRenamingRole(r.name); setRenameVal(r.name); }}
                            className="text-muted hover:text-fg"
                            title="Rename"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => deleteRole(r.name)}
                            className="text-muted hover:text-danger"
                            title="Delete role"
                          >
                            ✕
                          </button>
                        </>
                      )}
                      {r.builtIn && (
                        <span className="ml-1 rounded bg-brand/15 px-1 text-[9px] text-brand">built-in</span>
                      )}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const groupPerms = PERMISSIONS.filter((p) => p.group === group);
              return [
                // Group header row
                <tr key={`grp-${group}`} className="border-b border-border bg-surface-2/60">
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted"
                  >
                    {group}
                  </td>
                </tr>,
                // Permission rows
                ...groupPerms.map((perm) => (
                  <tr
                    key={perm.key}
                    className="border-b border-border/50 hover:bg-surface-2/40"
                  >
                    <td className="px-4 py-2.5 text-fg">
                      <div className="font-medium">{perm.label}</div>
                      <div className="text-[10px] font-mono text-muted">{perm.key}</div>
                    </td>
                    {roles.map((r) => {
                      const checked = matrix[r.name]?.[perm.key] ?? false;
                      const disabled = r.builtIn && r.name === 'ADMIN';
                      return (
                        <td key={r.name} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => togglePerm(r.name, perm.key)}
                            className="h-4 w-4 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`${r.name} - ${perm.key}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
