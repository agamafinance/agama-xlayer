'use client';

import { type ReactNode } from 'react';

/// One action row: amount input + max + side button. Shared between
/// Earn detail (deposit/withdraw, stake/request unstake) and Borrow
/// detail (deposit collat, borrow, repay).
export function ActionPanel({
  label,
  input,
  onInput,
  maxValue,
  unit,
  decimals = 18,
  hint,
  children,
}: {
  label: string;
  input: string;
  onInput: (v: string) => void;
  maxValue?: bigint;
  unit: string;
  decimals?: number;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</span>
        {maxValue !== undefined && maxValue > 0n && (
          <button
            type="button"
            onClick={() => onInput(maxToStr(maxValue, decimals))}
            className="rounded-full bg-[#254839]/[0.06] px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted hover:bg-[#254839]/[0.12] hover:text-fg transition-colors"
          >
            Max
          </button>
        )}
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-white ring-1 ring-[#254839]/15 px-3 py-2 focus-within:ring-[#254839]/40">
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="0.0"
            className="h-7 w-full bg-transparent text-[18px] text-fg placeholder:text-fg-muted/50 focus:outline-none"
          />
          <div className="text-[10px] uppercase tracking-wider text-fg-muted">{unit}</div>
        </div>
        <div className="w-[180px] self-stretch flex items-stretch">{children}</div>
      </div>
      {hint && <div className="mt-2 text-[11px] text-fg-muted">{hint}</div>}
    </div>
  );
}

function maxToStr(v: bigint, decimals = 18): string {
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}
