'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useReadContracts } from 'wagmi';

import { addresses, abis } from '@/lib/contracts';
import { fmtCompact, fmtRayApr, AGYLD_DECIMALS } from '@/lib/format';
import { TokenIcon } from './icons/TokenIcon';
import { CuratorBadge } from './CuratorBadge';

const REFETCH_MS = 12_000;

/// Two on-protocol vaults exposed on the Earn page:
///   1. agYLD vault — deposit USDr, mint agYLD, earn lender APY
///   2. sagYLD vault — stake agYLD, mint sagYLD, capture liquidation premiums
export function VaultsTable() {
  // Lending-pool reads (2): TVL (in USDr) + reserve state for the lender APY.
  // The wrapped-share supply and cash columns were dropped from this surface.
  const lpRead = useReadContracts({
    contracts: [
      {address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'totalAssets'} as const,
      {address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'getReserveState'} as const,
    ],
    query: {refetchInterval: REFETCH_MS},
  });

  // Stability-pool reads (2): agYLD held + sagYLD supply.
  const spRead = useReadContracts({
    contracts: [
      {address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'totalAssets'} as const,
      {address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'totalSupply'} as const,
    ],
    query: {refetchInterval: REFETCH_MS},
  });

  const lpTotalAssets = lpRead.data?.[0]?.result as bigint | undefined;
  const reserveState = lpRead.data?.[1]?.result as
    | {
        liquidityIndex: bigint;
        usageIndex: bigint;
        currentLiquidityRate: bigint;
        currentBorrowRate: bigint;
        lastUpdate: bigint;
      }
    | undefined;
  const spTotalAssets = spRead.data?.[0]?.result as bigint | undefined;
  const spTotalSupply = spRead.data?.[1]?.result as bigint | undefined;

  const lenderApy = reserveState?.currentLiquidityRate;

  const vaults = [
    {
      symbol: 'agYLD',
      name: 'Lending Pool',
      asset: 'USDr',
      depositsUsd: lpTotalAssets !== undefined ? `$${fmtCompact(lpTotalAssets)}` : '—',
      apy: fmtRayApr(lenderApy),
      href: '/earn/agYLD',
    },
    {
      symbol: 'sagYLD',
      name: 'Stability Pool',
      asset: 'agYLD',
      depositsUsd:
        spTotalAssets !== undefined ? `${fmtCompact(spTotalAssets, AGYLD_DECIMALS)} agYLD` : '—',
      apy: 'Variable',
      href: '/earn/sagYLD',
    },
  ];

  return (
    <div className="mt-4">
      {/* Desktop header */}
      <div className="hidden md:grid grid-cols-[minmax(200px,280px)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(140px,1fr)_120px_60px] items-center gap-6 px-5 pb-3 text-[12px] uppercase tracking-wider text-fg-muted">
        <div>Vault</div>
        <div>Total deposits</div>
        <div>Curator</div>
        <div>Chain</div>
        <div>APY</div>
        <div></div>
      </div>

      <div className="space-y-2">
        {vaults.map((v) => (
          <Link
            key={v.symbol}
            href={v.href}
            className="block rounded-xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 hover:bg-[#254839]/[0.07] transition-colors"
          >
            {/* Desktop row */}
            <div className="hidden md:grid grid-cols-[minmax(200px,280px)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(140px,1fr)_120px_60px] items-center gap-6 px-5 py-4">
              <div className="flex items-center gap-3 text-[15px] text-fg">
                <TokenIcon symbol={v.symbol} size={28} />
                <div className="flex flex-col leading-tight">
                  <span className="font-medium">{v.symbol}</span>
                  <span className="text-[12px] text-fg-muted">{v.name}</span>
                </div>
              </div>
              <div className="text-[14px] text-fg">{v.depositsUsd}</div>
              <div>
                <CuratorBadge name="Agama" size={28} />
              </div>
              <div className="inline-flex items-center gap-1.5 text-[14px] text-fg">
                <img
                  src="/rayls.png"
                  alt="Rayls"
                  style={{ height: 28, width: 28 }}
                  className="rounded-full object-cover block"
                />
                <span>Rayls</span>
              </div>
              <div className="text-[14px] text-fg">{v.apy}</div>
              <div className="flex justify-end">
                <ArrowRight className="h-4 w-4 text-fg-muted" />
              </div>
            </div>

            {/* Mobile card */}
            <div className="md:hidden p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[15px] text-fg">
                  <TokenIcon symbol={v.symbol} size={28} />
                  <div className="flex flex-col">
                    <span className="font-medium">{v.symbol}</span>
                    <span className="text-[12px] text-fg-muted">{v.name}</span>
                  </div>
                </div>
                <span className="text-[15px] text-fg font-medium">{v.apy}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-[#254839]/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wider text-fg-muted">Total deposits</span>
                  <span className="text-[13px] text-fg">{v.depositsUsd}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wider text-fg-muted">Chain</span>
                  <span className="text-[13px] text-fg flex items-center gap-1.5">
                    <img src="/rayls.png" alt="Rayls" className="h-[18px] w-[18px] rounded-full object-cover" />
                    Rayls
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
