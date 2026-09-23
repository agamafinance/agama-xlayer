'use client';

import { useState } from 'react';
import { VaultHeader } from '@/components/VaultHeader';
import { ActionPanel } from '@/components/ActionPanel';
import { StellarTxButton } from '@/components/StellarTxButton';
import { useStellar } from '@/lib/stellar/StellarContext';
import { useStellarActions, useStellarState } from '@/lib/stellar/hooks';
import { fromBaseUnits } from '@/lib/stellar/client';
import { STELLAR_DECIMALS } from '@/lib/stellar/config';

export default function AgUsdPage() {
  const { address, connect, connecting } = useStellar();
  const { data } = useStellarState();
  const { depositAgusd, redeemAgusd } = useStellarActions();

  const [tab, setTab] = useState<'mint' | 'redeem'>('mint');
  const [input, setInput] = useState('');

  const usdc = data?.user?.usdc;
  const agusd = data?.user?.agusd;

  const reserve = data?.reserve ?? 0n;
  const deployed = data?.deployed ?? 0n;
  const backing = reserve + deployed;
  const bufferPct = backing > 0n ? Number((reserve * 1000n) / backing) / 10 : 100;
  // Instant capacity = the buffer; redeeming more than this needs deallocation.
  const instantCap = agusd !== undefined ? (agusd < reserve ? agusd : reserve) : reserve;

  const action = tab === 'mint' ? () => depositAgusd(input) : () => redeemAgusd(input);
  const max = tab === 'mint' ? usdc : instantCap;

  return (
    <>
      <VaultHeader
        backHref="/stellar"
        symbol="agUSD"
        title="agUSD — Synthetic Dollar"
        subtitle="Mint agUSD 1:1 from USDC. Excess liquidity is auto-deployed to strategies."
        stats={[
          { label: 'Peg', value: '1.00 USDC' },
          { label: 'Buffer (instant)', value: data ? `$${fromBaseUnits(data.reserve)}` : '—' },
          { label: 'Deployed', value: data ? `$${fromBaseUnits(data.deployed)}` : '—' },
          { label: 'Your agUSD', value: agusd !== undefined ? fromBaseUnits(agusd) : '—' },
        ]}
      />

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-8 lg:grid-cols-[1fr_minmax(380px,440px)]">
          <div className="space-y-4 text-[14px] text-fg-muted">
            <p>
              <span className="text-fg">agUSD</span> is Agama&apos;s synthetic dollar on Stellar.
              Each agUSD is minted 1:1 against USDC. On every deposit, the{' '}
              <span className="text-fg">Allocation Engine</span> keeps a{' '}
              {data ? data.bufferBps / 100 : 20}% liquidity buffer and auto-deploys the excess
              into the curated credit vaults — in the same transaction, fully on-chain.
            </p>

            {/* Backing split */}
            <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
              <div className="flex items-center justify-between text-[12px] uppercase tracking-wider text-fg-muted">
                <span>Backing</span>
                <span>${fromBaseUnits(backing)}</span>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#254839]/[0.08]">
                <div
                  className="h-full rounded-full bg-[#254839] transition-all"
                  style={{ width: `${Math.min(100, bufferPct)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[13px]">
                <span className="text-fg">
                  Buffer · ${fromBaseUnits(reserve)} <span className="text-fg-muted">(instant redemptions)</span>
                </span>
                <span className="text-fg">
                  Working in strategies · ${fromBaseUnits(deployed)}
                </span>
              </div>
            </div>

            <p>
              Want yield? Stake agUSD into the{' '}
              <span className="text-fg">sagUSD</span> vault.
            </p>
            <p className="text-[13px]">
              Need USDC first? Use the{' '}
              <a href="/stellar/faucet" className="text-fg underline">
                faucet
              </a>
              .
            </p>
          </div>

          <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 md:p-6 space-y-5 self-start">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-[#254839]/[0.06] p-1">
              {(['mint', 'redeem'] as const).map((t) => (
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
              <Row label="Your agUSD" value={`${agusd !== undefined ? fromBaseUnits(agusd) : '—'} agUSD`} />
            </div>

            {tab === 'redeem' && agusd !== undefined && agusd > instantCap && (
              <div className="rounded-xl bg-[#C97A40]/10 px-3.5 py-2.5 text-[12.5px] leading-snug text-[#8a4a22]">
                You can redeem <span className="font-semibold">{fromBaseUnits(instantCap)} agUSD</span>{' '}
                instantly right now. The rest of the backing (${fromBaseUnits(deployed)}) is
                working in strategies — the Engine is already pulling liquidity back to refill
                the buffer.
              </div>
            )}

            <ActionPanel
              label={tab === 'mint' ? 'Deposit USDC' : 'Redeem agUSD'}
              input={input}
              onInput={setInput}
              maxValue={max}
              unit={tab === 'mint' ? 'USDC' : 'agUSD'}
              decimals={STELLAR_DECIMALS}
              hint={
                tab === 'mint'
                  ? 'Mints agUSD 1:1 · excess auto-deploys to strategies.'
                  : `Instant capacity: ${fromBaseUnits(reserve)} USDC (the buffer).`
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
                  label={tab === 'mint' ? 'Mint agUSD' : 'Redeem'}
                  variant={tab === 'mint' ? 'primary' : 'secondary'}
                  disabled={!input || Number(input) <= 0}
                  action={action}
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
