'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ActionPanel } from '@/components/ActionPanel';
import { StellarTxButton } from '@/components/StellarTxButton';
import { useStellar } from '@/lib/stellar/StellarContext';
import { useCreditVault, useCreditVaultActions } from '@/lib/stellar/hooks';
import { fromBaseUnits } from '@/lib/stellar/client';
import { STELLAR_DECIMALS, SHARE_PRICE_SCALE, explorerContract, STELLAR } from '@/lib/stellar/config';
import { vaultBySlug } from '@/lib/stellar/vaults';

export default function CreditVaultPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const meta = vaultBySlug(slug);
  const { address, connect, connecting } = useStellar();
  const { data } = useCreditVault(slug);
  const { deposit, requestWithdraw, claim } = useCreditVaultActions(slug);

  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!meta) {
    return (
      <section className="px-6 md:px-24 pt-14 pb-24">
        <p className="text-fg-muted">Unknown vault.</p>
      </section>
    );
  }

  const sp = data ? Number(data.sharePrice) / SHARE_PRICE_SCALE : 1;
  const usdc = data?.user?.usdc;
  const shares = data?.user?.shares;
  const sharesValue =
    shares !== undefined && data ? (shares * data.sharePrice) / BigInt(SHARE_PRICE_SCALE) : undefined;
  const pending = data?.user?.pending;
  const hasPending = !!pending && pending.assets > 0n;
  const claimableAt = pending ? Number(pending.claimable_at) : 0;
  const claimable = hasPending && now >= claimableAt;
  const secsLeft = Math.max(0, claimableAt - now);
  const vaultId = STELLAR.creditVaults[slug];

  return (
    <>
      <section className="hero-glow px-6 md:px-24 pt-6 md:pt-12 pb-10 md:pb-14">
        <div className="max-w-[1400px] mx-auto">
          <Link
            href="/stellar"
            className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <div className="mt-6 flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-[#254839]/10">
              <img src={meta.curator.logo} alt={meta.curator.name} className="h-7 w-7 object-contain" />
            </span>
            <div>
              <h1 className="text-fg font-light tracking-[-0.02em] text-[36px] md:text-[44px] leading-[1.05]">
                {meta.type}
              </h1>
              <p className="mt-1 text-[14px] text-fg-muted">
                {meta.description} · curated by {meta.curator.name}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-8">
            <Stat label="Yield Range" value={meta.yieldApy} />
            <Stat label="Share price" value={sp.toFixed(4)} />
            <Stat label="Vault TVL" value={data ? `$${fromBaseUnits(data.nav, 0)}` : '—'} />
            {meta.fields.map((f) => (
              <Stat key={f.label} label={f.label} value={f.value} />
            ))}
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-8 lg:grid-cols-[1fr_minmax(380px,440px)]">
          <div className="space-y-4 text-[14px] text-fg-muted">
            <p>
              Deposit USDC into the <span className="text-fg">{meta.type}</span> and receive{' '}
              <span className="text-fg">{meta.symbol}</span> shares priced at NAV / supply. Yield
              is delivered on-chain by the strategy, lifting the share price — nothing to claim
              while invested.
            </p>
            <p>
              Withdrawals are a two-step request → claim with a short cooldown while positions
              unwind.
            </p>
            <p className="text-[12px]">
              Contract:{' '}
              <a
                href={explorerContract(vaultId)}
                target="_blank"
                rel="noreferrer"
                className="underline break-all"
              >
                {vaultId}
              </a>
            </p>

            {hasPending && (
              <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
                <div className="text-[12px] uppercase tracking-wider text-fg-muted">
                  Pending withdrawal
                </div>
                <div className="mt-1 text-[20px] text-fg font-semibold">
                  {fromBaseUnits(pending!.assets)} USDC
                </div>
                <div className="mt-3">
                  <StellarTxButton
                    label={claimable ? 'Claim USDC' : `Claimable in ${secsLeft}s`}
                    disabled={!claimable}
                    action={() => claim()}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 md:p-6 space-y-5 self-start">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-[#254839]/[0.06] p-1">
              {(['deposit', 'withdraw'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setInput('');
                  }}
                  className={`h-9 rounded-full text-[13px] capitalize transition-colors ${
                    tab === t ? 'bg-[#254839] text-[#fdf8ed]' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="space-y-2 text-[13px]">
              <Row label="Your USDC" value={`${usdc !== undefined ? fromBaseUnits(usdc) : '—'} USDC`} />
              <Row label={`Your ${meta.symbol}`} value={`${shares !== undefined ? fromBaseUnits(shares) : '—'} ${meta.symbol}`} />
              <Row label="Value" value={`${sharesValue !== undefined ? fromBaseUnits(sharesValue) : '—'} USDC`} />
            </div>

            <ActionPanel
              label={tab === 'deposit' ? 'Deposit USDC' : `Withdraw ${meta.symbol}`}
              input={input}
              onInput={setInput}
              maxValue={tab === 'deposit' ? usdc : shares}
              unit={tab === 'deposit' ? 'USDC' : meta.symbol}
              decimals={STELLAR_DECIMALS}
              hint={
                tab === 'deposit'
                  ? `Mints ${meta.symbol} at the current share price.`
                  : 'Burns shares now; claim USDC after the cooldown.'
              }
            >
              {!address ? (
                <button
                  type="button"
                  onClick={connect}
                  className="h-11 w-full rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31]"
                >
                  {connecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              ) : (
                <StellarTxButton
                  label={tab === 'deposit' ? 'Deposit' : 'Request withdraw'}
                  variant={tab === 'deposit' ? 'primary' : 'secondary'}
                  disabled={!input || Number(input) <= 0}
                  action={tab === 'deposit' ? () => deposit(input) : () => requestWithdraw(input)}
                  onSuccess={() => setInput('')}
                />
              )}
            </ActionPanel>
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
      <div className="text-[22px] text-fg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
