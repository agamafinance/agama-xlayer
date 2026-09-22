import type {Address} from "viem";

export type StockKey = "TSLA" | "NVDA" | "SPY" | "AAPL";

export type Deployment = {
  chainId: number;
  contracts: {
    oracle: Address;
    agUSD: Address;
    sagUSD: Address;
    queue: Address;
    pool: Address;
    stabilityPool: Address;
    factory: Address;
    earnRouter: Address;
    amplifyRouter: Address;
    /// Buy and Earn zap (OKX DEX aggregator), absent on older deployments.
    zapRouter?: Address;
  };
  adapters: Record<StockKey | "VAULT", Address>;
  tokens: {
    USDG: Address;
    wTSLAx: Address;
    wNVDAx: Address;
    wSPYx: Address;
    wAAPLx: Address;
  };
  admin: Address;
  keeper: Address;
  deployedAtBlock: number;
};
