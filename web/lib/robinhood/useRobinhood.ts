'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, formatUnits } from 'viem';
import {
  robinhoodTestnet, ADDR, MARKET_PARAMS, MARKET_ID, LLTV,
  ORACLE_PRICE_DECIMALS, USDC_DECIMALS, TSLA_DECIMALS, MAX_UINT,
} from './config';
import { MORPHO_ABI, ORACLE_ABI, ERC20_ABI } from './abis';

export const pub = createPublicClient({ chain: robinhoodTestnet, transport: http() });

export interface MarketState {
  priceUsd: number;      // mUSDC per 1 TSLA, from our oracle
  totalSupply: number;   // mUSDC supplied to the market
  totalBorrow: number;   // mUSDC borrowed
  liquidity: number;     // mUSDC available to borrow
  utilization: number;   // %
  lltv: number;          // 0.85
}

export interface Account {
  address: `0x${string}`;
  tsla: number;           // wallet TSLA
  musdc: number;          // wallet mUSDC
  collateral: number;     // TSLA posted as collateral
  collateralUsd: number;  // valued by the oracle
  debt: number;           // mUSDC owed
  maxBorrow: number;      // additional mUSDC borrowable at the LLTV
  hf: number | null;      // collateral·LLTV / debt, null when no debt
}

const n = (v: bigint, d: number) => Number(formatUnits(v, d));

// Morpho SharesMathLib.toAssetsUp with its virtual shares/assets.
const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;
function sharesToAssetsUp(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  const denom = totalShares + VIRTUAL_SHARES;
  return (shares * (totalAssets + VIRTUAL_ASSETS) + denom - 1n) / denom;
}

export function useRobinhoodData(address?: `0x${string}`) {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [price, m] = await Promise.all([
          pub.readContract({ address: ADDR.Oracle, abi: ORACLE_ABI, functionName: 'price' }),
          pub.readContract({ address: ADDR.Morpho, abi: MORPHO_ABI, functionName: 'market', args: [MARKET_ID] }),
        ]);
        if (!alive) return;
        const [totalSupplyAssets, , totalBorrowAssets] = m;
        const totalSupply = n(totalSupplyAssets, USDC_DECIMALS);
        const totalBorrow = n(totalBorrowAssets, USDC_DECIMALS);
        setMarket({
          priceUsd: n(price, ORACLE_PRICE_DECIMALS),
          totalSupply,
          totalBorrow,
          liquidity: totalSupply - totalBorrow,
          utilization: totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0,
          lltv: n(LLTV, 18),
        });
      } catch (e) { console.error('rh market read', e); }
    })();
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    if (!address) { setAccount(null); return; }
    let alive = true;
    (async () => {
      try {
        const [tsla, musdc, pos, m, price] = await Promise.all([
          pub.readContract({ address: ADDR.TSLA, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
          pub.readContract({ address: ADDR.MockUSDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
          pub.readContract({ address: ADDR.Morpho, abi: MORPHO_ABI, functionName: 'position', args: [MARKET_ID, address] }),
          pub.readContract({ address: ADDR.Morpho, abi: MORPHO_ABI, functionName: 'market', args: [MARKET_ID] }),
          pub.readContract({ address: ADDR.Oracle, abi: ORACLE_ABI, functionName: 'price' }),
        ]);
        if (!alive) return;
        const [, borrowShares, collateral] = pos;
        const [, , totalBorrowAssets, totalBorrowShares] = m;
        const debtRaw = sharesToAssetsUp(BigInt(borrowShares), BigInt(totalBorrowAssets), BigInt(totalBorrowShares));
        // collateral value in loan-token base units: collateral · price / 1e36 (Morpho convention)
        const collateralUsdRaw = (BigInt(collateral) * price) / 10n ** 36n;
        const maxDebtRaw = (collateralUsdRaw * LLTV) / 10n ** 18n;
        const debt = n(debtRaw, USDC_DECIMALS);
        const maxDebt = n(maxDebtRaw, USDC_DECIMALS);
        setAccount({
          address,
          tsla: n(tsla, TSLA_DECIMALS),
          musdc: n(musdc, USDC_DECIMALS),
          collateral: n(BigInt(collateral), TSLA_DECIMALS),
          collateralUsd: n(collateralUsdRaw, USDC_DECIMALS),
          debt,
          maxBorrow: Math.max(0, maxDebt - debt),
          hf: debt < 0.01 ? null : maxDebt / debt,
        });
      } catch (e) { console.error('rh acct read', e); }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  return { market, account, refresh };
}

// ---- wallet (injected) ----
export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const connect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) { alert('Install MetaMask or Rabby'); return; }
    const [acc] = await eth.request({ method: 'eth_requestAccounts' });
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xb626' }] });
    } catch (e: any) {
      if (e.code === 4902) await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xb626', chainName: 'Robinhood Chain Testnet', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.testnet.chain.robinhood.com'], blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com'] }] });
    }
    setAddress(acc);
  }, []);
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: 'eth_accounts' }).then((a: string[]) => { if (a[0]) setAddress(a[0] as `0x${string}`); });
  }, []);
  return { address, connect };
}

