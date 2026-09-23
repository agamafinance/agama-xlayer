'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { HelpCircle, Search, SlidersHorizontal } from 'lucide-react';

export function Tabs({
  tabs,
  initial = 1,
}: {
  tabs: string[];
  initial?: number;
}) {
  const [active, setActive] = useState(initial);
  return (
    <div className="flex items-center gap-8 border-b border-[#254839]/10">
      {tabs.map((t, i) => (
        <button
          key={t}
          type="button"
          onClick={() => setActive(i)}
          className={clsx(
            'relative -mb-px py-3 text-[15px] transition-colors',
            i === active ? 'text-fg' : 'text-fg-muted hover:text-fg/80'
          )}
        >
          {t}
          {i === active && (
            <span className="absolute left-0 right-0 bottom-0 h-px bg-[#254839]" />
          )}
        </button>
      ))}
    </div>
  );
}

export function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <span className="text-fg-muted">{label}:</span>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-fg hover:text-fg/80"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-fg-muted" />
        {value}
      </button>
    </span>
  );
}

export function FilterBar({
  filters,
  searchPlaceholder,
}: {
  filters: { label: string; value: string }[];
  searchPlaceholder: string;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-0">
      <div className="flex items-center gap-6 md:gap-8">
        {filters.map((f) => (
          <FilterChip key={f.label} label={f.label} value={f.value} />
        ))}
        <button
          type="button"
          aria-label="Help"
          className="hidden md:inline-flex text-fg-muted hover:text-fg ml-auto"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-full md:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
          <input
            placeholder={searchPlaceholder}
            className="w-full md:w-[260px] rounded-full bg-[#254839]/[0.04] pl-9 pr-3 py-2 text-[13px] text-fg placeholder:text-fg-muted outline-none ring-1 ring-[#254839]/10 focus:ring-[#254839]/30"
          />
        </div>
      </div>
    </div>
  );
}
