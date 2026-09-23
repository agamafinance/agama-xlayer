import {formatUnits} from "viem";

/// LP / SP token decimals. The LP is an ERC-4626 wrapped over USDr (18 dec)
/// with `_decimalsOffset() = 6`, so `agYLD.decimals() = 24`. The SP is
/// itself an ERC-4626 wrapping agYLD with offset 0, so `sagYLD.decimals()`
/// is also 24. USDr / DebtToken / tranche tokens stay at 18.
export const AGYLD_DECIMALS = 24;
export const SAGYLD_DECIMALS = 24;

// Backwards-compat aliases (some files still import the old names).
export const AGTOKEN_DECIMALS = AGYLD_DECIMALS;
export const AGASP_DECIMALS = SAGYLD_DECIMALS;

/// Format a uint256 as a human-readable amount.
export function fmt(value: bigint | undefined, decimals = 18, precision = 2): string {
  if (value === undefined) return "—";
  const f = formatUnits(value, decimals);
  const [whole, frac = ""] = f.split(".");
  const wholeFmt = Number(whole).toLocaleString();
  if (precision === 0 || !frac) return wholeFmt;
  return `${wholeFmt}.${frac.slice(0, precision)}`;
}

/// Format an amount as a USDr-or-token label.
export function fmtToken(value: bigint | undefined, symbol: string, decimals = 18, precision = 2): string {
  return `${fmt(value, decimals, precision)} ${symbol}`;
}

/// Format a RAY-rate to a percentage (1.0 RAY = 100%).
export function fmtRayApr(rateRay: bigint | undefined): string {
  if (rateRay === undefined) return "—";
  const f = formatUnits(rateRay, 27);
  return `${(Number(f) * 100).toFixed(2)}%`;
}

/// Format a uint256 with K/M/B abbreviation. Useful for table columns
/// where the digit count would otherwise dominate the layout.
///   1_234     → "1.23K"
///   2_790_000 → "2.79M"
///   1_500_000_000_000 → "1.50T"
export function fmtCompact(value: bigint | undefined, decimals = 18): string {
  if (value === undefined) return "—";
  const f = formatUnits(value, decimals);
  const n = Number(f);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

/// Parse a user-entered string ("123.45") into uint256 with 18 decimals.
export function parseAmount(input: string, decimals = 18): bigint | null {
  if (!input.trim()) return null;
  const clean = input.replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(clean)) return null;
  const [whole = "0", frac = ""] = clean.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + (padded ? BigInt(padded) : 0n);
  } catch {
    return null;
  }
}
