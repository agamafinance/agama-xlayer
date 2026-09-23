'use client';

import { useState, ReactNode } from 'react';
import type { Curator } from '@/lib/arbitrum/config';

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="mt-1 text-[26px] leading-none text-fg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-fg-muted">{sub}</div>}
    </div>
  );
}

// Curator icon mark in a clean white rounded square (matches the Stellar vault cards).
export function CuratorBadge({ curator, size = 'sm' }: { curator: Curator; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9' : 'h-7 w-7';
  const img = size === 'md' ? 'h-[22px] w-[22px]' : 'h-[16px] w-[16px]';
  const src = curator === 'Qiro' ? '/qiro-icon.svg' : '/tenka.svg';
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-[#254839]/10`}>
      <img src={src} alt={curator} className={`${img} object-contain`} />
    </span>
  );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'green' | 'amber' | 'red' }) {
  const m = {
    muted: 'bg-[#254839]/8 text-fg-muted',
    green: 'bg-emerald-500/12 text-emerald-700',
    amber: 'bg-amber-500/15 text-amber-700',
    red: 'bg-red-500/12 text-red-700',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${m}`}>{children}</span>;
}

// Async action button that shows pending/error state.
export function ActionButton({ label, onClick, disabled, variant = 'primary' }: { label: string; onClick: () => Promise<void>; disabled?: boolean; variant?: 'primary' | 'ghost' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cls = variant === 'primary'
    ? 'btn-primary text-[#fdf8ed]'
    : 'border border-[#254839]/25 text-[#254839] hover:bg-[#254839]/[0.06]';
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          setErr(null); setBusy(true);
          try { await onClick(); } catch (e: any) { setErr(e?.shortMessage || e?.message || 'failed'); }
          finally { setBusy(false); }
        }}
        className={`rounded-full h-11 px-5 text-[14px] font-medium transition disabled:opacity-40 ${cls}`}
      >
        {busy ? 'Confirming…' : label}
      </button>
      {err && <span className="text-[11px] text-red-600 max-w-[260px] truncate" title={err}>{err}</span>}
    </div>
  );
}

export function AmountInput({ value, onChange, suffix, placeholder }: { value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string }) {
  return (
    <div className="flex items-center rounded-xl border border-[#254839]/15 bg-white px-3 h-11 focus-within:border-[#254839]/40">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder || '0.0'}
        inputMode="decimal"
        className="flex-1 bg-transparent text-[15px] text-fg outline-none tabular-nums"
      />
      {suffix && <span className="ml-2 text-[13px] text-fg-muted">{suffix}</span>}
    </div>
  );
}
