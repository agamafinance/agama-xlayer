'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { pub } from './useRobinhood';
import { ORACLE_PRICE_DECIMALS } from './config';
import { STOCK_VAULTS, AGTSLA_VAULT_ABI } from './agtsla';
import { ORACLE_ABI } from './abis';

// One agStock vault's live figures. Mirrors the per-token slice of Stellar's
// useStellarState so the page can render live NAV + price with no wallet.
export interface StockStat {
  symbol: string;      // agTSLA
  stockSymbol: string; // TSLA
  priceUsd: number;    // live oracle price (falls back to the seed price)
  navUsd: number;      // totalAssets · price, in dollars
  vault: `0x${string}`;
}

export interface RobinhoodStats {
  stocks: StockStat[];
  navUsd: number; // total value under management across the family
}

const n = (v: bigint, d: number) => Number(formatUnits(v, d));

/** Live protocol state across the whole agStock family, refetched on an interval. */
export function useRobinhoodStats(): { data: RobinhoodStats | null } {
  const [data, setData] = useState<RobinhoodStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const stocks = await Promise.all(
          STOCK_VAULTS.map(async (s): Promise<StockStat> => {
            const [price, totalAssets] = await Promise.all([
              pub.readContract({ address: s.oracle, abi: ORACLE_ABI, functionName: 'price' }).catch(() => 0n),
              pub.readContract({ address: s.vault, abi: AGTSLA_VAULT_ABI, functionName: 'totalAssets' }).catch(() => 0n),
            ]);
            const priceUsd = price && (price as bigint) > 0n ? n(price as bigint, ORACLE_PRICE_DECIMALS) : s.priceUsd;
            const navUsd = n(totalAssets as bigint, 18) * priceUsd;
            return { symbol: s.symbol, stockSymbol: s.stockSymbol, priceUsd, navUsd, vault: s.vault };
          }),
        );
        if (!alive) return;
        setData({ stocks, navUsd: stocks.reduce((sum, s) => sum + s.navUsd, 0) });
      } catch (e) {
        console.error('rh stats read', e);
      }
    };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { data };
}
