'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Space_Grotesk } from 'next/font/google';
import { parseUnits } from 'viem';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { CREDIT_VAULTS, CURATORS, arbVault, arbiscan, type CreditVault, type Curator } from '@/lib/arbitrum/vaults';
import { ADDR } from '@/lib/arbitrum/config';
import { POOL_ABI, SAGUSD_ABI } from '@/lib/arbitrum/abis';
import { useArbitrumData, useWalletActions } from '@/lib/arbitrum/useArbitrum';
import { useArbWallet } from '@/lib/arbitrum/WalletProvider';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'] });

export default function ArbitrumEarn() {
  const { address } = useArbWallet();
  const { stats, vaults, account, refresh } = useArbitrumData(address);
  const act = useWalletActions(address, refresh);

  const apy = stats ? `${stats.supplyRate.toFixed(2)}%` : '—';
  const tvl = stats ? `$${(stats.cash + stats.borrows).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
  const sharePrice = stats ? stats.sagusdPrice.toFixed(4) : '—';

  const [lend, setLend] = useState('');
  const [stake, setStake] = useState('');

  return (
    <>
      {/* Header */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <div aria-hidden className="pointer-events-none absolute right-0 -top-2 z-20 hidden lg:block">
            <img src="/logos/coin-pair.svg" alt="" className="h-[300px] w-auto" />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            A synthetic dollar that earns
            <br />
            settled on Arbitrum
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Mint agUSD 1:1 from USDC, stake it for sagUSD and earn real yield from curated
            private credit vaults. Yield compounds into the share price. Nothing to claim.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Net APY" value={apy} />
            <Stat label="Pool TVL" value={tvl} />
            <Stat label="sagUSD price" value={sharePrice} />
          </div>
        </div>
      </section>

      {/* Vaults */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">Assets</h2>

          <AssetRow
            symbol="USDC"
            name="USD Coin"
            blurb="Deposit to mint agUSD · faucet for test USDC"
            right={account ? account.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            rightLabel="Balance"
          />
          <AssetRow
            symbol="agUSD"
            name="Agama USD"
            blurb="Mint 1:1 from USDC · the synthetic dollar"
            right="1.00 / USDC"
            rightLabel="Peg"
          />
          <AssetRow
            symbol="sagUSD"
            name="Staked agUSD"
            blurb="Stake agUSD · yield-bearing token"
            right={apy}
            rightLabel="APY"
          />

          {/* Lend + stake (the only actions on Earn, in the same card language) */}
          <div className="grid gap-4 md:grid-cols-2 pt-4">
            <ActionCard
              title="Lend USDC → agUSD"
              blurb="Receipt token, redeemable 1:1 while liquidity allows."
              balance={account ? `${account.usdc.toFixed(2)} USDC` : '—'}
              held={account ? `${account.agusd.toFixed(2)} agUSD` : '—'}
              value={lend}
              onChange={setLend}
              suffix="USDC"
              primaryLabel="Lend"
              onPrimary={async () => {
                const amt = parseUnits(lend || '0', 6);
                await act.ensure(ADDR.MockUSDC, ADDR.LendingPool, amt);
                await act.write(ADDR.LendingPool, POOL_ABI, 'lend', [amt]);
                setLend('');
              }}
              secondaryLabel="Withdraw"
              onSecondary={async () => {
                await act.write(ADDR.LendingPool, POOL_ABI, 'withdraw', [parseUnits(lend || '0', 6)]);
                setLend('');
              }}
              disabled={!address}
            />
            <ActionCard
              title="Stake agUSD → sagUSD"
              blurb="Earn the protocol yield. Unstake any time."
              balance={account ? `${account.agusd.toFixed(2)} agUSD` : '—'}
              held={account ? `${account.sagusd.toFixed(2)} sagUSD` : '—'}
              value={stake}
              onChange={setStake}
              suffix="agUSD"
              primaryLabel="Stake"
              onPrimary={async () => {
                const amt = parseUnits(stake || '0', 18);
                await act.ensure(ADDR.AgUSD, ADDR.SagUSD, amt);
                await act.write(ADDR.SagUSD, SAGUSD_ABI, 'stake', [amt]);
                setStake('');
              }}
              secondaryLabel="Unstake"
              onSecondary={async () => {
                await act.write(ADDR.SagUSD, SAGUSD_ABI, 'unstake', [parseUnits(stake || '0', 18)]);
                setStake('');
              }}
              disabled={!address}
            />
          </div>

          {/* Curated credit vaults */}
          <div className="flex flex-wrap items-center gap-3 pt-10 pb-2">
            <h2 className="text-[13px] uppercase tracking-wider text-fg-muted">Curated credit vaults</h2>
            <span className="flex items-center gap-3 text-[12px] text-fg-muted">
              curated by
              {CURATORS.map((c) => (
                <CuratorBrand key={c.name} curator={c} size="sm" />
              ))}
            </span>
          </div>
          <p className="text-[13px] text-fg-muted max-w-[680px] mb-4">
            Borrowers post these tokenized real-world credit vaults as collateral. Each is priced
            on-chain by the NAV oracle; realized yield lifts the sagUSD share price.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CREDIT_VAULTS.map((v) => {
              const a = arbVault(v.name);
              const nav = a ? vaults[a.key]?.nav : undefined;
              return <CreditVaultCard key={v.name} v={v} addr={a?.address} nav={nav} />;
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

function AssetRow({ symbol, name, blurb, right, rightLabel }: { symbol: string; name: string; blurb: string; right: string; rightLabel: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
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
    </div>
  );
}

function ActionCard({ title, blurb, balance, held, value, onChange, suffix, primaryLabel, onPrimary, secondaryLabel, onSecondary, disabled }: {
  title: string; blurb: string; balance: string; held: string; value: string; onChange: (v: string) => void; suffix: string;
  primaryLabel: string; onPrimary: () => Promise<void>; secondaryLabel: string; onSecondary: () => Promise<void>; disabled?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = (label: string, fn: () => Promise<void>) => async () => {
    setErr(null); setBusy(label);
    try { await fn(); } catch (e: any) { setErr(e?.shortMessage || e?.message || 'failed'); }
    finally { setBusy(null); }
  };
  return (
    <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
      <div className="text-[15px] text-fg font-medium">{title}</div>
      <div className="text-[13px] text-fg-muted">{blurb}</div>
      <div className="mt-3 flex justify-between text-[12px] text-fg-muted">
        <span>You hold: <span className="text-fg tabular-nums">{balance}</span></span>
        <span className="text-fg tabular-nums">{held}</span>
      </div>
      <div className="mt-2 flex items-center rounded-xl border border-[#254839]/15 bg-white px-3 h-11 focus-within:border-[#254839]/40">
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" inputMode="decimal"
          className="flex-1 bg-transparent text-[15px] text-fg outline-none tabular-nums" />
        <span className="ml-2 text-[13px] text-fg-muted">{suffix}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={disabled || !!busy || !value} onClick={run(primaryLabel, onPrimary)}
          className="btn-primary rounded-full h-10 px-5 text-[14px] font-medium text-[#fdf8ed] transition disabled:opacity-40">
          {busy === primaryLabel ? '…' : primaryLabel}
        </button>
        <button type="button" disabled={disabled || !!busy || !value} onClick={run(secondaryLabel, onSecondary)}
          className="rounded-full h-10 px-5 text-[14px] font-medium border border-[#254839]/25 text-[#254839] hover:bg-[#254839]/[0.06] transition-colors disabled:opacity-40">
          {busy === secondaryLabel ? '…' : secondaryLabel}
        </button>
      </div>
      {err && <div className="mt-1.5 text-[11px] text-red-600 max-w-[280px] truncate" title={err}>{err}</div>}
    </div>
  );
}

function CreditVaultCard({ v, addr, nav }: { v: CreditVault; addr?: string; nav?: number }) {
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-[#254839]/10">
          <img src={v.curator.logo} alt={v.curator.name} className="h-[22px] w-[22px] object-contain" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] text-fg font-medium leading-tight">{v.type}</div>
          <div className="text-[13px] text-fg-muted">{v.description}</div>
        </div>
        {nav !== undefined && (
          <span className="ml-auto shrink-0 rounded-full bg-[#254839]/[0.08] px-2.5 py-1 text-[11px] text-fg-muted tabular-nums">
            NAV ${nav.toFixed(4)}
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
          <div className="mt-1.5"><CuratorBrand curator={v.curator} /></div>
        </div>
        {v.badge && (
          <span className="rounded-full bg-[#C97A40]/15 px-2.5 py-1 text-[11px] font-medium text-[#A85A2C]">{v.badge}</span>
        )}
      </div>
    </>
  );
  const cls = 'flex flex-col rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]';
  return addr ? (
    <a href={arbiscan(addr)} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function CuratorBrand({ curator, size = 'md' }: { curator: Curator; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className="inline-flex items-center gap-1.5">
      <img src={curator.logo} alt="" className={`${h} object-contain`} />
      <span className={`${spaceGrotesk.className} ${size === 'sm' ? 'text-[13px]' : 'text-[15px]'} font-medium leading-none text-[#111318]`}>
        {curator.name.split(' ')[0]}
      </span>
    </span>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={strong ? 'text-[15px] text-fg font-semibold' : 'text-[14px] text-fg'}>{value}</div>
    </div>
  );
}
