'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft } from 'lucide-react';
import { StellarTxButton } from '@/components/StellarTxButton';
import { useStellar } from '@/lib/stellar/StellarContext';
import { useStellarActions, useStellarState } from '@/lib/stellar/hooks';
import { fromBaseUnits, toBaseUnits } from '@/lib/stellar/client';
import { SHARE_PRICE_SCALE } from '@/lib/stellar/config';

type Tok = 'USDC' | 'agUSD' | 'sagUSD';
const LOGO: Record<Tok, string> = {
  USDC: '/logos/usdc.svg',
  agUSD: '/logos/agusd.svg',
  sagUSD: '/logos/sagusd.svg',
};

export default function SwapPage() {
  const { address, connect, connecting } = useStellar();
  const { data } = useStellarState();
  const { depositAgusd, redeemAgusd, stake, requestUnstake, claim } = useStellarActions();

  const [from, setFrom] = useState<Tok>('USDC');
  const [to, setTo] = useState<Tok>('agUSD');
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const u = data?.user;
  const sharePrice = data?.sharePrice ?? BigInt(SHARE_PRICE_SCALE);
  const sp = Number(sharePrice) / SHARE_PRICE_SCALE;
  const reserve = data?.reserve ?? 0n;
  const deployed = data?.deployed ?? 0n;

  const balances: Record<Tok, bigint | undefined> = {
    USDC: u?.usdc,
    agUSD: u?.agusd,
    sagUSD: u?.sagusd,
  };

  // route → action + estimated output
  const route = `${from}->${to}`;
  const amount = toBaseUnits(input || '0');
  const est = useMemo(() => {
    if (amount <= 0n) return 0n;
    if (route === 'USDC->agUSD' || route === 'agUSD->USDC') return amount;
    if (route === 'agUSD->sagUSD') return (amount * BigInt(SHARE_PRICE_SCALE)) / sharePrice;
    if (route === 'sagUSD->agUSD') return (amount * sharePrice) / BigInt(SHARE_PRICE_SCALE);
    return 0n;
  }, [route, amount, sharePrice]);

  const actionLabel =
    route === 'USDC->agUSD' ? 'Mint agUSD'
    : route === 'agUSD->USDC' ? 'Redeem USDC'
    : route === 'agUSD->sagUSD' ? 'Stake'
    : 'Request unstake';

  const act = () => {
    if (route === 'USDC->agUSD') return depositAgusd(input);
    if (route === 'agUSD->USDC') return redeemAgusd(input);
    if (route === 'agUSD->sagUSD') return stake(input);
    return requestUnstake(input);
  };

  // Free token choice on both sides; the other side snaps to a valid partner.
  // Valid edges: USDC ⇄ agUSD (mint/redeem) and agUSD ⇄ sagUSD (stake/unstake).
  const [menu, setMenu] = useState<'from' | 'to' | null>(null);
  const pickFrom = (t: Tok) => {
    setFrom(t);
    if (t === 'agUSD') {
      if (to === 'agUSD') setTo('sagUSD'); // keep current USDC/sagUSD choice otherwise
    } else {
      setTo('agUSD'); // USDC and sagUSD only pair with agUSD
    }
    setMenu(null);
    setInput('');
  };
  const pickTo = (t: Tok) => {
    setTo(t);
    if (t === 'agUSD') {
      if (from === 'agUSD') setFrom('USDC');
    } else {
      setFrom('agUSD');
    }
    setMenu(null);
    setInput('');
  };
  const flip = () => {
    setFrom(to);
    setTo(from);
    setInput('');
  };

  const max = balances[from];
  const instantCap = from === 'agUSD' && to === 'USDC'
    ? (max !== undefined && max < reserve ? max : reserve)
    : max;

  const hint =
    route === 'USDC->agUSD'
      ? '1:1 mint · excess liquidity auto-deploys to strategies.'
      : route === 'agUSD->USDC'
      ? `Instant up to the buffer (${fromBaseUnits(reserve)} USDC) — the rest is working in strategies.`
      : route === 'agUSD->sagUSD'
      ? `1 sagUSD = ${sp.toFixed(4)} agUSD · the vault's performance is in the price.`
      : `1 sagUSD = ${sp.toFixed(4)} agUSD · burns shares now, claim agUSD after the cooldown.`;

  const pending = u?.pending;
  const hasPending = !!pending && pending.assets > 0n;
  const claimableAt = pending ? Number(pending.claimable_at) : 0;
  const claimable = hasPending && now >= claimableAt;
  const secsLeft = Math.max(0, claimableAt - now);

  const sagValue = u ? (u.sagusd * sharePrice) / BigInt(SHARE_PRICE_SCALE) : 0n;

  return (
    <>
      <section className="hero-glow px-6 md:px-24 pt-6 md:pt-12 pb-10 md:pb-14">
        <div className="max-w-[1100px] mx-auto">
          <Link href="/stellar" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>

          {/* The two faces of the dollar */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <CoinPanel
              logo={LOGO.agUSD}
              symbol="agUSD"
              title="Synthetic Dollar"
              stats={[
                { label: 'Peg', value: '1.00 USDC' },
                { label: 'Buffer (instant)', value: data ? `$${fromBaseUnits(reserve)}` : '—' },
                { label: 'Deployed', value: data ? `$${fromBaseUnits(deployed)}` : '—' },
                { label: 'Your balance', value: u ? fromBaseUnits(u.agusd) : '—' },
              ]}
            />
            <CoinPanel
              logo={LOGO.sagUSD}
              symbol="sagUSD"
              title="Yield-Bearing Token"
              stats={[
                { label: 'Share price', value: sp.toFixed(4) },
                { label: 'Vault NAV', value: data ? `$${fromBaseUnits(data.nav)}` : '—' },
                { label: 'Your balance', value: u ? fromBaseUnits(u.sagusd) : '—' },
                { label: 'Value', value: u ? `${fromBaseUnits(sagValue)} agUSD` : '—' },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[560px] mx-auto space-y-4">
          {/* Swap widget */}
          <div className="rounded-3xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_14px_40px_rgba(20,50,35,0.10)] p-5 md:p-6">
            {/* FROM */}
            <div className="rounded-2xl bg-white ring-1 ring-[#254839]/12 px-4 py-3 focus-within:ring-[#254839]/35">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-fg-muted">
                <span>From</span>
                <button
                  type="button"
                  onClick={() => max !== undefined && setInput(fromBaseUnits(instantCap ?? 0n).replace(/,/g, ''))}
                  className="hover:text-fg"
                >
                  Balance {balances[from] !== undefined ? fromBaseUnits(balances[from]!) : '—'} · Max
                </button>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="0.0"
                  className="h-9 w-full bg-transparent text-[24px] text-fg placeholder:text-fg-muted/40 focus:outline-none"
                />
                <TokenSelect
                  tok={from}
                  open={menu === 'from'}
                  onToggle={() => setMenu(menu === 'from' ? null : 'from')}
                  onPick={pickFrom}
                  balances={balances}
                />
              </div>
            </div>

            {/* flip */}
            <div className="relative z-10 -my-2.5 flex justify-center">
              <button
                type="button"
                onClick={flip}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#254839] text-[#fdf8ed] shadow hover:bg-[#1F3D31]"
                aria-label="Flip"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            {/* TO */}
            <div className="rounded-2xl bg-white ring-1 ring-[#254839]/12 px-4 py-3">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-fg-muted">
                <span>To{route === 'sagUSD->agUSD' ? ' (after cooldown)' : ''}</span>
                <span>Balance {balances[to] !== undefined ? fromBaseUnits(balances[to]!) : '—'}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-9 w-full text-[24px] text-fg tabular-nums">
                  {est > 0n ? fromBaseUnits(est, 4) : '0.0'}
                </div>
                <TokenSelect
                  tok={to}
                  open={menu === 'to'}
                  onToggle={() => setMenu(menu === 'to' ? null : 'to')}
                  onPick={pickTo}
                  balances={balances}
                />
              </div>
            </div>

            <p className="mt-3 text-[12px] text-fg-muted">{hint}</p>

            <div className="mt-4">
              {!address ? (
                <button
                  type="button"
                  onClick={connect}
                  className="h-12 w-full rounded-full bg-[#254839] text-[#fdf8ed] text-[15px] font-medium hover:bg-[#1F3D31]"
                >
                  {connecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              ) : (
                <StellarTxButton
                  label={actionLabel}
                  disabled={!input || Number(input) <= 0}
                  action={act}
                  onSuccess={() => setInput('')}
                />
              )}
            </div>
          </div>

          {/* Pending unstake claim */}
          {hasPending && (
            <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px] uppercase tracking-wider text-fg-muted">Pending unstake</div>
                  <div className="mt-0.5 text-[20px] text-fg font-semibold">
                    {fromBaseUnits(pending!.assets)} agUSD
                  </div>
                </div>
                <div className="w-[180px]">
                  <StellarTxButton
                    label={claimable ? 'Claim' : `in ${secsLeft}s`}
                    disabled={!claimable}
                    action={() => claim()}
                  />
                </div>
              </div>
            </div>
          )}

          <p className="text-center text-[12px] text-fg-muted">
            Need USDC?{' '}
            <Link href="/stellar/faucet" className="underline hover:text-fg">
              Get some from the Circle faucet
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

function CoinPanel({
  logo,
  symbol,
  title,
  stats,
}: {
  logo: string;
  symbol: string;
  title: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-3xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
      <div className="flex items-center gap-4">
        <img src={logo} alt={symbol} className="h-16 w-16 md:h-20 md:w-20" />
        <div>
          <div className="text-[24px] md:text-[28px] text-fg font-semibold leading-tight">{symbol}</div>
          <div className="text-[13px] text-fg-muted">{title}</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-[11px] uppercase tracking-wider text-fg-muted">{s.label}</div>
            <div className="text-[15px] text-fg font-medium tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenSelect({
  tok,
  open,
  onToggle,
  onPick,
  balances,
}: {
  tok: Tok;
  open: boolean;
  onToggle: () => void;
  onPick: (t: Tok) => void;
  balances: Record<Tok, bigint | undefined>;
}) {
  const ALL: Tok[] = ['USDC', 'agUSD', 'sagUSD'];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded-full bg-[#254839]/[0.06] py-1.5 pl-1.5 pr-2.5 hover:bg-[#254839]/[0.12]"
      >
        <img src={LOGO[tok]} alt="" className="h-6 w-6" />
        <span className="text-[14px] font-medium text-fg">{tok}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" className="text-fg-muted">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onToggle} />
          <div className="absolute right-0 top-11 z-40 w-52 rounded-2xl bg-[#fdfaf1] p-1.5 shadow-[0_1px_3px_rgba(20,50,35,0.08),0_12px_34px_rgba(20,50,35,0.18)]">
            {ALL.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onPick(t)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                  t === tok ? 'bg-[#254839] text-[#fdf8ed]' : 'text-fg hover:bg-[#254839]/[0.06]'
                }`}
              >
                <img src={LOGO[t]} alt="" className="h-6 w-6" />
                <span className="text-[14px] font-medium">{t}</span>
                <span className={`ml-auto text-[12px] tabular-nums ${t === tok ? 'opacity-80' : 'text-fg-muted'}`}>
                  {balances[t] !== undefined ? fromBaseUnits(balances[t]!) : '—'}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
