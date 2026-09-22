import {formatUnits} from "viem";

export const USDG_DECIMALS = 6;
export const STOCK_DECIMALS = 18;
export const SAGUSD_DECIMALS = 21;
export const ARUSDG_DECIMALS = 12;
export const ASP_DECIMALS = 12;
export const RAY = 10n ** 27n;
export const BPS = 10_000n;
export const MAX_UINT = 2n ** 256n - 1n;

const DASH = "-";

/// Human amount with thousands separators, truncated (never rounded up).
export function fmt(value: bigint | undefined, decimals = 18, precision = 2): string {
  if (value === undefined) return DASH;
  const neg = value < 0n;
  const f = formatUnits(neg ? -value : value, decimals);
  const [whole, frac = ""] = f.split(".");
  const wholeFmt = BigInt(whole).toLocaleString("en-US");
  const fracFmt = precision > 0 ? "." + (frac + "0".repeat(precision)).slice(0, precision) : "";
  return `${neg ? "-" : ""}${wholeFmt}${fracFmt}`;
}

export function fmtUsd(value: bigint | undefined, decimals = USDG_DECIMALS, precision = 2): string {
  if (value === undefined) return DASH;
  const s = fmt(value, decimals, precision);
  return s.startsWith("-") ? `-$${s.slice(1)}` : `$${s}`;
}

/// RAY rate (1e27 = 100%) to "x.xx%". Accepts signed values.
export function fmtRay(rate: bigint | undefined, precision = 2): string {
  if (rate === undefined) return DASH;
  return `${(rayToNumber(rate) * 100).toFixed(precision)}%`;
}

export function rayToNumber(v: bigint): number {
  return Number(formatUnits(v, 27));
}

export function fmtBps(bps: bigint | number | undefined, precision = 0): string {
  if (bps === undefined) return DASH;
  return `${(Number(bps) / 100).toFixed(precision)}%`;
}

/// Health factor in RAY. max uint (no debt) shows as "No debt".
export function fmtHf(hf: bigint | undefined): string {
  if (hf === undefined) return DASH;
  if (hf >= MAX_UINT / 2n) return "∞";
  const n = rayToNumber(hf);
  if (n > 99) return "> 99";
  return n.toFixed(2);
}

export function hfToNumber(hf: bigint | undefined): number | undefined {
  if (hf === undefined) return undefined;
  if (hf >= MAX_UINT / 2n) return Number.POSITIVE_INFINITY;
  return rayToNumber(hf);
}

export function fmtDuration(seconds: bigint | number | undefined): string {
  if (seconds === undefined) return DASH;
  const s = Number(seconds);
  if (s <= 0) return "none";
  if (s % 86_400 === 0) return `${s / 86_400} day${s === 86_400 ? "" : "s"}`;
  if (s % 3_600 === 0) return `${s / 3_600} h`;
  if (s >= 3_600) return `${(s / 3_600).toFixed(1)} h`;
  return `${Math.ceil(s / 60)} min`;
}

export function fmtAge(unixSeconds: bigint | number | undefined): string {
  if (!unixSeconds) return DASH;
  const age = Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSeconds));
  if (age < 90) return `${age}s ago`;
  if (age < 5_400) return `${Math.round(age / 60)} min ago`;
  if (age < 172_800) return `${Math.round(age / 3_600)} h ago`;
  return `${Math.round(age / 86_400)} d ago`;
}

/// Parse "123.45" into base units. Returns null on invalid input.
export function parseAmount(input: string, decimals = 18): bigint | null {
  const clean = input.replace(/,/g, "").trim();
  if (!clean || clean === ".") return null;
  if (!/^\d*\.?\d*$/.test(clean)) return null;
  const [whole = "0", frac = ""] = clean.split(".");
  if (frac.length > decimals) return null;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  } catch {
    return null;
  }
}

/// Base units back to an input string (no separators), trimmed.
export function toInput(value: bigint, decimals: number, maxFrac = 6): string {
  const f = formatUnits(value, decimals);
  const [w, fr = ""] = f.split(".");
  const t = fr.slice(0, maxFrac).replace(/0+$/, "");
  return t ? `${w}.${t}` : w;
}

export function shortAddr(a: string | undefined): string {
  if (!a) return DASH;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
