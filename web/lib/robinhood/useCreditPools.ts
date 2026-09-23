'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { pub } from './useRobinhood';
import { USDC_DECIMALS } from './config';
import { AGAMA_CREDIT_VAULTS, CREDIT_VAULT_ABI } from './agtsla';

export interface PoolBalance {
  key: string;
  balanceUsd: number; // mUSDC held by the pool (its totalAssets)
}

export interface CreditPools {
  balances: Record<string, number>; // key -> balanceUsd
  total: number;
}

const n = (v: bigint, d: number) => Number(formatUnits(v, d));

/** Live balance (totalAssets) of every curated credit pool. */
export function useCreditPools(): { data: CreditPools | null } {
  const [data, setData] = useState<CreditPools | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await Promise.all(
          AGAMA_CREDIT_VAULTS.map(async (p): Promise<PoolBalance> => {
            const ta = await pub
              .readContract({ address: p.address, abi: CREDIT_VAULT_ABI, functionName: 'totalAssets' })
              .catch(() => 0n);
            return { key: p.key, balanceUsd: n(ta as bigint, USDC_DECIMALS) };
          }),
        );
        if (!alive) return;
        const balances: Record<string, number> = {};
        rows.forEach((r) => (balances[r.key] = r.balanceUsd));
        setData({ balances, total: rows.reduce((s, r) => s + r.balanceUsd, 0) });
      } catch (e) {
        console.error('rh credit pools read', e);
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return { data };
}
