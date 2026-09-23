"use client";

import {erc20Abi, parseAbi, zeroAddress, type Address} from "viem";
import {useReadContract, useReadContracts} from "wagmi";

import type {AppChainId} from "./chains";
import type {Deployment} from "./deployment-types";
import {
  earnRouterAbi,
  lendingPoolAbi,
  stockOracleAbi,
  vaultShareAdapterAbi,
  xStockAdapterAbi,
} from "./generated/abis";
import {stockAdapter, stockToken, TARGET_VAULT_APY_RAY, type Stock} from "./stocks";
import type {Tx} from "./tx";

/// Arrow pool rates + Agama vault APY, shared by every page.
export function useProtocol(d: Deployment | undefined, chainId: AppChainId) {
  const pool = d?.contracts.pool ?? zeroAddress;
  const va = d?.adapters.VAULT ?? zeroAddress;
  const {data, isLoading} = useReadContracts({
    allowFailure: true,
    contracts: [
      {address: pool, abi: lendingPoolAbi, functionName: "getReserveState", chainId},
      {address: va, abi: vaultShareAdapterAbi, functionName: "realizedApyRay", chainId},
      {address: va, abi: vaultShareAdapterAbi, functionName: "HAIRCUT_BPS", chainId},
      {address: va, abi: vaultShareAdapterAbi, functionName: "MAX_LTV", chainId},
      {address: va, abi: vaultShareAdapterAbi, functionName: "LIQUIDATION_THRESHOLD", chainId},
      {address: va, abi: vaultShareAdapterAbi, functionName: "borrowAllowed", chainId},
    ],
    query: {enabled: !!d},
  });
  const reserve = data?.[0]?.result;
  const realizedApy = data?.[1]?.result;
  const vaultApyIsTarget = realizedApy === undefined || realizedApy === 0n;
  return {
    isLoading,
    borrowRate: reserve?.currentBorrowRate,
    supplyRate: reserve?.currentLiquidityRate,
    realizedApy,
    /// realized APY when measured (two NAV snapshots), 10% target otherwise.
    vaultApy: vaultApyIsTarget ? TARGET_VAULT_APY_RAY : realizedApy,
    vaultApyIsTarget,
    haircutBps: data?.[2]?.result,
    vaultMaxLtv: data?.[3]?.result,
    vaultLt: data?.[4]?.result,
    vaultBorrowAllowed: data?.[5]?.result,
  };
}

