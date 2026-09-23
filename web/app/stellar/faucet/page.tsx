'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { StellarTxButton } from '@/components/StellarTxButton';
import { useStellar } from '@/lib/stellar/StellarContext';
import { useStellarActions, useStellarState } from '@/lib/stellar/hooks';
import { fromBaseUnits } from '@/lib/stellar/client';

const CIRCLE_FAUCET = 'https://faucet.circle.com/';

export default function StellarFaucetPage() {
  const { address, connect, connecting } = useStellar();
  const { data } = useStellarState();
  const { addTrustline } = useStellarActions();
  const [copied, setCopied] = useState(false);
  const [trustlineDone, setTrustlineDone] = useState(false);

  const usdc = data?.user?.usdc;
  const funded = usdc !== undefined && usdc > 0n;

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
            <img
              src="/logos/usdc.svg"
              alt=""
              className="h-[170px] w-[170px] drop-shadow-[0_18px_30px_rgba(20,50,35,0.25)]"
            />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            Get USDC
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            This POC runs on the official Circle USDC, not a mock token. Three quick steps and
            you are funded.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Network" value="Stellar Testnet" />
            <Stat label="Asset" value="USDC by Circle" />
            <Stat label="Your USDC" value={usdc !== undefined ? fromBaseUnits(usdc) : '—'} />
          </div>
        </div>
      </section>

      {/* Steps — row style, like the vault list */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">
            Three steps
          </h2>

          <StepRow
            n="1"
            done={!!address}
            title="Connect Wallet"
            blurb={address ? `${address.slice(0, 8)}…${address.slice(-8)}` : 'Your Stellar wallet, on testnet.'}
          >
            {!address ? (
              <button
                type="button"
                onClick={connect}
                className="h-11 px-6 rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31] whitespace-nowrap"
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            ) : (
              <Done />
            )}
          </StepRow>

          <StepRow
            n="2"
            done={trustlineDone || funded}
            title="Add the USDC trustline"
            blurb="One signature, once — lets your account hold Circle's USDC."
          >
            {trustlineDone || funded ? (
              <Done />
            ) : (
              <div className="w-[190px]">
                <StellarTxButton
                  label="Add trustline"
                  disabled={!address}
                  action={addTrustline}
                  onSuccess={() => setTrustlineDone(true)}
                />
              </div>
            )}
          </StepRow>

          <StepRow
            n="3"
            done={funded}
            title="Request USDC from Circle"
            blurb="Pick USDC · Stellar Testnet, paste your address — 20 USDC every 2 hours."
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyAddress}
                disabled={!address}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#254839]/[0.08] px-4 text-[13px] text-[#254839] hover:bg-[#254839]/[0.16] disabled:opacity-40 whitespace-nowrap"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy address'}
              </button>
              <a
                href={CIRCLE_FAUCET}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#254839] px-5 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] whitespace-nowrap"
              >
                faucet.circle.com
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </StepRow>

          {/* Next step */}
          <Link
            href="/stellar/swap"
            className="group mt-6 flex items-center gap-4 rounded-2xl bg-[#254839] px-5 py-4"
          >
            <img src="/logos/agusd.svg" alt="" className="h-10 w-10" />
            <div>
              <div className="text-[15px] font-medium text-[#fdf8ed]">
                Funded? Mint agUSD
              </div>
              <div className="text-[13px] text-[#fdf8ed]/70">
                Swap your USDC 1:1 into the synthetic dollar
              </div>
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

function StepRow({
  n,
  done,
  title,
  blurb,
  children,
}: {
  n: string;
  done?: boolean;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] md:flex-row md:items-center">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${
          done ? 'bg-[#254839] text-[#fdf8ed]' : 'bg-[#254839]/[0.08] text-[#254839]'
        }`}
      >
        {done ? <Check className="h-5 w-5" /> : n}
      </span>
      <div className="min-w-0">
        <div className="text-[15px] text-fg font-medium">{title}</div>
        <div className="text-[13px] text-fg-muted break-all">{blurb}</div>
      </div>
      <div className="md:ml-auto shrink-0">{children}</div>
    </div>
  );
}

function Done() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#254839]/[0.08] px-4 py-2 text-[13px] font-medium text-[#254839]">
      <Check className="h-4 w-4" />
      Done
    </span>
  );
}
