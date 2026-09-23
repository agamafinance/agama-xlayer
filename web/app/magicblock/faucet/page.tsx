'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { faucetIx, waitFor } from '@/lib/magicblock/actions';
import { fromUnits, readBalances } from '@/lib/magicblock/agama';
import { explorerTx } from '@/lib/magicblock/config';
import { sendIxs } from '@/lib/magicblock/wallet';
import { useSolanaWallet } from '@/lib/magicblock/WalletProvider';
import { useAgama } from '@/lib/magicblock/useAgama';

// Devnet SOL comes from Solana's own faucet; the test USDC is minted by the Agama
// program itself, so one click is enough for the second one.
const SOL_FAUCET = 'https://faucet.solana.com/';

export default function MagicBlockFaucetPage() {
  const { address, provider, connect } = useSolanaWallet();
  const { base, bal, reload } = useAgama(address);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState('');

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const claim = async () => {
    if (!address || !provider) return connect();
    try {
      setBusy(true);
      setStatus('Minting 1,000 USDC…');
      const s = await sendIxs(provider, base, address, [faucetIx(address)]);
      setSig(s);
      const before = bal.usdc;
      const ok = await waitFor(async () => (await readBalances(base, address)).usdc !== before);
      await reload();
      setStatus(ok ? 'Funded' : 'Sent. Balance will refresh shortly.');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setStatus(msg.includes('FaucetCooldown') ? 'Faucet is on cooldown, try again in a minute.' : 'Error: ' + msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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
            Get testnet funds
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Grab devnet SOL for fees, then mint test USDC straight from the Agama program. Two clicks
            and you are ready to deposit into agYLD.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Network" value="Solana devnet" />
            <Stat label="Asset" value="USDC" />
            <Stat label="Your USDC" value={address ? fromUnits(bal.usdc) : '—'} />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">Get funded</h2>

          <StepRow
            logo="/solana.png"
            title="SOL for fees"
            blurb="Solana devnet transactions are paid in SOL. Grab some from the official faucet."
          >
            <a
              href={SOL_FAUCET}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#254839] px-6 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] whitespace-nowrap"
            >
              Open SOL faucet <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </StepRow>

          <StepRow
            logo="/logos/usdc.svg"
            title="USDC"
            blurb="1,000 test USDC, minted by the Agama program. Once a minute per wallet."
          >
            <button
              onClick={claim}
              disabled={busy}
              className="inline-flex h-11 items-center rounded-full bg-[#254839] px-6 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] disabled:opacity-45 whitespace-nowrap"
            >
              {address ? 'Mint 1,000 USDC' : 'Connect Wallet'}
            </button>
          </StepRow>

          {status && (
            <div className="pt-1 text-[13px] text-fg-muted">
              {status}
              {sig && (
                <>
                  {' · '}
                  <a
                    href={explorerTx(sig)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-fg"
                  >
                    view tx ↗
                  </a>
                </>
              )}
            </div>
          )}

          <p className="pt-2 text-[12px] text-fg-muted">
            {!address ? (
              <button type="button" onClick={connect} className="underline hover:text-fg">
                Connect a wallet
              </button>
            ) : (
              'Paste your address into the SOL faucet above.'
            )}
            <button
              type="button"
              onClick={copyAddress}
              disabled={!address}
              className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-[#254839]/[0.08] px-3 py-1 text-[12px] text-[#254839] hover:bg-[#254839]/[0.16] disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy address'}
            </button>
          </p>

          <Link href="/magicblock" className="group mt-6 flex items-center gap-4 rounded-2xl bg-[#254839] px-5 py-4">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="text-[26px] text-fg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StepRow({
  title,
  blurb,
  children,
  logo,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
  logo?: string;
}) {
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