export async function walletClient() {
  const eth = (window as any).ethereum;
  return createWalletClient({ chain: robinhoodTestnet, transport: custom(eth) });
}

export async function send(address: `0x${string}`, to: `0x${string}`, abi: any, fn: string, args: any[]) {
  const wc = await walletClient();
  const hash = await wc.writeContract({ account: address, address: to, abi, functionName: fn, args, chain: robinhoodTestnet });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function ensureAllowance(address: `0x${string}`, token: `0x${string}`, spender: `0x${string}`, need: bigint) {
  const cur = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [address, spender] });
  if (cur < need) await send(address, token, ERC20_ABI, 'approve', [spender, MAX_UINT]);
}

// Write helpers for the one prototype market, bound to the connected address.
export function useMarketActions(address: `0x${string}` | undefined, refresh: () => void) {
  const req = (a?: `0x${string}`): `0x${string}` => { if (!a) throw new Error('connect wallet'); return a; };
  return {
    async supplyCollateral(assets: bigint) {
      const a = req(address);
      await ensureAllowance(a, ADDR.TSLA, ADDR.Morpho, assets);
      await send(a, ADDR.Morpho, MORPHO_ABI, 'supplyCollateral', [MARKET_PARAMS, assets, a, '0x']);
      refresh();
    },
    async withdrawCollateral(assets: bigint) {
      const a = req(address);
      await send(a, ADDR.Morpho, MORPHO_ABI, 'withdrawCollateral', [MARKET_PARAMS, assets, a, a]);
      refresh();
    },
    async borrow(assets: bigint) {
      const a = req(address);
      await send(a, ADDR.Morpho, MORPHO_ABI, 'borrow', [MARKET_PARAMS, assets, 0n, a, a]);
      refresh();
    },
    async repay(assets: bigint) {
      const a = req(address);
      await ensureAllowance(a, ADDR.MockUSDC, ADDR.Morpho, assets);
      await send(a, ADDR.Morpho, MORPHO_ABI, 'repay', [MARKET_PARAMS, assets, 0n, a, '0x']);
      refresh();
    },
    async supplyLiquidity(assets: bigint) {
      const a = req(address);
      await ensureAllowance(a, ADDR.MockUSDC, ADDR.Morpho, assets);
      await send(a, ADDR.Morpho, MORPHO_ABI, 'supply', [MARKET_PARAMS, assets, 0n, a, '0x']);
      refresh();
    },
    async mintUsdc(assets: bigint) {
      const a = req(address);
      await send(a, ADDR.MockUSDC, ERC20_ABI, 'mint', [a, assets]);
      refresh();
    },
  };
}
