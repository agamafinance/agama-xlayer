import {type Address} from "viem";
import tranchesJson from "@/deployments/7295799.tranches.json";

import MockTrancheTokenArtifact from "@/abi/MockTrancheToken.json";
import AmFiAdapterArtifact from "@/abi/AmFiAdapter.json";
import MockOracleArtifact from "@/abi/MockOracle.json";

export type TrancheType = "Senior" | "Junior";

export interface Tranche {
  symbol: string; // sRESOLV / jRESOLV / …
  name: string; // "Resolvi Senior"
  pool: string; // "Resolvi" | "Digcap" | "Sector Condo"
  tranche: TrancheType;
  /** APR in RAY (0.12e27 == 12%). */
  aprRay: bigint;
  /** All bps × 10000. */
  maxLtv: number;
  lt: number;
  bonus: number;
  token: Address;
  oracle: Address;
  adapter: Address;
}

type RawTranche = {
  symbol: string;
  name: string;
  pool: string;
  tranche: string;
  aprRay: string;
  maxLtv: number;
  lt: number;
  bonus: number;
  token: string;
  oracle: string;
  adapter: string;
};

const order = ["sRESOLV", "jRESOLV", "sDIGCAP", "jDIGCAP", "sCONDO", "jCONDO"];

export const tranches: Tranche[] = order
  .map((sym) => (tranchesJson as Record<string, unknown>)[sym])
  .filter((x): x is RawTranche => !!x && typeof x === "object")
  .map((raw) => ({
    symbol: raw.symbol,
    name: raw.name,
    pool: raw.pool,
    tranche: raw.tranche as TrancheType,
    aprRay: BigInt(raw.aprRay),
    maxLtv: raw.maxLtv,
    lt: raw.lt,
    bonus: raw.bonus,
    token: raw.token as Address,
    oracle: raw.oracle as Address,
    adapter: raw.adapter as Address,
  }));

export const tranchesBySymbol = Object.fromEntries(tranches.map((t) => [t.symbol, t])) as Record<
  string,
  Tranche
>;

export const tranchesByAdapter = Object.fromEntries(
  tranches.map((t) => [t.adapter.toLowerCase(), t]),
) as Record<string, Tranche>;

export function getTrancheByAdapter(adapter: string): Tranche | undefined {
  return tranchesByAdapter[adapter.toLowerCase()];
}

export function aprPercent(t: Tranche): string {
  // 0.12e27 → "12%"
  const pct = Number(t.aprRay / 10n ** 25n);
  return `${pct}%`;
}

export function ltvPercent(t: Tranche): string {
  return `${t.maxLtv / 100}%`;
}

export function ltPercent(t: Tranche): string {
  return `${t.lt / 100}%`;
}

export function bonusPercent(t: Tranche): string {
  return `${t.bonus / 100}%`;
}

export const trancheAbis = {
  Token: MockTrancheTokenArtifact.abi,
  Adapter: AmFiAdapterArtifact.abi,
  Oracle: MockOracleArtifact.abi,
} as const;
