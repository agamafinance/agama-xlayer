'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useReadContracts } from 'wagmi';

import { addresses, abis } from '@/lib/contracts';
import { erc20Abi } from '@/lib/erc20';
import { tranches, ltPercent } from '@/lib/tranches';
import { fmtCompact } from '@/lib/format';
import { TokenIcon } from './icons/TokenIcon';

const REFETCH_MS = 12_000;

/// V3 Borrow markets — one per tranche. Borrow asset is always USDr.
/// Each row reads:
///   - pool collateral count    (token.balanceOf(adapter))
///   - share price              (token.pricePerShare())
///   - oracle price             (oracle.getPrice())
///   - per-market debt          (DebtToken.totalSupply(adapter))
/// Pool collateral USD value = count × pricePerShare × oraclePrice / 1e36.
export function MarketsTable() {
  const collatRead = useReadContracts({
    contracts: tranches.map(
      (t) => ({ address: t.token, abi: erc20Abi, functionName: 'balanceOf', args: [t.adapter] }) as const,
    ),
    query: { refetchInterval: REFETCH_MS },
  });
  const ppsRead = useReadContracts({
    contracts: tranches.map(
      (t) => ({ address: t.token, abi: abis.MockTrancheToken, functionName: 'pricePerShare' }) as const,
    ),
    query: { refetchInterval: REFETCH_MS },
  });
  const oracleRead = useReadContracts({
    contracts: tranches.map(
      (t) => ({ address: t.oracle, abi: abis.MockOracle, functionName: 'getPrice' }) as const,
    ),
    query: { refetchInterval: REFETCH_MS },
  });
  const debtRead = useReadContracts({
    contracts: tranches.map(
      (t) =>
        ({
          address: addresses.DebtToken,
          abi: abis.DebtToken,
          functionName: 'totalSupply',
          args: [t.adapter],
        }) as const,
    ),
    query: { refetchInterval: REFETCH_MS },
  });

  return (
    <div className="mt-4">
      {/* Desktop header */}
      <div className="hidden md:grid grid-cols-[minmax(200px,280px)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(140px,1fr)_120px_60px] items-center gap-6 px-5 pb-3 text-[12px] uppercase tracking-wider text-fg-muted">
        <div>Collateral</div>
        <div>Issuer</div>
        <div>Pool collateral</div>
        <div>Borrowed</div>
        <div>Max LTV</div>
        <div></div>
      </div>

      <div className="space-y-2">
        {tranches.map((t, i) => {
          const collat = collatRead.data?.[i]?.result as bigint | undefined;
          const pps = ppsRead.data?.[i]?.result as bigint | undefined;
          const price = oracleRead.data?.[i]?.result as bigint | undefined;
          const debt = debtRead.data?.[i]?.result as bigint | undefined;

          // collat (18) × pps (18) × price (18) / 1e36 → USD-denominated bigint at 18 decimals
          const collatUsd =
            collat !== undefined && pps !== undefined && price !== undefined
              ? (collat * pps * price) / 10n ** 36n
              : undefined;

          const tagClass =
            t.tranche === 'Senior'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800';

          return (
            <Link
              key={t.symbol}
              href={`/borrow/${t.symbol}`}
              className="block rounded-xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 hover:bg-[#254839]/[0.07] transition-colors"
            >
              {/* Desktop row */}
              <div className="hidden md:grid grid-cols-[minmax(200px,280px)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(140px,1fr)_120px_60px] items-center gap-6 px-5 py-4">
                <div className="flex items-center gap-3 text-[15px] text-fg">
                  <TokenIcon symbol={t.symbol} size={28} />
                  <div className="flex flex-col leading-tight">
                    <span className="flex items-center gap-2">
                      {t.symbol}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${tagClass}`}
                      >
                        {t.tranche}
                      </span>
                    </span>
                    <span className="text-[11px] text-fg-muted">{t.pool}</span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[14px] text-fg">
                  <img
                    src="/logos/amfi.png"
                    alt="AmFi"
                    style={{ height: 28, width: 28 }}
                    className="rounded-full object-cover"
                  />
                  <span>AmFi</span>
                </div>
                <div className="text-[14px] text-fg">
                  {collatUsd !== undefined ? `$${fmtCompact(collatUsd)}` : '—'}
                </div>
                <div className="text-[14px] text-fg">
                  {debt !== undefined ? `$${fmtCompact(debt)}` : '—'}
                </div>
                <div className="text-[14px] text-fg">{ltPercent(t)}</div>
                <div className="flex justify-end">
                  <ArrowRight className="h-4 w-4 text-fg-muted" />
                </div>
              </div>

              {/* Mobile card */}
              <div className="md:hidden p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-[15px] text-fg">
                    <TokenIcon symbol={t.symbol} size={28} />
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium flex items-center gap-2">
                        {t.symbol}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${tagClass}`}
                        >
                          {t.tranche}
                        </span>
                      </span>
                      <span className="text-[11px] text-fg-muted">{t.pool}</span>
                    </div>
                  </div>
                  <span className="text-[15px] text-fg font-medium">{ltPercent(t)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-[#254839]/10">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] uppercase tracking-wider text-fg-muted">Pool collateral</span>
                    <span className="text-[13px] text-fg">
                      {collatUsd !== undefined ? `$${fmtCompact(collatUsd)}` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] uppercase tracking-wider text-fg-muted">Borrowed</span>
                    <span className="text-[13px] text-fg">
                      {debt !== undefined ? `$${fmtCompact(debt)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
