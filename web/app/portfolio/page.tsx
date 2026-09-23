'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { encodeAbiParameters } from 'viem';
import { useAccount, useReadContracts } from 'wagmi';

import { addresses, abis } from '@/lib/contracts';
import { tranches, type Tranche } from '@/lib/tranches';
import { erc20Abi } from '@/lib/erc20';
import { fmt, AGYLD_DECIMALS, SAGYLD_DECIMALS } from '@/lib/format';
import { TokenIcon } from '@/components/icons/TokenIcon';
import AnimatedButton from '@/components/AnimatedButton';

const REFETCH_MS = 12_000;
const ZERO_DATA = encodeAbiParameters([{ type: 'uint256' }], [0n]);

export default function PortfolioPage() {
  const { address: account, isConnected } = useAccount();

  const userReads = useReadContracts({
    contracts: account
      ? [
          { address: addresses.USDr, abi: erc20Abi, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.DebtToken, abi: abis.DebtToken, functionName: 'balanceOf', args: [account] } as const,
        ]
      : [],
    query: { refetchInterval: REFETCH_MS, enabled: !!account },
  });

  const trancheReads = useReadContracts({
    contracts: account
      ? tranches.flatMap((t) => [
          { address: t.adapter, abi: abis.AmFiAdapter, functionName: 'balanceOf', args: [account] } as const,
          { address: t.adapter, abi: abis.AmFiAdapter, functionName: 'getAssetValue', args: [account, ZERO_DATA] } as const,
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'calculateHealthFactor', args: [t.adapter, account, ZERO_DATA] } as const,
          { address: addresses.DebtToken, abi: abis.DebtToken, functionName: 'balanceOf', args: [account, t.adapter] } as const,
        ])
      : [],
    query: { refetchInterval: REFETCH_MS, enabled: !!account },
  });

  const protocolReads = useReadContracts({
    contracts: [
      { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'totalAssets' } as const,
      { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'totalSupply' } as const,
      { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'totalAssets' } as const,
      { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'totalSupply' } as const,
    ],
    query: { refetchInterval: REFETCH_MS },
  });

  const usdrBalance = userReads.data?.[0]?.result as bigint | undefined;
  const agYLDBalance = userReads.data?.[1]?.result as bigint | undefined;
  const sagYLDBalance = userReads.data?.[2]?.result as bigint | undefined;
  const debt = userReads.data?.[3]?.result as bigint | undefined;

  const lpTotalAssets = protocolReads.data?.[0]?.result as bigint | undefined;
  const lpTotalSupply = protocolReads.data?.[1]?.result as bigint | undefined;
  const spTotalAssets = protocolReads.data?.[2]?.result as bigint | undefined;
  const spTotalSupply = protocolReads.data?.[3]?.result as bigint | undefined;

  // ratios scaled by 1e18 — wei units cancel.
  const lpSharePrice =
    lpTotalSupply && lpTotalSupply > 0n && lpTotalAssets
      ? (lpTotalAssets * 10n ** 18n) / lpTotalSupply
      : 10n ** 18n;
  const spSharePrice =
    spTotalSupply && spTotalSupply > 0n && spTotalAssets
      ? (spTotalAssets * 10n ** 18n) / spTotalSupply
      : 10n ** 18n;

  const agYLDAsUsdr = agYLDBalance ? (agYLDBalance * lpSharePrice) / 10n ** 18n : 0n;
  const sagYLDAsAgYLD = sagYLDBalance ? (sagYLDBalance * spSharePrice) / 10n ** 18n : 0n;
  const sagYLDAsUsdr = (sagYLDAsAgYLD * lpSharePrice) / 10n ** 18n;

  const trancheRows = tranches.map((t, i) => {
    const offset = i * 4;
    return {
      tranche: t,
      collateral: trancheReads.data?.[offset]?.result as bigint | undefined,
      value: trancheReads.data?.[offset + 1]?.result as bigint | undefined,
      hf: trancheReads.data?.[offset + 2]?.result as bigint | undefined,
      marketDebt: trancheReads.data?.[offset + 3]?.result as bigint | undefined,
    };
  });

  const totalCollateralValue = trancheRows.reduce((acc, r) => acc + (r.value ?? 0n), 0n);
  const lowestHf = trancheRows
    .filter((r) => (r.collateral ?? 0n) > 0n && r.hf !== undefined)
    .reduce<bigint | undefined>(
      (acc, r) => (acc === undefined || r.hf! < acc ? r.hf! : acc),
      undefined,
    );

  const totalNetWorth =
    (usdrBalance ?? 0n) + agYLDAsUsdr + sagYLDAsUsdr + totalCollateralValue - (debt ?? 0n);

  const activePositions = trancheRows.filter(
    (r) => (r.collateral ?? 0n) > 0n || (r.marketDebt ?? 0n) > 0n,
  );

  return (
    <>
      <section className="hero-glow px-6 md:px-24 pt-6 md:pt-16 pb-10 md:pb-14">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-fg font-light tracking-[-0.02em] text-[40px] md:text-[56px] leading-[1.0]">
                Portfolio
              </h1>
              <p className="mt-2 text-[14px] text-fg-muted max-w-xl">
                Aggregated view across the lending pool, the stability pool, and every collateral.
              </p>
            </div>
          </div>

          {isConnected && (
            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard label="Net worth" value={`${fmt(totalNetWorth)} USDr`} />
              <SummaryCard label="Wallet" value={`${fmt(usdrBalance)} USDr`} />
              <SummaryCard label="Collateral posted" value={`${fmt(totalCollateralValue)} USDr`} />
              <SummaryCard label="Total debt" value={`${fmt(debt ?? 0n)} USDr`} />
            </div>
          )}
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto">
          {!isConnected ? (
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  type="button"
                  onClick={openConnectModal}
                  className="w-full rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-10 text-center cursor-pointer"
                >
                  <h2 className="text-[18px] text-fg">Connect to view your portfolio</h2>
                  <p className="mt-2 text-[13px] text-fg-muted">
                    Your agYLD, sagYLD, collateral and debt across markets will appear here.
                  </p>
                </button>
              )}
            </ConnectButton.Custom>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <PositionCard
                href="/earn/agYLD"
                token="agYLD"
                title="Lender position"
                rows={[
                  { label: 'Your agYLD', value: `${fmt(agYLDBalance, AGYLD_DECIMALS)} agYLD` },
                  { label: 'agYLD value', value: `${fmt(lpSharePrice * 10n ** 6n, 18, 6)} USDr` },
                  { label: 'Equivalent', value: `${fmt(agYLDAsUsdr)} USDr` },
                ]}
              />
              <PositionCard
                href="/earn/sagYLD"
                token="sagYLD"
                title="Stability Pool position"
                rows={[
                  { label: 'Your sagYLD', value: `${fmt(sagYLDBalance, SAGYLD_DECIMALS)} sagYLD` },
                  { label: 'sagYLD value', value: `${fmt(sagYLDAsAgYLD, AGYLD_DECIMALS)} agYLD` },
                  { label: 'Equivalent', value: `${fmt(sagYLDAsUsdr)} USDr` },
                ]}
              />

              <div className="lg:col-span-2 rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[16px] text-fg">Borrow markets</h3>
                    <p className="text-[12px] text-fg-muted">
                      Each market has its own debt counter. Lowest HF:{' '}
                      <span className="text-fg">{lowestHf ? fmt(lowestHf, 27, 3) : '—'}</span>
                    </p>
                  </div>
                  <AnimatedButton
                    as="a"
                    href="/borrow"
                    variant="secondary"
                    fillColor="#254839"
                    borderColor="#254839"
                    textRestColor="#254839"
                    textHoverColor="#fdf8ed"
                    className="px-3 py-1 text-[12px]"
                  >
                    All markets →
                  </AnimatedButton>
                </div>

                {activePositions.length === 0 ? (
                  <p className="rounded-xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 px-4 py-3 text-[13px] text-fg-muted">
                    No active borrow positions yet.{' '}
                    <Link href="/borrow" className="text-fg hover:underline">
                      Browse markets →
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activePositions.map((r) => (
                      <BorrowRow key={r.tranche.symbol} row={r} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="mt-1 text-[20px] text-fg">{value}</div>
      {sub && <div className="text-[11px] text-fg-muted">{sub}</div>}
    </div>
  );
}

function PositionCard({
  href,
  token,
  title,
  rows,
}: {
  href: string;
  token: string;
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 hover:ring-[#254839]/30 transition"
    >
      <div className="flex items-center gap-3 mb-3">
        <TokenIcon symbol={token} size={32} />
        <div>
          <h3 className="text-[16px] text-fg">{title}</h3>
          <div className="text-[12px] text-fg-muted">{token}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-fg-muted">{r.label}</span>
            <span className="text-fg">{r.value}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function BorrowRow({
  row,
}: {
  row: {
    tranche: Tranche;
    collateral: bigint | undefined;
    value: bigint | undefined;
    hf: bigint | undefined;
    marketDebt: bigint | undefined;
  };
}) {
  const t = row.tranche;
  const tagClass =
    t.tranche === 'Senior'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-amber-100 text-amber-800';

  return (
    <Link
      href={`/borrow/${t.symbol}`}
      className="grid grid-cols-12 items-center gap-3 rounded-xl bg-[#254839]/[0.04] hover:bg-[#254839]/[0.08] ring-1 ring-[#254839]/10 px-4 py-3 text-[13px]"
    >
      <div className="col-span-4 flex items-center gap-2.5">
        <TokenIcon symbol={t.symbol} size={24} />
        <div>
          <div className="text-fg flex items-center gap-2">
            {t.symbol}
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${tagClass}`}>
              {t.tranche}
            </span>
          </div>
          <div className="text-[11px] text-fg-muted">{t.pool}</div>
        </div>
      </div>
      <div className="col-span-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-muted">Collateral</div>
        <div className="text-fg">{fmt(row.value)} USDr</div>
      </div>
      <div className="col-span-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-muted">Debt</div>
        <div className="text-fg">{fmt(row.marketDebt)} USDr</div>
      </div>
      <div className="col-span-2 text-right">
        <div className="text-[11px] uppercase tracking-wider text-fg-muted">Health</div>
        <div className={row.hf && row.hf < 1_100_000_000_000_000_000_000_000_000n ? 'text-rose-700' : 'text-fg'}>
          {row.hf ? fmt(row.hf, 27, 2) : '—'}
        </div>
      </div>
    </Link>
  );
}
