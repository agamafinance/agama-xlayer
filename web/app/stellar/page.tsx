'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Space_Grotesk } from 'next/font/google';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { useStellarState } from '@/lib/stellar/hooks';
import { fromBaseUnits } from '@/lib/stellar/client';
import { SHARE_PRICE_SCALE, STELLAR, explorerContract } from '@/lib/stellar/config';
import { CREDIT_VAULTS, CURATORS, type CreditVault, type Curator } from '@/lib/stellar/vaults';

// Tenka's brand font (their full logo is the mark + lowercase "tenka" in Space Grotesk).
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'] });

function netApy(allocs: { target_bps: number; apy_bps: number }[]): string {
  if (!allocs.length) return '—';
  const totalW = allocs.reduce((s, a) => s + a.target_bps, 0) || 1;
  const w = allocs.reduce((s, a) => s + a.apy_bps * a.target_bps, 0) / totalW;
  return `${(w / 100).toFixed(2)}%`;
}

export default function StellarEarnPage() {
  const { data } = useStellarState();
  const sharePrice = data ? Number(data.sharePrice) / SHARE_PRICE_SCALE : 1;
  const apy = data ? netApy(data.allocations) : '—';
  const tvl = data ? fromBaseUnits(data.nav, 0) : '—';

  return (
    <>
      {/* Header */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          {/* The coin pair, lifted verbatim from the grant banner (positions,
              overlap and shadows identical to the artwork). */}
          <div aria-hidden className="pointer-events-none absolute right-0 -top-2 z-20 hidden lg:block">
            <img src="/logos/coin-pair.svg" alt="" className="h-[300px] w-auto" />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            A synthetic dollar that earns
            <br />
            settled on Stellar
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Mint agUSD 1:1 from USDC, stake it for sagUSD and earn real yield from curated
            private credit vaults. Yield compounds into the share price. Nothing to claim.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Net APY" value={apy} />
            <Stat label="Vault NAV" value={`$${tvl}`} />
            <Stat label="sagUSD price" value={sharePrice.toFixed(4)} />
          </div>
        </div>
      </section>

      {/* Vaults */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">Vaults</h2>

          <VaultRow
            href="/stellar/swap"
            symbol="agUSD"
            name="Agama USD"
            blurb="Mint 1:1 from USDC · the synthetic dollar"
            right="1.00 / USDC"
            rightLabel="Peg"
          />
          <VaultRow
            href="/stellar/swap"
            symbol="sagUSD"
            name="Staked agUSD"
            blurb="Stake agUSD · yield-bearing token"
            right={apy}
            rightLabel="APY"
          />

          {/* Curated credit vaults */}
          <div className="flex flex-wrap items-center gap-3 pt-8 pb-2">
            <h2 className="text-[13px] uppercase tracking-wider text-fg-muted">
              Curated credit vaults
            </h2>
            <span className="flex items-center gap-3 text-[12px] text-fg-muted">
              curated by
              {CURATORS.map((c) => (
                <CuratorBrand key={c.name} curator={c} size="sm" />
              ))}
            </span>
          </div>
          <p className="text-[13px] text-fg-muted max-w-[680px] mb-4">
            Deposited capital is allocated across the vaults by Agama&apos;s{' '}
            <span className="text-fg">Allocation Engine</span>, an AI agent that rebalances
            target weights from yield, liquidity and risk. Realized yield is delivered back and
            lifts the sagUSD price.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CREDIT_VAULTS.map((v) => {
              const onchain = data?.allocations.find((a) => a.name === v.name);
              return <CreditVaultCard key={v.name} v={v} allocPct={onchain ? onchain.target_bps / 100 : undefined} />;
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="text-[26px] text-fg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function VaultRow({
  href,
  symbol,
  name,
  blurb,
  right,
  rightLabel,
}: {
  href: string;
  symbol: string;
  name: string;
  blurb: string;
  right: string;
  rightLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]"
    >
      <TokenIcon symbol={symbol} size={40} />
      <div>
        <div className="text-[15px] text-fg font-medium">
          {symbol} <span className="text-fg-muted font-normal">· {name}</span>
        </div>
        <div className="text-[13px] text-fg-muted">{blurb}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[11px] uppercase tracking-wider text-fg-muted">{rightLabel}</div>
        <div className="text-[16px] text-fg font-semibold tabular-nums">{right}</div>
      </div>
      <ArrowRight className="h-5 w-5 text-fg-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function CreditVaultCard({ v, allocPct }: { v: CreditVault; allocPct?: number }) {
  // Card opens the vault's on-chain contract on stellar.expert (testnet).
  const contractId = STELLAR.creditVaults[v.slug];
  return (
    <a
      href={explorerContract(contractId)}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-[#254839]/10">
          <img src={v.curator.logo} alt={v.curator.name} className="h-[22px] w-[22px] object-contain" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] text-fg font-medium leading-tight">{v.type}</div>
          <div className="text-[13px] text-fg-muted">{v.description}</div>
        </div>
        {allocPct !== undefined && (
          <span className="ml-auto shrink-0 rounded-full bg-[#254839]/[0.08] px-2.5 py-1 text-[11px] text-fg-muted">
            {allocPct.toFixed(0)}% alloc
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Field label="Yield Range" value={v.yieldApy} strong />
        {v.fields.map((f) => (
          <Field key={f.label} label={f.label} value={f.value} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#254839]/10 pt-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-muted">Curator</div>
          <div className="mt-1.5">
            <CuratorBrand curator={v.curator} />
          </div>
        </div>
        {v.badge && (
          <span className="rounded-full bg-[#C97A40]/15 px-2.5 py-1 text-[11px] font-medium text-[#A85A2C]">
            {v.badge}
          </span>
        )}
      </div>
    </a>
  );
}

/// Curator brand: official icon mark on the left + the curator name written out.
/// Same treatment for every curator so the cards stay visually consistent.
function CuratorBrand({ curator, size = 'md' }: { curator: Curator; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className="inline-flex items-center gap-1.5">
      <img src={curator.logo} alt="" className={`${h} object-contain`} />
      <span
        className={`${spaceGrotesk.className} ${
          size === 'sm' ? 'text-[13px]' : 'text-[15px]'
        } font-medium leading-none text-[#111318]`}
      >
        {curator.name.split(' ')[0]}
      </span>
    </span>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={strong ? 'text-[15px] text-fg font-semibold' : 'text-[14px] text-fg'}>
        {value}
      </div>
    </div>
  );
}