/// The wrapper is an ERC-4626 over the base xStock (the token an OKX
/// withdrawal delivers and an OKX deposit accepts).
const wrapperAbi = parseAbi([
  "function asset() view returns (address)",
  "function previewDeposit(uint256 assets) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

export type Feed = {price: bigint; observedAt: bigint; marketOpen: boolean; exists: boolean};

export type EarnPosition = {
  account: Address;
  collateral: bigint;
  collateralValue: bigint;
  debt: bigint;
  healthFactorRay: bigint;
  freeShares: bigint;
  freeSharesValue: bigint;
  borrowAllowed: boolean;
  liquidationThresholdBps: bigint;
};

/// Everything the Earn page needs about one xStock market.
export function useStockMarket(d: Deployment | undefined, s: Stock, user: Address | undefined, chainId: AppChainId) {
  const adapter = d ? stockAdapter(d, s) : zeroAddress;
  const token = d ? stockToken(d, s) : zeroAddress;
  const oracle = d?.contracts.oracle ?? zeroAddress;
  const router = d?.contracts.earnRouter ?? zeroAddress;
  const who = user ?? zeroAddress;

  const {data} = useReadContracts({
    allowFailure: true,
    contracts: [
      {address: token, abi: erc20Abi, functionName: "balanceOf", args: [who], chainId},
      {address: oracle, abi: stockOracleAbi, functionName: "feed", args: [s.ticker], chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "MAX_LTV", chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "LIQUIDATION_THRESHOLD", chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "BASE_LIQUIDATION_THRESHOLD", chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "WEEKEND_BUFFER_BPS", chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "LIQUIDATION_BONUS", chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "borrowAllowed", chainId},
      {address: adapter, abi: xStockAdapterAbi, functionName: "wrapperPrice", chainId},
      {address: router, abi: earnRouterAbi, functionName: "position", args: [who, adapter], chainId},
      {address: token, abi: erc20Abi, functionName: "symbol", chainId},
      {address: token, abi: wrapperAbi, functionName: "asset", chainId},
    ],
    query: {enabled: !!d},
  });

  const base = data?.[11]?.result;
  const {data: baseData} = useReadContracts({
    allowFailure: true,
    contracts: [
      {address: base ?? zeroAddress, abi: erc20Abi, functionName: "symbol", chainId},
      {address: base ?? zeroAddress, abi: erc20Abi, functionName: "balanceOf", args: [who], chainId},
    ],
    query: {enabled: !!base},
  });

  const feed = data?.[1]?.result as Feed | undefined;
  const position = user ? (data?.[9]?.result as EarnPosition | undefined) : undefined;
  const hasPosition = !!position && (position.collateral > 0n || position.debt > 0n);

  return {
    stock: s,
    adapter,
    token,
    balance: user ? data?.[0]?.result : undefined,
    feed,
    maxLtv: data?.[2]?.result,
    lt: data?.[3]?.result,
    baseLt: data?.[4]?.result,
    weekendBuffer: data?.[5]?.result,
    bonus: data?.[6]?.result,
    borrowAllowed: data?.[7]?.result,
    /// USDG units per 1e18 wrapper; undefined when the oracle price is stale or missing.
    wrapperPrice: data?.[8]?.result,
    priceUnavailable: !!data && data[8]?.status === "failure",
    position,
    hasPosition,
    loaded: !!data,
    /// On-chain symbol of the wrapper (falls back to the deployment name).
    symbol: data?.[10]?.result ?? s.wrapper,
    /// Base xStock: what an OKX withdrawal delivers, what an OKX deposit takes.
    base,
    baseSymbol: baseData?.[0]?.result,
    baseBalance: user ? baseData?.[1]?.result : undefined,
  };
}

export type StockMarket = ReturnType<typeof useStockMarket>;

export function useAllowance(token: Address | undefined, owner: Address | undefined, spender: Address | undefined, chainId: AppChainId) {
  const {data} = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner ?? zeroAddress, spender ?? zeroAddress],
    chainId,
    query: {enabled: !!token && !!owner && !!spender},
  });
  return data;
}

export function useTokenBalance(token: Address | undefined, owner: Address | undefined, chainId: AppChainId) {
  const {data} = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner ?? zeroAddress],
    chainId,
    query: {enabled: !!token && !!owner},
  });
  return data;
}

export function approve(tx: Tx, token: Address, spender: Address, amount: bigint) {
  return tx.send({address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount]});
}

/// On-chain symbol of the pool asset ("USDG" on mainnet, "tUSDG" on the testnet stand-in).
export function useUsdgSymbol(d: Deployment | undefined, chainId: AppChainId): string {
  const {data} = useReadContract({
    address: d?.tokens.USDG,
    abi: erc20Abi,
    functionName: "symbol",
    chainId,
    query: {enabled: !!d, staleTime: Infinity, refetchInterval: false},
  });
  return data ?? "USDG";
}

/// Wrapper shares minted for `baseAmount` of the base xStock (ERC-4626 preview).
export function usePreviewDeposit(wrapper: Address | undefined, baseAmount: bigint, chainId: AppChainId) {
  const {data} = useReadContract({
    address: wrapper,
    abi: parseAbi(["function previewDeposit(uint256 assets) view returns (uint256)"]),
    functionName: "previewDeposit",
    args: [baseAmount],
    chainId,
    query: {enabled: !!wrapper && baseAmount > 0n},
  });
  return data;
}
