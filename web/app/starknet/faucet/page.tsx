'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { ADDRESSES } from '@/lib/starknet/config';
import { fromUnits, readU256 } from '@/lib/starknet/agama';
import { useStarknetWallet } from '@/lib/starknet/WalletProvider';

// Circle native USDC on Starknet Sepolia is not user-mintable, so the faucet
// points to the canonical external faucets: STRK for gas + Circle for USDC.
const STRK_FAUCET = 'https://starknet-faucet.vercel.app/';
const USDC_FAUCET = 'https://faucet.circle.com/';

export default function StarknetFaucetPage() {
  const { address, connect } = useStarknetWallet();
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async (addr?: string) => {
    if (!addr) return setUsdc(null);
    try {
      setUsdc(await readU256(ADDRESSES.usdc, 'balanceOf', [addr]));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh(address);
  }, [address, refresh]);

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

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">Get testnet funds</h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Grab STRK for gas and USDC on Starknet Sepolia. A few clicks and you are funded,
            ready to deposit into agYLD.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Network" value="Starknet Sepolia" />
            <Stat label="Asset" value="USDC" />
            <Stat label="Your USDC" value={usdc !== null ? fromUnits(usdc) : '—'} />
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">Get funded</h2>

          <StepRow logo="/starknet.svg" title="STRK for gas" blurb="Starknet Sepolia transactions are paid in STRK. Grab some from the StarkWare faucet.">
            <FaucetLink href={STRK_FAUCET} label="Open STRK faucet" />
          </StepRow>

          <StepRow logo="/logos/usdc.svg" title="USDC" blurb="Circle native USDC on Starknet Sepolia, from Circle's official faucet.">
            <FaucetLink href={USDC_FAUCET} label="Open USDC faucet" />
          </StepRow>

          <p className="pt-2 text-[12px] text-fg-muted">
            {!address ? (
              <button type="button" onClick={connect} className="underline hover:text-fg">
                Connect a wallet
              </button>
            ) : (
              'Paste your address into the faucets above.'
            )}
            <button type="button" onClick={copyAddress} disabled={!address} className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-[#254839]/[0.08] px-3 py-1 text-[12px] text-[#254839] hover:bg-[#254839]/[0.16] disabled:opacity-40">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy address'}
            </button>
          </p>

          {/* Next step */}
          <Link href="/starknet" className="group mt-6 flex items-center gap-4 rounded-2xl bg-[#254839] px-5 py-4">
            <img src="/logos/agusd.svg" alt="" className="h-10 w-10" />
            <div>
              <div className="text-[15px] font-medium text-[#fdf8ed]">Funded? Deposit into agYLD</div>
              <div className="text-[13px] text-[#fdf8ed]/70">Mint the yield-bearing token with your USDC</div>
            </div>
            <ArrowRight className="ml-auto h-5 w-5 text-[#fdf8ed]/80 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </>
  );
}

function FaucetLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#254839] px-6 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] whitespace-nowrap"
    >
      {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
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

function StepRow({ title, blurb, children, logo }: { title: string; blurb: string; children: React.ReactNode; logo?: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] md:flex-row md:items-center">
      {logo && <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-full" />}
      <div className="min-w-0">
        <div className="text-[15px] text-fg font-medium">{title}</div>
        <div className="text-[13px] text-fg-muted break-all">{blurb}</div>
      </div>
      <div className="md:ml-auto shrink-0">{children}</div>
    </div>
  );
}
