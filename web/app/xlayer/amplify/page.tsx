'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';

import { ADDR, RAY, TOKENS, USDG_DECIMALS } from '@/lib/xlayer/config';
import { amplifyRouterAbi } from '@/lib/xlayer/generated/abis';
import { ensureAllowance, pub, send, useAmplifyPosition, useXLayerProtocol } from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

const usd = (v: bigint | undefined) =>
  v === undefined ? '—' : `$${Number(formatUnits(v, USDG_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const rayPct = (v: bigint | undefined) => (v === undefined ? '—' : `${(Number(v) / Number(RAY) * 100).toFixed(2)}%`);

export default function XLayerAmplifyPage() {
  const { address, connect } = useXLayerWallet();
  const [tick, setTick] = useState(0);
  const proto = useXLayerProtocol(address, tick);
  const pos = useAmplifyPosition(address, tick);

  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(2);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [netApy, setNetApy] = useState<bigint>();

  const amt = useMemo(() => {
    try {
      return amount ? parseUnits(amount, USDG_DECIMALS) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);
  const leverageBps = BigInt(Math.round(leverage * 10_000));

  // The router does the maths on chain, so the number on screen is the number
  // the loop will actually produce.
  useEffect(() => {
    if (!proto) return;
    let alive = true;
    pub.readContract({
      address: ADDR.amplifyRouter, abi: amplifyRouterAbi, functionName: 'netApyRay',
      args: [proto.vaultApy, leverageBps],
    }).then((v) => { if (alive) setNetApy(v as bigint); }).catch(() => {});
    return () => { alive = false; };
  }, [proto, leverageBps]);

  const bump = () => setTick((t) => t + 1);

  async function open() {
    if (!address) return;
    setBusy(true);
    try {
      setStatus('Approving…');
      await ensureAllowance(address, TOKENS.USDG, ADDR.amplifyRouter, amt);
      setStatus('Opening the loop…');
      await send(address, ADDR.amplifyRouter, amplifyRouterAbi, 'open', [amt, leverageBps]);
      setStatus('Done');
      setAmount('');
      bump();
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message.split('\n')[0].slice(0, 140) : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!address) return;
    setBusy(true);
    try {
      setStatus('Unwinding…');
      await send(address, ADDR.amplifyRouter, amplifyRouterAbi, 'close', []);
      setStatus('Done');
      bump();
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message.split('\n')[0].slice(0, 140) : String(e));
    } finally {
      setBusy(false);
    }
  }

  const has = !!pos && pos.exposure > 0n;
  const usdgBal = proto?.usdg ?? 0n;

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto">
          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            Amplify the vault,
            <br />
            on one slider
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Loop the Agama private-credit vault against USDG borrowed on Arrow, up to three times, in a
            single transaction. If the borrow rate ever climbs above what the vault earns, anyone can
            unwind the loop back to 1x.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Vault APY" value={rayPct(proto?.vaultApy)} sub={proto?.vaultApyIsTarget ? 'Target, not yet measured' : 'Realized'} />
            <Stat label="Borrow APR" value={rayPct(proto?.borrowRate)} sub="USDG, variable" />
            <Stat label={`Net APY at ${leverage.toFixed(1)}x`} value={rayPct(netApy)} sub="Computed on chain" />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-5 lg:grid-cols-[1fr_1fr] items-start">
          <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <h2 className="text-[17px] font-semibold text-fg">Open a loop</h2>

            <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
              <div className="flex items-center justify-between text-[12px] text-fg-muted">
                <span>Amount</span>
                <button onClick={() => setAmount(formatUnits(usdgBal, USDG_DECIMALS))} className="hover:text-fg">
                  Balance {Number(formatUnits(usdgBal, USDG_DECIMALS)).toFixed(2)} · Max
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
                <span className="shrink-0 rounded-full bg-[#254839]/[0.06] px-3 py-1.5 text-[14px] font-medium text-fg">USDG</span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
              <div className="flex items-center justify-between text-[12px] text-fg-muted">
                <span>Leverage</span>
                <span className="text-fg">{leverage.toFixed(1)}x</span>
              </div>
              <input
                type="range" min={1} max={3} step={0.1} value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="mt-3 w-full accent-[#254839]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-fg-muted">
                <span>1x, no loop</span>
                <span>3x max</span>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-[13px]">
              <Row label="Exposure" value={amt > 0n ? usd((amt * leverageBps) / 10_000n) : '—'} />
              <Row label="Borrowed" value={amt > 0n ? usd((amt * (leverageBps - 10_000n)) / 10_000n) : '—'} />
              <Row label="Net APY" value={rayPct(netApy)} />
            </dl>

            <button
              onClick={address ? open : connect}
              disabled={busy || (!!address && (amt === 0n || amt > usdgBal || leverage <= 1))}
              className="mt-4 w-full rounded-full bg-[#254839] px-5 py-3.5 text-[15px] font-medium text-[#fdf8ed] transition-colors hover:bg-[#1F3D31] disabled:opacity-45"
            >
              {!address ? 'Connect Wallet' : busy ? status || 'Working…' : `Open at ${leverage.toFixed(1)}x`}
            </button>
            {status && !busy && <p className="mt-2 text-[12px] text-fg-muted">{status}</p>}
          </div>

          <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <h2 className="text-[17px] font-semibold text-fg">Your loop</h2>
            {!has ? (
              <p className="mt-4 text-[14px] text-fg-muted">
                No loop open. Pick an amount and a leverage: the vault shares you end up with are the
                collateral for the USDG that bought them.
              </p>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-8">
                  <Stat label="Exposure" value={usd(pos!.exposure)} sub={`${(Number(pos!.leverageBps) / 10_000).toFixed(2)}x`} />
                  <Stat
                    label="Health factor"
                    value={pos!.healthFactorRay > 0n ? (Number(pos!.healthFactorRay) / Number(RAY)).toFixed(2) : 'No debt'}
                  />
                </div>
                <dl className="mt-5 space-y-2 text-[13px]">
                  <Row label="Your equity" value={usd(pos!.equity)} />
                  <Row label="Debt" value={usd(pos!.debt)} />
                </dl>
                <button
                  onClick={close}
                  disabled={busy}
                  className="mt-4 w-full rounded-full border border-[#254839]/25 px-5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:bg-[#254839]/[0.06] disabled:opacity-45"
                >
                  Close to USDG
                </button>
              </>
            )}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg tabular-nums">{value}</dd>
    </div>
  );
}
