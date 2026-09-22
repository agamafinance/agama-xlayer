import {stringToHex, type Address} from "viem";

import type {Deployment, StockKey} from "./deployment-types";

export type Stock = {
  key: StockKey;
  wrapper: "wTSLAx" | "wNVDAx" | "wSPYx" | "wAAPLx";
  name: string;
  ticker: `0x${string}`; // bytes32, right padded
};

export const STOCKS: Stock[] = [
  {key: "TSLA", wrapper: "wTSLAx", name: "Tesla", ticker: stringToHex("TSLA", {size: 32})},
  {key: "NVDA", wrapper: "wNVDAx", name: "NVIDIA", ticker: stringToHex("NVDA", {size: 32})},
  {key: "SPY", wrapper: "wSPYx", name: "S&P 500 ETF", ticker: stringToHex("SPY", {size: 32})},
  {key: "AAPL", wrapper: "wAAPLx", name: "Apple", ticker: stringToHex("AAPL", {size: 32})},
];

export function stockToken(d: Deployment, s: Stock): Address {
  return d.tokens[s.wrapper];
}

export function stockAdapter(d: Deployment, s: Stock): Address {
  return d.adapters[s.key];
}

/// Shown when the vault has no realized APY yet (needs two NAV snapshots).
export const TARGET_VAULT_APY_RAY = 10n ** 26n; // 10%
