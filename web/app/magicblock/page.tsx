'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Lock } from 'lucide-react';
import LayerPanel from '@/components/magicblock/LayerPanel';
import PrivateLedger from '@/components/magicblock/PrivateLedger';
import NavChart from '@/components/magicblock/NavChart';
import { explorerAcc, explorerTx } from '@/lib/magicblock/config';
import {
  amountStr,
  blendedAprPct,
  fromUnits,
  projectNav,
  projectPoolValue,
  sharePriceStr,
  sharesToUsdc,
  toUnits,
} from '@/lib/magicblock/agama';
import {
  depositIx,
  redeemIx,
  rollupConnection,
  sendWithSession,
  waitFor,
} from '@/lib/magicblock/actions';
import { erEndpoint, readBalances } from '@/lib/magicblock/agama';
import {
  privateDepositBaseIxs,
  privateDepositRollupIxs,
  readPrivacyPlan,
} from '@/lib/magicblock/private-deposit';
import { positionPda } from '@/lib/magicblock/config';
import { sendIxs } from '@/lib/magicblock/wallet';
import { sessionKeypair, signWithSession } from '@/lib/magicblock/session';
import { useSolanaWallet } from '@/lib/magicblock/WalletProvider';
import { useAgama, useClock } from '@/lib/magicblock/useAgama';

const WINDOW = 150; // live-chart points (~2.5 min at 1s)

