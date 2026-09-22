"use client";

import clsx from "clsx";
import type {ReactNode} from "react";

import {fmt, parseAmount, toInput} from "@/lib/format";

/// Label / value line. Values are right aligned and tabular.
export function Row({
  label,
  value,
  sub,
  strong,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <span className="text-sm text-mute">{label}</span>
      <span className={clsx("text-right", strong ? "text-md text-white" : "text-base text-white")}>
        {value}
        {sub && <span className="ml-1.5 text-xs text-dim">{sub}</span>}
      </span>
    </div>
  );
}

/// Compact figure for page-level stat strips.
export function Figure({label, value, sub, tone}: {label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "mint" | "sand" | "coral"}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-mute">{label}</div>
      <div
        className={clsx(
          "mt-0.5 truncate text-lg",
          tone === "mint" ? "text-mint" : tone === "sand" ? "text-sand" : tone === "coral" ? "text-coral" : "text-white",
        )}
      >
        {value}
      </div>
      {sub && <div className="truncate text-2xs text-dim">{sub}</div>}
    </div>
  );
}

export function Pill({children, tone = "mint", title}: {children: ReactNode; tone?: "mint" | "sand" | "coral" | "dim"; title?: string}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[1px] text-2xs",
        tone === "mint" && "border-mint/60 text-mint",
        tone === "sand" && "border-sand/60 text-sand",
        tone === "coral" && "border-coral/60 text-coral",
        tone === "dim" && "border-line text-mute",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          tone === "mint" && "bg-mint",
          tone === "sand" && "bg-sand",
          tone === "coral" && "bg-coral",
          tone === "dim" && "bg-line",
        )}
      />
      {children}
    </span>
  );
}

/// Token amount input with wallet balance and a Max shortcut.
export function AmountField({
  label,
  value,
  onChange,
  decimals,
  symbol,
  balance,
  balanceLabel = "Wallet",
  footer,
  id,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  decimals: number;
  symbol: ReactNode;
  balance?: bigint;
  balanceLabel?: string;
  footer?: ReactNode;
  id: string;
}) {
  const parsed = parseAmount(value, decimals);
  const invalid = value.trim() !== "" && parsed === null;
  const over = parsed !== null && balance !== undefined && parsed > balance;

  return (
    <div className="box px-3.5 py-3">
      <div className="flex items-baseline justify-between text-xs">
        <label htmlFor={id} className="text-mute">
          {label}
        </label>
        {balance !== undefined && (
          <span className="text-dim">
            {balanceLabel} {fmt(balance, decimals, 4)}
            <button
              type="button"
              onClick={() => onChange(toInput(balance, decimals, Math.min(decimals, 8)))}
              className="ml-2 rounded-md px-1.5 py-0.5 text-mint hover:bg-mint/10"
            >
              Max
            </button>
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          className={clsx(
            "min-w-0 flex-1 bg-transparent text-xl font-light text-white outline-none placeholder:text-white/25",
            (invalid || over) && "text-coral",
          )}
        />
        <span className="shrink-0 text-base text-white">{symbol}</span>
      </div>
      {(invalid || over || footer) && (
        <div className="mt-1 text-xs">
          {invalid ? (
            <span className="text-coral">Not a valid amount</span>
          ) : over ? (
            <span className="text-coral">More than your balance</span>
          ) : (
            <span className="text-dim">{footer}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  minLabel,
  maxLabel,
}: {
  id: string;
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: ReactNode;
  minLabel?: ReactNode;
  maxLabel?: ReactNode;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="box px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs text-mute">
          {label}
        </label>
        <span className="text-lg text-white">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        className="slider mt-2"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{["--fill" as string]: `${fill}%`}}
      />
      {(minLabel || maxLabel) && (
        <div className="mt-0.5 flex justify-between text-2xs text-dim">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

export function Divider() {
  return <div className="my-2 h-px bg-white/10" />;
}

export function NotDeployed({chainName}: {chainName: string}) {
  return (
    <div className="panel-muted px-6 py-10">
      <h2 className="text-lg text-white">Not deployed on {chainName}</h2>
      <p className="mt-2 max-w-xl text-sm text-mute">
        The Arrow x Agama contracts are not live on this network. Switch to X Layer Testnet from the network menu to
        try every flow with test tokens.
      </p>
    </div>
  );
}

export function PageHead({title, children, stats}: {title: string; children?: ReactNode; stats?: ReactNode}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="max-w-xl">
        <h1 className="text-xl font-normal tracking-tight text-white">{title}</h1>
        {children && <p className="mt-1.5 text-sm leading-relaxed text-mute">{children}</p>}
      </div>
      {stats && <div className="flex flex-wrap gap-x-8 gap-y-3">{stats}</div>}
    </div>
  );
}
