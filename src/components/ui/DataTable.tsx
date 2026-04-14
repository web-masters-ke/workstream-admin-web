'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  loading?: boolean;
  // Bulk selection (optional)
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectedChange?: (ids: Set<string>) => void;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  empty,
  loading,
  selectable,
  selectedIds,
  onSelectedChange,
}: DataTableProps<T>) {
  const allChecked =
    selectable && rows.length > 0 && rows.every((r) => selectedIds?.has(getRowId(r)));
  const someChecked = selectable && rows.some((r) => selectedIds?.has(getRowId(r))) && !allChecked;

  function toggleAll() {
    if (!onSelectedChange) return;
    const next = new Set(selectedIds ?? []);
    if (allChecked) {
      rows.forEach((r) => next.delete(getRowId(r)));
    } else {
      rows.forEach((r) => next.add(getRowId(r)));
    }
    onSelectedChange(next);
  }

  function toggleOne(id: string) {
    if (!onSelectedChange) return;
    const next = new Set(selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-2">
          <tr>
            {selectable && (
              <th className="w-10 px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={!!allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !!someChecked;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer accent-brand"
                  aria-label="Select all"
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colCount} className="px-4 py-8 text-center text-muted">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-8 text-center text-muted">
                {empty ?? 'No records found'}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => {
              const id = getRowId(row);
              const checked = !!selectedIds?.has(id);
              return (
                <tr
                  key={id}
                  className={cn(
                    'border-t border-border transition-colors',
                    onRowClick ? 'cursor-pointer hover:bg-surface-2' : '',
                    checked ? 'bg-brand/5' : '',
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="w-10 px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(id)}
                        className="h-4 w-4 cursor-pointer accent-brand"
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 text-fg align-middle', c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
