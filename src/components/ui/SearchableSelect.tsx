'use client';

import { useEffect, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;   // shown as the "clear / any" first option
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyLabel,
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function pick(val: string) {
    onChange(val);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm',
          'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-brand/60',
          open ? 'border-brand ring-2 ring-brand/30' : '',
        ].join(' ')}
      >
        <span className={selected ? 'text-fg' : 'text-muted'}>
          {selected ? selected.label : (emptyLabel ?? placeholder)}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
          {/* Search */}
          <div className="border-b border-border px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-xs text-fg placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>

          {/* Options list */}
          <ul className="max-h-56 overflow-y-auto py-1">
            {/* Clear / any option */}
            {emptyLabel !== undefined && (
              <li>
                <button
                  type="button"
                  onClick={() => pick('')}
                  className={[
                    'w-full px-3 py-2 text-left text-sm hover:bg-surface-2',
                    value === '' ? 'bg-brand/10 font-medium text-brand' : 'text-muted',
                  ].join(' ')}
                >
                  {emptyLabel}
                </button>
              </li>
            )}

            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-muted">No results</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => pick(o.value)}
                    className={[
                      'w-full px-3 py-2 text-left text-sm hover:bg-surface-2',
                      value === o.value ? 'bg-brand/10 font-medium text-brand' : 'text-fg',
                    ].join(' ')}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
