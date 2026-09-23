'use client';

import { useEffect, useState } from 'react';
import { VaultHeader } from '@/components/VaultHeader';
import { ActionPanel } from '@/components/ActionPanel';
import { StellarTxButton } from '@/components/StellarTxButton';
import { useStellar } from '@/lib/stellar/StellarContext';
import { useStellarActions, useStellarState } from '@/lib/stellar/hooks';
import { fromBaseUnits } from '@/lib/stellar/client';
import { STELLAR_DECIMALS, SHARE_PRICE_SCALE } from '@/lib/stellar/config';

export default function SagUsdPage() {
  const { address, connect, connecting } = useStellar();
  const { data } = useStellarState();
  const { stake, requestUnstake, claim } = useStellarActions();

  const [tab, setTab] = useState<'stake' | 'unstake'>('stake');
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const agusd = data?.user?.agusd;
  const sagusd = data?.user?.sagusd;
  const pending = data?.user?.pending;
  const sp = data ? Number(data.sharePrice) / SHARE_PRICE_SCALE : 1;
  const sagValue =
    sagusd !== undefined && data ? (sagusd * data.sharePrice) / BigInt(SHARE_PRICE_SCALE) : undefined;

  const claimableAt = pending ? Number(pending.claimable_at) : 0;
  const hasPending = !!pending && pending.assets > 0n;
  const claimable = hasPending && now >= claimableAt;
  const secsLeft = Math.max(0, claimableAt - now);

  return (
    <>
      <VaultHeader
        backHref="/stellar"
        symbol="sagUSD"
        title="sagUSD — Yield Vault"
        subtitle="Stake agUSD to earn. Yield compounds into the share price."
        stats={[
          { label: 'Share price', value: sp.toFixed(4) },
          { label: 'Vault NAV', value: data ? `$${fromBaseUnits(data.nav, 0)}` : '—' },
          { label: 'Your sagUSD', value: sagusd !== undefined ? fromBaseUnits(sagusd) : '—' },
        ]}
      />

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-8 lg:grid-cols-[1fr_minmax(380px,440px)]">
          <div className="space-y-4 text-[14px] text-fg-muted">
            <p>
              Stake <span className="text-fg">agUSD</span> to receive{' '}
              <span className="text-fg">sagUSD</span> — a yield-bearing token priced at
              NAV / supply. As Kiro strategies deliver yield, the NAV rises and every share
              appreciates. Nothing to claim while staked.
            </p>
            <p>
              Unstaking is a two-step request → claim with a short cooldown while the strategist
              unwinds positions off-chain.
            </p>

            {hasPending && (
              <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
                <div className="text-[12px] uppercase tracking-wider text-fg-muted">
                  Pending withdrawal
                </div>
                <div className="mt-1 text-[20px] text-fg font-semibold">
                  {fromBaseUnits(pending!.assets)} agUSD
                </div>
                <div className="mt-3">
                  <StellarTxButton
                    label={claimable ? 'Claim agUSD' : `Claimable in ${secsLeft}s`}
                    disabled={!claimable}
                    action={() => claim()}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 md:p-6 space-y-5 self-start">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-[#254839]/[0.06] p-1">
              {(['stake', 'unstake'] as const).map((t) => (
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
              <Row label="Your agUSD" value={`${agusd !== undefined ? fromBaseUnits(agusd) : '—'} agUSD`} />
              <Row label="Your sagUSD" value={`${sagusd !== undefined ? fromBaseUnits(sagusd) : '—'} sagUSD`} />
              <Row label="Value" value={`${sagValue !== undefined ? fromBaseUnits(sagValue) : '—'} agUSD`} />
            </div>

            <ActionPanel
              label={tab === 'stake' ? 'Stake agUSD' : 'Unstake sagUSD'}
              input={input}
              onInput={setInput}
              maxValue={tab === 'stake' ? agusd : sagusd}
              unit={tab === 'stake' ? 'agUSD' : 'sagUSD'}
              decimals={STELLAR_DECIMALS}
              hint={
                tab === 'stake'
                  ? 'Mints sagUSD at the current share price.'
                  : 'Burns shares now; claim agUSD after the cooldown.'
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
                  label={tab === 'stake' ? 'Stake' : 'Request unstake'}
                  variant={tab === 'stake' ? 'primary' : 'secondary'}
                  disabled={!input || Number(input) <= 0}
                  action={tab === 'stake' ? () => stake(input) : () => requestUnstake(input)}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