export default function MagicBlockEarnPage() {
  const { address, provider, connect } = useSolanaWallet();
  const { base, baseSnap, erSnap, erUrl, live, bal, reload } = useAgama(address);
  const now = useClock();

  const [series, setSeries] = useState<number[]>([]);
  const [tab, setTab] = useState<'deposit' | 'redeem'>('deposit');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  // On by default. A private ledger costs 0.06 SOL of rollup rent, which is why the
  // toggle spells the cost out rather than hiding it, but privacy being the thing
  // you opt *out* of is the whole product position, so it cannot be the checkbox
  // nobody ticks.
  const [priv, setPriv] = useState(true);
  const [txs, setTxs] = useState<{ label: string; sig: string }[]>([]);

  // Seed the live window by back-projecting the on-chain formula, then append one
  // real sample per tick so the chart scrolls.
  useEffect(() => {
    if (!live || now === 0) return;
    const price = parseFloat(sharePriceStr(live, BigInt(now), 8));
    setSeries((s) => {
      const seeded =
        s.length > 0
          ? s
          : Array.from({ length: WINDOW - 1 }, (_, k) =>
              parseFloat(sharePriceStr(live, BigInt(now - (WINDOW - 1) + k), 8)),
            );
      return [...seeded, price].slice(-WINDOW);
    });
  }, [now, live]);

  const nowB = BigInt(now || 0);
  const nav = live ? projectNav(live, nowB) : 0n;
  const price = live ? sharePriceStr(live, nowB, 8) : '1.00000000';
  const supply = live?.vault.shares ?? 0n;
  const userValue = sharesToUsdc(bal.agyld, nav, supply);

  const amt = toUnits(amount);
  const estOut = useMemo(() => {
    if (amt <= 0n || !live) return 0n;
    const p = parseFloat(price) || 1;
    if (tab === 'deposit') return BigInt(Math.round(Number(amt) / p));
    return sharesToUsdc(amt, nav, supply);
  }, [amt, tab, price, nav, supply, live]);

  const fromBal = tab === 'deposit' ? bal.usdc : bal.agyld;
  const fromSym = tab === 'deposit' ? 'USDC' : 'agYLD';
  const toSym = tab === 'deposit' ? 'agYLD' : 'USDC';
  const canSend = !!address && amt > 0n && amt <= fromBal;

  const send = async () => {
    if (!address || !provider) return connect();
    const label = tab === 'deposit' ? 'Deposit' : 'Redeem';
    try {
      setBusy(true);

      // Public path: custody and the agYLD mint never leave Solana, and the rollup
      // picks the flow up on its next tick.
      if (tab === 'redeem' || !priv) {
        setStatus(`${label}…`);
        const ix = tab === 'deposit' ? depositIx(address, amt) : redeemIx(address, amt);
        const sig = await sendIxs(provider, base, address, [ix]);
        setTxs((t) => [{ label, sig }, ...t].slice(0, 8));
        setAmount('');
        setStatus(`${label} sent`);
        const watched = tab === 'deposit' ? bal.usdc : bal.agyld;
        void waitFor(async () => {
          const next = await readBalances(base, address);
          const moved = (tab === 'deposit' ? next.usdc : next.agyld) !== watched;
          if (moved) {
            await reload();
            setStatus(`${label} confirmed`);
          }
          return moved;
        });
        return;
      }

      // Private path. Three prompts at most, and fewer once the ledger exists:
      // one Solana transaction, one signed login message, one rollup transaction.
      const plan = await readPrivacyPlan(base, address);

      setStatus(plan.ready ? 'Depositing…' : 'Depositing and opening your private ledger…');
      const baseSig = await sendIxs(
        provider,
        base,
        address,
        privateDepositBaseIxs(address, amt, plan),
      );
      setTxs((t) => [{ label: plan.ready ? 'Deposit' : 'Deposit + ledger', sig: baseSig }, ...t].slice(0, 8));
      setAmount('');

      // The enclave will not accept the ledger until Solana has handed it over.
      setStatus('Waiting for Solana to hand the ledger to the enclave…');
      const url = await waitForRollup(address);
      if (!url) {
        setStatus('Deposited. The enclave has not picked the ledger up yet, try Privacy in a moment.');
        await reload();
        return;
      }

      // The wallet is done. The session key it just authorised signs the rest,
      // which is what keeps this to one approval.
      const kp = sessionKeypair(address);
      setStatus('Sealing your position…');
      const conn = await rollupConnection(url, kp.publicKey, signWithSession(kp));
      const erSig = await sendWithSession(conn, kp, privateDepositRollupIxs(address, plan));
      setTxs((t) => [{ label: 'Seal', sig: erSig }, ...t].slice(0, 8));
      await reload();
      setStatus('Deposited. Your position is private.');
    } catch (e: any) {
      const m = String(e?.message ?? e).toLowerCase();
      const declined =
        m.includes('cancel') || m.includes('reject') || m.includes('denied') || e?.code === 4001;
      // The deposit and the sealing are separate transactions, so a refusal on the
      // second one leaves a real deposit behind. Saying "Error" about it is wrong.
      setStatus(
        declined
          ? 'Cancelled. Anything already confirmed above went through; the rest did not.'
          : 'Error: ' + (e?.message || String(e)),
      );
    } finally {
      setBusy(false);
    }
  };

  /// Delegation is asynchronous: the transaction succeeding is not the rollup
  /// having the account. Poll the router rather than guessing a delay.
  const waitForRollup = async (owner: typeof address) => {
    if (!owner) return null;
    const pda = positionPda(owner);
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const url = await erEndpoint(pda);
      if (url) return url;
    }
    return null;
  };

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <div aria-hidden className="pointer-events-none absolute right-0 -top-2 z-20 hidden lg:block">
            <img src="/logos/coin-pair.svg" alt="" className="h-[300px] w-auto" />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            A yield-bearing token
            <br />
            settled on Solana, ticking on MagicBlock
          </h1>
          <p className="mt-4 max-w-[660px] text-[15px] text-fg-muted">
            Deposit USDC to mint agYLD, whose price rises as Agama&apos;s private-credit lending pools
            earn. agYLD stays a plain SPL token on Solana devnet, so it keeps composing with
            everything else. The pools themselves run on a MagicBlock Ephemeral Rollup, where yield
            accrues per tick instead of per block, and each depositor&apos;s position sits behind a TEE
            permission.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Net APY" value={live ? `${blendedAprPct(live, nav)}%` : '—'} />
            <Stat label="Price / share" value={live ? `${sharePriceStr(live, nowB, 4)} USDC` : '—'} />
            <Stat
              label="Your agYLD"
              value={address ? fromUnits(bal.agyld) : '—'}
              sub={address && bal.agyld > 0n ? `= ${amountStr(userValue, 6)} USDC` : undefined}
            />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] items-start">
            <div className="space-y-5">
              <NavChart vault={live} now={now} live={series} />
              <LayerPanel base={baseSnap} er={erSnap} erUrl={erUrl} now={now} />
            </div>

            <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="flex items-center gap-1 rounded-full bg-[#254839]/[0.06] p-1 w-fit">
                {(['deposit', 'redeem'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      setAmount('');
                    }}
                    className={
                      t === tab
                        ? 'rounded-full bg-[#254839] px-4 py-1.5 text-[13px] font-medium text-[#fdf8ed] capitalize'
                        : 'rounded-full px-4 py-1.5 text-[13px] text-fg-muted hover:text-fg capitalize'
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                <div className="flex items-center justify-between text-[12px] text-fg-muted">
                  <span>From</span>
                  <button onClick={() => setAmount(amountStr(fromBal, 6))} className="hover:text-fg">
                    Balance {fromUnits(fromBal)} · Max
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-transparent text-[28px] font-semibold text-fg tabular-nums outline-none placeholder:text-fg-muted/40"
                  />
                  <span className="shrink-0 rounded-full bg-[#254839]/[0.06] px-3 py-1.5 text-[14px] font-medium text-fg">
                    {fromSym}
                  </span>
                </div>
              </div>

              <div className="my-1.5 flex justify-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#254839] text-[#fdf8ed]">
                  ↓
                </span>
              </div>

              <div className="rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                <div className="text-[12px] text-fg-muted">To (estimated)</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[28px] font-semibold text-fg tabular-nums">
                    {estOut > 0n ? amountStr(estOut, 6) : '0.00'}
                  </span>
                  <span className="shrink-0 rounded-full bg-[#254839]/[0.06] px-3 py-1.5 text-[14px] font-medium text-fg">
                    {toSym}
                  </span>
                </div>
              </div>

              {tab === 'deposit' && (
                <button
                  type="button"
                  onClick={() => setPriv((p) => !p)}
                  className="mt-3 flex w-full items-start gap-3 rounded-2xl border border-[#254839]/12 bg-white/60 p-3.5 text-left transition-colors hover:bg-white/80"
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
                      priv ? 'bg-[#254839]' : 'bg-[#254839]/20',
                    )}
                  >
                    <span
                      className={clsx(
                        'h-4 w-4 rounded-full bg-white transition-transform',
                        priv && 'translate-x-4',
                      )}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
                      <Lock className="h-3.5 w-3.5" /> Private position
                    </span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">
                      {priv
                        ? 'Your agYLD stays public. What you paid, what it is marked at and what it earned go inside the enclave, readable only by you.'
                        : 'Your position detail will be readable by anyone. Turn this back on to keep it inside the enclave.'}
                    </span>
                  </span>
                </button>
              )}

              <button
                onClick={send}
                disabled={busy || (!!address && !canSend)}
                className="mt-4 w-full rounded-full bg-[#254839] px-5 py-3.5 text-[15px] font-medium text-[#fdf8ed] transition-colors hover:bg-[#1F3D31] disabled:opacity-45"
              >
                {!address
                  ? 'Connect Wallet'
                  : amt > fromBal
                    ? `Insufficient ${fromSym}`
                    : tab === 'deposit'
                      ? priv
                        ? 'Deposit privately'
                        : 'Deposit'
                      : 'Redeem'}
              </button>
              {status && <div className="mt-3 text-center text-[13px] text-fg-muted">{status}</div>}

              {txs.length > 0 && (
                <div className="mt-4 border-t border-[#254839]/10 pt-3">
                  <div className="text-[11px] uppercase tracking-wider text-fg-muted">
                    Transactions (devnet)
                  </div>
                  {txs.map((t) => (
                    <div key={t.sig} className="mt-1.5 flex items-center justify-between text-[13px]">
                      <span className="text-fg-muted">{t.label}</span>
                      <a
                        href={explorerTx(t.sig)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-fg underline decoration-[#254839]/30 underline-offset-2 hover:decoration-[#254839]"
                      >
                        {t.sig.slice(0, 8)}…{t.sig.slice(-4)} ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}

              <PrivateLedger base={base} agyld={bal.agyld} onChange={reload} />
            </div>
          </div>

          <div>
            <h2 className="text-[13px] uppercase tracking-wider text-fg-muted pt-4 pb-1">
              Lending pools behind agYLD
            </h2>
            <p className="text-[13px] text-fg-muted max-w-[720px] mb-4">
              Deposited USDC is spread across these pools by weight on the next rollup tick. Each
              accrues at its own APR, every tick, and lifts the agYLD price. These marks live on the
              Ephemeral Rollup, not on Solana.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(live?.book.pools ?? []).map((p, i) => (
                <div
                  key={i}
                  className="flex flex-col rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-fg font-medium">{p.name}</span>
                    <span className="rounded-full bg-[#254839]/[0.08] px-2.5 py-1 text-[11px] text-fg-muted">
                      {(p.aprBps / 100).toFixed(2)}% APR
                    </span>
                  </div>
                  <div className="text-[13px] text-fg-muted">{p.sector}</div>
                  <div className="mt-3 text-[22px] font-semibold text-fg tabular-nums">
                    {amountStr(projectPoolValue(p, nowB, live!.book.lastTs), 6)}
                  </div>
                  <div className="text-[12px] text-fg-muted">
                    USDC · {(p.weightBps / 100).toFixed(0)}% weight
                  </div>
                </div>
              ))}
              {!live && <div className="text-[13px] text-fg-muted">Loading pools…</div>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="text-[26px] text-fg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[12px] text-fg-muted">{sub}</div>}
    </div>
  );
}
