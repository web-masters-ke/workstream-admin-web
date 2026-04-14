// CSV export helper. Client-side only.
// Usage: downloadCsv('users.csv', rows, [['Email','email'], ['Role','role']])
// If columns not supplied, all own-enumerable keys of first row are used.

type Col<T> = [string, keyof T | ((row: T) => unknown)];

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function escape(v: string): string {
  if (/[",\n\r]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

export function toCsv<T>(rows: T[], columns?: Col<T>[]): string {
  if (rows.length === 0) return '';
  const first = rows[0] as Record<string, unknown>;
  const cols: Col<T>[] =
    columns ??
    (Object.keys(first).map((k) => [k, k as keyof T]) as Col<T>[]);
  const header = cols.map(([h]) => escape(h)).join(',');
  const body = rows
    .map((row) =>
      cols
        .map(([, accessor]) => {
          const v = typeof accessor === 'function' ? accessor(row) : (row as Record<string, unknown>)[accessor as string];
          return escape(cellToString(v));
        })
        .join(','),
    )
    .join('\n');
  return header + '\n' + body;
}

export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns?: Col<T>[],
) {
  if (typeof window === 'undefined') return;
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
