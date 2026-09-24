'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';

import { TokenIcon } from '@/components/icons/TokenIcon';
import { formatUnits, parseUnits, type Address } from 'viem';

import { asset, OKB_FAUCET, STOCKS, TOKENS, USDG_DECIMALS } from '@/lib/xlayer/config';
import { erc20Abi, faucet, pub, useTick, useXLayerProtocol } from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

const USDG_AMOUNT = parseUnits('5000', USDG_DECIMALS);
const STOCK_AMOUNT = parseUnits('10', 18);

export default function XLayerFaucetPage() {
  const { address, connect } = useXLayerWallet();
  const [tick, bumpTick] = useTick();
  const proto = useXLayerProtocol(address, tick);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'usdg' | 'stocks' | null>(null);
  const [note, setNote] = useState('');

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  async function mintUsdg() {
    if (!address) return;
    setBusy('usdg');
    setNote('');
    try {
      await faucet(address, TOKENS.USDG, USDG_AMOUNT);
      setNote('5,000 USDG minted');
      bumpTick();
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message.split('\n')[0].slice(0, 120) : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function mintStocks() {
    if (!address) return;
    setBusy('stocks');
    setNote('');
    try {
      // Each wrapper is an ERC-4626 over a base xStock, the token an OKX
      // withdrawal delivers. Hand out both so either path is testable.
      for (const s of STOCKS) {
        const wrapper = TOKENS[s.wrapper];
        setNote(`Minting ${s.wrapper}…`);
        await faucet(address, wrapper, STOCK_AMOUNT);
        const base = (await pub
          .readContract({ address: wrapper, abi: erc20Abi, functionName: 'asset' })
          .catch(() => undefined)) as Address | undefined;
        if (base) {
          setNote(`Minting ${s.wrapper.replace(/^w/, '')}…`);
          await faucet(address, base, STOCK_AMOUNT);
        }
      }
      setNote('10 of each stock minted, wrapped and base');
      bumpTick();
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message.split('\n')[0].slice(0, 120) : String(e));
    } finally {
      setBusy(null);
    }
  }

  const usdg = proto?.usdg;

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <div aria-hidden className="pointer-events-none absolute right-4 top-2 z-20 hidden lg:block">
            <img
              src={asset('/xlayer.svg')}
              alt=""
              className="h-[170px] w-[170px] drop-shadow-[0_18px_30px_rgba(20,50,35,0.25)]"
            />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">Get testnet funds</h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Grab OKB for gas, then mint the stand-in USDG and xStocks. X Layer Testnet carries neither, so
            these are ours: same decimals, same ERC-4626 wrapper shape, and the Arrow and Agama contracts
            they meet are the real ones.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Network" value="X Layer Testnet" />
            <Stat label="Asset" value="USDG + xStocks" />
            <Stat
              label="Your USDG"
              value={usdg === undefined ? '—' : Number(formatUnits(usdg, USDG_DECIMALS)).toFixed(2)}
            />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="mb-2 text-[13px] uppercase tracking-wider text-fg-muted">Get funded</h2>

          <StepRow
            icon={<img src={asset('/xlayer.svg')} alt="" className="h-10 w-10 shrink-0 rounded-full" />}
            title="OKB for gas"
            blurb="X Layer Testnet transactions are paid in OKB. Grab some from the OKX faucet, it is the one thing here nobody can mint for you."
          >
            <FaucetLink href={OKB_FAUCET} label="Open OKB faucet" />
          </StepRow>

          <StepRow
            icon={<TokenIcon symbol="USDG" size={40} />}
            title="USDG"
            blurb="5,000 test USDG, the stablecoin every Arrow market settles in."
          >
            <MintButton
              onClick={address ? mintUsdg : connect}
              busy={busy === 'usdg'}
              label={address ? 'Mint 5,000 USDG' : 'Connect a wallet'}
              disabled={busy !== null}
            />
          </StepRow>

          <StepRow
            icon={<TokenIcon symbol="wTSLAx" size={40} />}
            title="xStocks"
            blurb="10 of each: wTSLAx, wNVDAx, wSPYx, wAAPLx, plus the base token an OKX withdrawal would deliver. Eight transactions."
          >
            <MintButton
              onClick={address ? mintStocks : connect}
              busy={busy === 'stocks'}
              label={address ? 'Mint the stocks' : 'Connect a wallet'}
              disabled={busy !== null}
            />
          </StepRow>

          <p className="pt-2 text-[12px] text-fg-muted">
            {!address ? (
              <button type="button" onClick={connect} className="underline hover:text-fg">
                Connect a wallet
              </button>
            ) : (
              'Paste your address into the OKB faucet above.'
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
            {note && <span className="ml-3">{note}</span>}
          </p>

          <Link
            href="/xlayer"
            prefetch={false}
            className="group mt-6 flex items-center gap-4 rounded-2xl bg-[#254839] px-5 py-4"
          >
            <img src="/agama-logo-circle.svg" alt="" className="h-10 w-10" />
            <div>
              <div className="text-[15px] font-medium text-[#fdf8ed]">Funded? Deposit your stock</div>
              <div className="text-[13px] text-[#fdf8ed]/70">Borrow against it and let the agents grow it</div>
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
      className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#254839] px-6 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31]"
    >
      {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function MintButton({
  onClick, busy, label, disabled,
}: { onClick: () => void; busy: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#254839] px-6 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] disabled:opacity-45"
    >
      {busy ? 'Minting…' : label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="text-[26px] font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function StepRow({
  title, blurb, children, icon,
}: { title: string; blurb: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] md:flex-row md:items-center">
      {icon}
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-fg">{title}</div>
        <div className="text-[13px] text-fg-muted">{blurb}</div>
      </div>
      <div className="shrink-0 md:ml-auto">{children}</div>
    </div>
  );
}
