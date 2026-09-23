'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { SuiTxButton } from '@/components/SuiTxButton';
import { useSui } from '@/lib/sui/SuiContext';
import { useSuiActions, useSuiState } from '@/lib/sui/hooks';
import { fromBaseUnits } from '@/lib/sui/config';

const SUI_GAS_FAUCET = 'https://faucet.sui.io/';

export default function SuiFaucetPage() {
  const { address, connect } = useSui();
  const { data } = useSuiState();
  const { faucet } = useSuiActions();
  const [copied, setCopied] = useState(false);

  const usdc = data?.user?.usdc;

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {/* Hero — same language as the Earn page */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <div aria-hidden className="pointer-events-none absolute right-4 top-2 z-20 hidden lg:block">
            <img src="/logos/usdc.svg" alt="" className="h-[170px] w-[170px] drop-shadow-[0_18px_30px_rgba(20,50,35,0.25)]" />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">Get USDC</h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Mint USDC on Sui testnet. A few clicks and you are funded, ready for the
            confidential flow.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Network" value="Sui Testnet" />
            <Stat label="Asset" value="USDC" />
            <Stat label="Your USDC" value={usdc !== undefined ? fromBaseUnits(usdc) : '—'} />
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">Get funded</h2>

          <StepRow logo="/logos/usdc.svg" title="Mint USDC" blurb="100 USDC from the Agama faucet, mint as often as you like.">
            {!address ? (
              <button type="button" onClick={connect} className="h-11 px-6 rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31] whitespace-nowrap">
                Connect
              </button>
            ) : (
              <div className="w-[190px]">
                <SuiTxButton label="Mint 100 USDC" action={faucet} />
              </div>
            )}
          </StepRow>

          <p className="pt-2 text-[12px] text-fg-muted">
            Need SUI for gas? Grab some from{' '}
            <a href={SUI_GAS_FAUCET} target="_blank" rel="noreferrer" className="underline hover:text-fg inline-flex items-center gap-1">
              faucet.sui.io <ExternalLink className="h-3 w-3" />
            </a>
            <button type="button" onClick={copyAddress} disabled={!address} className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-[#254839]/[0.08] px-3 py-1 text-[12px] text-[#254839] hover:bg-[#254839]/[0.16] disabled:opacity-40">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy address'}
            </button>
          </p>

          {/* Next step */}
          <Link href="/sui" className="group mt-6 flex items-center gap-4 rounded-2xl bg-[#254839] px-5 py-4">
            <img src="/logos/agusd.svg" alt="" className="h-10 w-10" />
            <div>
              <div className="text-[15px] font-medium text-[#fdf8ed]">Funded? Mint cagUSD</div>
              <div className="text-[13px] text-[#fdf8ed]/70">Swap your USDC 1:1 into the confidential dollar</div>
            </div>
            <ArrowRight className="ml-auto h-5 w-5 text-[#fdf8ed]/80 transition-transform group-hover:translate-x-0.5" />
          </Link>
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

function StepRow({ n, done, title, blurb, children, logo }: { n?: string; done?: boolean; title: string; blurb: string; children: React.ReactNode; logo?: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] md:flex-row md:items-center">
      {logo ? (
        <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-full" />
      ) : (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${done ? 'bg-[#254839] text-[#fdf8ed]' : 'bg-[#254839]/[0.08] text-[#254839]'}`}>
          {done ? <Check className="h-5 w-5" /> : n}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[15px] text-fg font-medium">{title}</div>
        <div className="text-[13px] text-fg-muted break-all">{blurb}</div>
      </div>
      <div className="md:ml-auto shrink-0">{children}</div>
    </div>
  );
}
