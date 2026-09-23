'use client';

import { useAccount, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CoinSlot } from './CoinSlot';
import AnimatedButton from './AnimatedButton';
import { addresses, abis } from '@/lib/contracts';
import { fmt } from '@/lib/format';

const HERO_REFETCH_MS = 12_000;

export function Hero({
  statLabel,
  statValue,
  /// When set, Hero overrides the static `statValue` with a live on-chain read:
  ///   - "totalDeposits" → LendingPool.totalAssets() — total USDr in the pool
  ///   - "totalLoans"    → DebtToken.totalSupply()    — outstanding debt across markets
  statSource,
  title,
  ctaLabel = 'Connect Wallet',
  connectedCtaLabel,
  scrollTargetId,
  illustration,
}: {
  statLabel: string;
  statValue: string;
  statSource?: 'totalDeposits' | 'totalLoans';
  title: React.ReactNode;
  ctaLabel?: string;
  connectedCtaLabel?: string;
  scrollTargetId?: string;
  illustration?: React.ReactNode;
}) {
  const { isConnected } = useAccount();
  const onConnectedClick = () => {
    if (!scrollTargetId) return;
    document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const liveDeposits = useReadContract({
    address: addresses.LendingPool,
    abi: abis.LendingPool,
    functionName: 'totalAssets',
    query: { refetchInterval: HERO_REFETCH_MS, enabled: statSource === 'totalDeposits' },
  });
  const liveLoans = useReadContract({
    address: addresses.DebtToken,
    abi: abis.DebtToken,
    functionName: 'totalSupply',
    query: { refetchInterval: HERO_REFETCH_MS, enabled: statSource === 'totalLoans' },
  });

  let displayStat = statValue;
  if (statSource === 'totalDeposits') {
    const v = liveDeposits.data as bigint | undefined;
    displayStat = v !== undefined ? `$${fmt(v)}` : statValue;
  } else if (statSource === 'totalLoans') {
    const v = liveLoans.data as bigint | undefined;
    displayStat = v !== undefined ? `$${fmt(v)}` : statValue;
  }

  const statChip = (
    <div className="stat-chip inline-flex items-center gap-3 rounded-full px-4 py-1.5 text-[13px] text-fg-muted">
      <span>{statLabel}</span>
      <span className="text-fg">{displayStat}</span>
    </div>
  );

  // Both states render an invisible "Connect Wallet" span to reserve the
  // baseline width — so the visible label ("Browse vaults" etc.) sits on top
  // without ever changing the button size.
  const labelWithGhost = (visible: string) => (
    <span className="relative inline-block">
      <span className="invisible whitespace-nowrap">{ctaLabel}</span>
      <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
        {visible}
      </span>
    </span>
  );

  const cta = (className: string) =>
    isConnected ? (
      <AnimatedButton
        variant="primary"
        fillBackground="linear-gradient(180deg, #2E5944 0%, #1F3D31 100%)"
        fillBoxShadow="0 8px 30px rgba(20, 50, 35, 0.28)"
        className={className}
        onClick={onConnectedClick}
      >
        {labelWithGhost(connectedCtaLabel ?? 'Browse vaults')}
      </AnimatedButton>
    ) : (
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <AnimatedButton
            variant="primary"
            fillBackground="linear-gradient(180deg, #2E5944 0%, #1F3D31 100%)"
            fillBoxShadow="0 8px 30px rgba(20, 50, 35, 0.28)"
            className={className}
            onClick={openConnectModal}
          >
            {labelWithGhost(ctaLabel)}
          </AnimatedButton>
        )}
      </ConnectButton.Custom>
    );

  return (
    <section className="hero-glow relative overflow-hidden px-6 md:px-24 pt-4 md:pt-[124px] pb-12 md:pb-28">
      {/* Single illustration: inline-centered on mobile, absolute right on desktop */}
      <div className="flex justify-center md:block md:absolute md:right-[4%] md:top-[9%] md:w-[480px] coin-shadow pointer-events-none">
        <div className="w-[220px] md:w-full">
          {illustration ?? <CoinSlot className="w-full h-auto" />}
        </div>
      </div>

      {/* Mobile content: chip, title, CTA — all centered, pulled up close to illustration */}
      <div className="md:hidden -mt-8 flex flex-col items-center text-center">
        {statChip}
        <h1 className="mt-4 text-fg font-light tracking-[-0.02em] text-[44px] leading-[1.05]">
          {title}
        </h1>
        {cta('mt-6 px-10 py-4 text-[15px] font-medium')}
      </div>

      {/* Desktop content: chip, title, CTA on left */}
      <div className="hidden md:block relative z-10 max-w-[1400px] mx-auto">
        {statChip}
        <h1 className="mt-12 text-fg font-light tracking-[-0.02em] text-[88px] leading-[1.0]">
          {title}
        </h1>
        {cta('mt-12 px-10 py-4 text-[15px] font-medium')}
      </div>
    </section>
  );
}
