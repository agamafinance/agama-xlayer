"use client";

import clsx from "clsx";

// Piecewise scale: the interesting part (0.9 to 1.4) gets most of the width.
const STOPS: [number, number][] = [
  [0.9, 0],
  [1.0, 8],
  [1.15, 27],
  [1.4, 46],
  [2.0, 74],
  [3.0, 100],
];

function toPct(hf: number): number {
  if (!Number.isFinite(hf) || hf >= 3) return 100;
  if (hf <= 0.9) return 0;
  for (let i = 1; i < STOPS.length; i++) {
    const [h1, p1] = STOPS[i];
    const [h0, p0] = STOPS[i - 1];
    if (hf <= h1) return p0 + ((hf - h0) / (h1 - h0)) * (p1 - p0);
  }
  return 100;
}

type Mode = "earn" | "amplify";

function status(hf: number, mode: Mode): {text: string; cls: string} {
  if (!Number.isFinite(hf)) return {text: "No debt", cls: "text-mint"};
  if (hf < 1) return {text: "Liquidatable", cls: "text-coral"};
  if (hf < 1.15) return mode === "earn" ? {text: "Soft deleverage open", cls: "text-sand"} : {text: "Close to liquidation", cls: "text-sand"};
  if (hf < 1.4) return {text: "Watch", cls: "text-sand"};
  return {text: "Healthy", cls: "text-mint"};
}

function fmt(hf: number): string {
  if (!Number.isFinite(hf)) return "∞";
  if (hf > 99) return "> 99";
  return hf.toFixed(2);
}

/// Health factor on a scale with the two thresholds that matter:
/// 1.00 (Stability Pool liquidation) and, for Earn, 1.15 (anyone can
/// repay from the free vault shares, back to 1.40).
export function HFGauge({
  hf,
  preview,
  previewLabel = "After this trade",
  mode = "earn",
  empty = "No open position",
  haircutBps,
}: {
  haircutBps?: number;
  hf: number | undefined;
  preview?: number;
  previewLabel?: string;
  mode?: Mode;
  empty?: string;
}) {
  const has = hf !== undefined;
  const st = has ? status(hf, mode) : undefined;
  const ticks = [1.0, 1.15, 1.4, 2.0, 3.0];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-mute">Health factor</span>
        {has ? (
          <span className={clsx("text-sm", st?.cls)}>{st?.text}</span>
        ) : (
          <span className="text-sm text-dim">{empty}</span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-light tracking-tight text-white">{has ? fmt(hf) : "-"}</span>
        {preview !== undefined && (
          <span className="text-sm text-mute">
            {previewLabel} <span className="text-white">{fmt(preview)}</span>
          </span>
        )}
      </div>

      <div className="relative mt-4 h-11" aria-hidden>
        {/* Zones */}
        <div className="absolute inset-x-0 top-3 flex h-2 overflow-hidden rounded-full">
          <div className="bg-coral" style={{width: `${toPct(1.0)}%`}} />
          <div className={mode === "earn" ? "bg-sand" : "bg-sand/60"} style={{width: `${toPct(1.15) - toPct(1.0)}%`}} />
          <div className="bg-mint/45" style={{width: `${toPct(1.4) - toPct(1.15)}%`}} />
          <div className="flex-1 bg-mint" />
        </div>
        {/* Threshold notches */}
        {(mode === "earn" ? [1.0, 1.15] : [1.0]).map((t) => (
          <div key={t} className="absolute top-1.5 h-5 w-[2px] -translate-x-1/2 bg-white" style={{left: `${toPct(t)}%`}} />
        ))}
        {/* Preview marker (hollow) */}
        {preview !== undefined && (
          <div
            className="absolute top-[7px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-forest transition-[left] duration-300"
            style={{left: `${toPct(preview)}%`}}
          />
        )}
        {/* Current marker */}
        {has && (
          <div
            className="absolute top-[5px] h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-forest bg-white shadow-[0_0_0_1.5px_#fff] transition-[left] duration-300"
            style={{left: `${toPct(hf)}%`}}
          />
        )}
        {/* Tick values */}
        {ticks.map((t) => (
          <span
            key={t}
            className={clsx(
              "absolute top-6 text-2xs",
              t === 1.0 || (t === 1.15 && mode === "earn") ? "text-white" : "text-dim",
              t === 3.0 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{left: `${toPct(t)}%`}}
          >
            {t === 3.0 ? "3.00+" : t.toFixed(2)}
          </span>
        ))}
      </div>

      <p className="mt-1 text-xs leading-relaxed text-mute">
        {mode === "earn" ? (
          <>
            Under <span className="text-white">1.15</span> anyone can trigger a soft deleverage: your free vault
            shares repay debt until the health factor is back at 1.40. Your stock is only liquidated under{" "}
            <span className="text-white">1.00</span>, once that buffer is spent.
          </>
        ) : (
          <>
            Liquidation under <span className="text-white">1.00</span>. The collateral is the vault itself
            {haircutBps !== undefined ? ` (valued with a ${(haircutBps / 100).toFixed(0)}% haircut)` : ""}, so the health factor only moves with the borrow rate and vault NAV.
          </>
        )}
      </p>
    </div>
  );
}
