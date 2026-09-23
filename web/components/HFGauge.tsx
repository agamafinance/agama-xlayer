'use client';

import { formatUnits } from 'viem';

/// Compact health-factor gauge. Reads HF in RAY. Returns a nice color band
/// + a numeric readout; placeholder dash when no position.
export function HFGauge({ hfRay }: { hfRay: bigint | undefined }) {
  if (hfRay === undefined) {
    return (
      <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-4">
        <div className="text-[12px] uppercase tracking-wider text-fg-muted">Health factor</div>
        <div className="mt-1 text-[28px] text-fg">—</div>
        <div className="text-[12px] text-fg-muted">No position on this market.</div>
      </div>
    );
  }

  // RAY → number. Cap at 4 for the bar; show ∞ if very large.
  const hf = Number(formatUnits(hfRay, 27));
  const display = hf > 99 ? '∞' : hf.toFixed(2);

  let band = 'bg-rose-500'; // < 1.1 — danger
  let label = 'Liquidatable';
  if (hf >= 1.5) {
    band = 'bg-emerald-600';
    label = 'Healthy';
  } else if (hf >= 1.1) {
    band = 'bg-amber-500';
    label = 'Caution';
  } else if (hf >= 1.0) {
    band = 'bg-orange-500';
    label = 'At risk';
  }

  // Map HF in [1, 3] to bar fill 0..100%.
  const pct = Math.max(0, Math.min(100, ((hf - 1) / 2) * 100));

  return (
    <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-4">
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">Health factor</div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[28px] text-fg">{display}</span>
        <span className={`text-[11px] uppercase tracking-wider ${band.replace('bg-', 'text-')}`}>
          {label}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-[#254839]/[0.08] overflow-hidden">
        <div className={`h-full ${band} transition-[width]`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-fg-muted">
        Liquidates at HF &lt; 1.0. Keep above 1.5 to absorb price swings.
      </div>
    </div>
  );
}
