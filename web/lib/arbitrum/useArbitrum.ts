'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createPublicClient, createWalletClient, custom, http, formatUnits,
} from 'viem';
import { arbitrumSepolia, ADDR, VAULTS, WAD, USDC, MAX_UINT } from './config';
import { POOL_ABI, ORACLE_ABI, VAULT_ABI, ERC20_ABI, SAGUSD_ABI } from './abis';

export const pub = createPublicClient({ chain: arbitrumSepolia, transport: http() });

export interface PoolStats {
  cash: number; borrows: number; utilization: number; borrowRate: number; supplyRate: number;
  sagusdPrice: number; sagusdTvl: number;
}
export interface VaultLive { key: string; nav: number; tvl: number; }
export interface Account {
  address: `0x${string}`; usdc: number; agusd: number; sagusd: number;
  debt: number; collateralUsd: number; hf: number | null;
  collateral: Record<string, number>;
}

const n = (v: bigint, d = 18) => Number(formatUnits(v, d));

export function useArbitrumData(address?: `0x${string}`) {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [vaults, setVaults] = useState<Record<string, VaultLive>>({});
  const [account, setAccount] = useState<Account | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cash, borrows, util, br, sr, saPrice, saAssets] = await Promise.all([
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'cash' }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'totalBorrows' }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'utilization' }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'borrowRateView' }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'supplyRateView' }),
          pub.readContract({ address: ADDR.SagUSD, abi: SAGUSD_ABI, functionName: 'pricePerShare' }),
          pub.readContract({ address: ADDR.SagUSD, abi: SAGUSD_ABI, functionName: 'totalAssets' }),
        ]);
        if (!alive) return;
        setStats({
          cash: n(cash, 6), borrows: n(borrows, 6), utilization: n(util) * 100,
          borrowRate: n(br) * 100, supplyRate: n(sr) * 100,
          sagusdPrice: n(saPrice), sagusdTvl: n(saAssets),
        });
        const vl: Record<string, VaultLive> = {};
        await Promise.all(VAULTS.map(async (v) => {
          const [nav, supply] = await Promise.all([
            pub.readContract({ address: ADDR.NavOracle, abi: ORACLE_ABI, functionName: 'navOf', args: [v.address] }),
            pub.readContract({ address: v.address, abi: VAULT_ABI, functionName: 'totalSupply' }),
          ]);
          vl[v.key] = { key: v.key, nav: n(nav), tvl: n(nav) * n(supply) };
        }));
        if (alive) setVaults(vl);
      } catch (e) { console.error('arb read', e); }
    })();
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    if (!address) { setAccount(null); return; }
    let alive = true;
    (async () => {
      try {
        const [usdc, agusd, sagusd, debt, colUsd, hfRaw] = await Promise.all([
          pub.readContract({ address: ADDR.MockUSDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
          pub.readContract({ address: ADDR.AgUSD, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
          pub.readContract({ address: ADDR.SagUSD, abi: SAGUSD_ABI, functionName: 'balanceOf', args: [address] }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'debtOf', args: [address] }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'collateralValue', args: [address] }),
          pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'healthFactor', args: [address] }),
        ]);
        const col: Record<string, number> = {};
        await Promise.all(VAULTS.map(async (v) => {
          const s = await pub.readContract({ address: ADDR.LendingPool, abi: POOL_ABI, functionName: 'collateralShares', args: [address, v.address] });
          col[v.key] = n(s);
        }));
        if (!alive) return;
        const debtUsd = n(debt, 6);
        // No (user-facing) debt => infinite health factor. This also guards against the
        // wei-dust scaled-debt artifact, where debtOf() reads 0 but healthFactor() returns
        // a huge finite number; treat that as ∞ rather than showing a monstrous value.
        const hf = debtUsd < 0.01 || hfRaw >= (2n ** 255n) || hfRaw > (10n ** 6n * 10n ** 18n) ? null : n(hfRaw);
        setAccount({ address, usdc: n(usdc, 6), agusd: n(agusd), sagusd: n(sagusd), debt: debtUsd, collateralUsd: n(colUsd, 6), hf, collateral: col });
      } catch (e) { console.error('arb acct', e); }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  return { stats, vaults, account, refresh };
}

// ---- wallet (injected) ----
export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const connect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) { alert('Install MetaMask or Rabby'); return; }
    const [acc] = await eth.request({ method: 'eth_requestAccounts' });
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x66eee' }] });
    } catch (e: any) {
      if (e.code === 4902) await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x66eee', chainName: 'Arbitrum Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'], blockExplorerUrls: ['https://sepolia.arbiscan.io'] }] });
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
  return createWalletClient({ chain: arbitrumSepolia, transport: custom(eth) });
}

// generic write with receipt wait
export async function send(address: `0x${string}`, to: `0x${string}`, abi: any, fn: string, args: any[]) {
  const wc = await walletClient();
  const hash = await wc.writeContract({ account: address, address: to, abi, functionName: fn, args, chain: arbitrumSepolia });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function ensureAllowance(address: `0x${string}`, token: `0x${string}`, spender: `0x${string}`, need: bigint) {
  const cur = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [address, spender] });
  if (cur < need) await send(address, token, ERC20_ABI, 'approve', [spender, MAX_UINT]);
}

// Bundle of write helpers bound to the connected address; auto-refreshes data.
export function useWalletActions(address: `0x${string}` | undefined, refresh: () => void) {
  return {
    async write(to: `0x${string}`, abi: any, fn: string, args: any[]) {
      if (!address) throw new Error('connect wallet');
      await send(address, to, abi, fn, args);
      refresh();
    },
    async ensure(token: `0x${string}`, spender: `0x${string}`, need: bigint) {
      if (!address) throw new Error('connect wallet');
      await ensureAllowance(address, token, spender, need);
    },
  };
}

export { ADDR, VAULTS, WAD, USDC, MAX_UINT };
