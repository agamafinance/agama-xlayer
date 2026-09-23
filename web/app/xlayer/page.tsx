'use client';

import { useMemo, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';

import { ADDR, BPS, RAY, STOCK_DECIMALS, TOKENS, USDG_DECIMALS } from '@/lib/xlayer/config';
import { earnRouterAbi } from '@/lib/xlayer/generated/abis';
import {
  ensureAllowance, send, useXLayerMarkets, useXLayerPosition, useXLayerProtocol,
  type Market,
} from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

const pct = (bps: bigint | undefined) => (bps === undefined ? '—' : `${Number(bps) / 100}%`);
const usd = (v: bigint | undefined) =>
  v === undefined ? '—' : `$${Number(formatUnits(v, USDG_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const qty = (v: bigint | undefined, dp = 4) =>
  v === undefined ? '—' : Number(formatUnits(v, STOCK_DECIMALS)).toFixed(dp);
const rayPct = (v: bigint | undefined) => (v === undefined ? '—' : `${(Number(v) / Number(RAY) * 100).toFixed(2)}%`);
const price = (v: bigint | undefined) =>
  v === undefined || v === 0n ? '—' : `$${Number(formatUnits(v, 18)).toFixed(2)}`;

export default function XLayerEarnPage() {
  const { address, connect } = useXLayerWallet();
  const { markets, refresh } = useXLayerMarkets(address);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState(0);
  const m: Market | undefined = markets[sel];

  const proto = useXLayerProtocol(address, tick);
  const position = useXLayerPosition(address, m?.adapter, tick);

  const [amount, setAmount] = useState('');
  const [ltv, setLtv] = useState(25);
  const [useBase, setUseBase] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const token = useBase && m?.base ? m.base : m?.wrapper;
  const balance = useBase && m?.base ? m?.baseBalance : m?.balance;
  const symbol = m ? (useBase && m.base ? m.stock.wrapper.replace(/^w/, '') : m.stock.wrapper) : '';

  const amt = useMemo(() => {
    try {
      return amount ? parseUnits(amount, STOCK_DECIMALS) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const maxLtv = m ? Number(m.maxLtv) / 100 : 30;
  const borrowed = m && amt > 0n ? (amt * m.price / 10n ** 18n) * BigInt(Math.round(ltv * 100)) / BPS : 0n;
  const borrowedUsdg = borrowed / 10n ** 12n; // 18 -> 6 decimals
  const spread = proto ? proto.vaultApy - proto.borrowRate : undefined;
  const extra = spread !== undefined ? (spread * BigInt(Math.round(ltv * 100))) / BPS : undefined;

  const bump = () => { setTick((t) => t + 1); refresh(); };

  async function open() {
    if (!address || !m || !token) return;
    setBusy(true);
    try {
      setStatus('Approving…');
      await ensureAllowance(address, token, ADDR.earnRouter, amt);
      setStatus('Opening the position…');
      const fn = useBase && m.base ? 'openWithBase' : 'open';
      await send(address, ADDR.earnRouter, earnRouterAbi, fn, [m.adapter, amt, BigInt(Math.round(ltv * 100))]);
      setStatus('Done');
      setAmount('');
      bump();
    } catch (e: unknown) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!address || !m) return;
    setBusy(true);
    try {
      setStatus('Closing…');
      // A few wei of interest can accrue between the read and the block, so the
      // router is allowed to pull a tiny top-up from the wallet.
      const topUp = parseUnits('1', USDG_DECIMALS);
      await ensureAllowance(address, TOKENS.USDG, ADDR.earnRouter, topUp);
      await send(address, ADDR.earnRouter, earnRouterAbi, 'closeToBaseWithTopUp', [m.adapter, topUp]);
      setStatus('Done');
      bump();
    } catch (e: unknown) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const has = !!position?.hasPosition;
  const grown = has && position ? position.collateral : undefined;

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            Deposit your stock,
            <br />
            get more stock
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Deposit a tokenized stock, straight out of the OKX app. Agama borrows USDG against it into
            the private-credit vault, and permissionless agents turn that yield back into more of your
            stock and hold the position at the level you picked. Live on X Layer Testnet.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Vault APY" value={rayPct(proto?.vaultApy)} sub={proto?.vaultApyIsTarget ? 'Target, not yet measured' : 'Realized'} />
            <Stat label="Borrow APR" value={rayPct(proto?.borrowRate)} sub="USDG, variable" />
            <Stat label="Spread you earn" value={rayPct(spread)} sub="On every USDG borrowed" />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-5">
          <MarketCards markets={markets} sel={sel} onSelect={setSel} connected={!!address} />

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr] items-start">
            <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold text-fg">Deposit {m?.stock.wrapper ?? ''}</h2>
                {m && (
                  <span className={m.marketOpen ? 'rounded-full bg-[#254839]/[0.06] px-3 py-1 text-[12px] text-fg' : 'rounded-full bg-[#b4571f]/10 px-3 py-1 text-[12px] text-[#b4571f]'}>
                    {m.marketOpen ? 'Market open' : 'Market closed'}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-1 rounded-full bg-[#254839]/[0.06] p-1 w-fit">
                {([[true, 'From OKX'], [false, 'Wrapped']] as const).map(([v, label]) => (
                  <button
                    key={label}
                    onClick={() => { setUseBase(v); setAmount(''); }}
                    className={
                      v === useBase
                        ? 'rounded-full bg-[#254839] px-4 py-1.5 text-[13px] font-medium text-[#fdf8ed]'
                        : 'rounded-full px-4 py-1.5 text-[13px] text-fg-muted hover:text-fg'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-fg-muted">
                A stock withdrawn from the OKX app lands as {symbol || 'the base token'}, and that is what
                this takes. Closing hands the same token back.
              </p>

              <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                <div className="flex items-center justify-between text-[12px] text-fg-muted">
                  <span>Deposit</span>
                  <button onClick={() => setAmount(formatUnits(balance ?? 0n, STOCK_DECIMALS))} className="hover:text-fg">
                    Balance {qty(balance)} · Max
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
                    {symbol}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-fg-muted">{price(m?.price)} per share</div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                <div className="flex items-center justify-between text-[12px] text-fg-muted">
                  <span>How hard your stock works</span>
                  <span className="text-fg">{ltv.toFixed(0)}% LTV</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxLtv}
                  step={1}
                  value={ltv}
                  onChange={(e) => setLtv(Number(e.target.value))}
                  className="mt-3 w-full accent-[#254839]"
                />
                <div className="mt-1 flex justify-between text-[11px] text-fg-muted">
                  <span>Off, deposit only</span>
                  <span>{maxLtv}% market max</span>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-[13px]">
                <Row label="Borrowed into the vault" value={borrowedUsdg > 0n ? usd(borrowedUsdg) : '—'} />
                <Row label="Extra yield on the stock" value={extra !== undefined && ltv > 0 ? `${rayPct(extra)} a year` : '—'} />
              </dl>

              <button
                onClick={address ? open : connect}
                disabled={busy || (!!address && (amt === 0n || amt > (balance ?? 0n)))}
                className="mt-4 w-full rounded-full bg-[#254839] px-5 py-3.5 text-[15px] font-medium text-[#fdf8ed] transition-colors hover:bg-[#1F3D31] disabled:opacity-45"
              >
                {!address ? 'Connect Wallet' : busy ? status || 'Working…' : ltv > 0 ? 'Deposit and borrow' : 'Deposit as collateral'}
              </button>
              {status && !busy && <p className="mt-2 text-[12px] text-fg-muted">{status}</p>}
            </div>

            <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <h2 className="text-[17px] font-semibold text-fg">Your position</h2>

              {!has ? (
                <p className="mt-4 text-[14px] text-fg-muted">
                  No position yet. Deposit a stock: the USDG borrowed against it goes into the Agama vault
                  and stays in your account as the buffer that protects the stock.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-8">
                    <Stat label={`Your ${m?.stock.wrapper}`} value={qty(grown)} sub={usd(position?.collateralValue)} />
                    <Stat
                      label="Health factor"
                      value={position && position.healthFactorRay > 0n ? (Number(position.healthFactorRay) / Number(RAY)).toFixed(2) : 'No debt'}
                      sub="Agents act at 1.15"
                    />
                  </div>
                  <dl className="mt-5 space-y-2 text-[13px]">
                    <Row label="Debt" value={usd(position?.debt)} />
                    <Row label="Yield buffer" value={usd(position?.freeSharesValue)} />
                    <Row label="Target level" value={pct(position?.targetLtvBps)} />
                  </dl>
                  <p className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4 text-[13px] text-fg-muted">
                    Agents hold this position at your level and turn the vault yield into more stock.
                    Anyone can run them, so you never have to come back.
                  </p>
                  <button
                    onClick={close}
                    disabled={busy}
                    className="mt-4 w-full rounded-full border border-[#254839]/25 px-5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:bg-[#254839]/[0.06] disabled:opacity-45"
                  >
                    Close, send the stock back
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function MarketCards({
  markets, sel, onSelect, connected,
}: { markets: Market[]; sel: number; onSelect: (i: number) => void; connected: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {markets.map((m, i) => (
        <button
          key={m.stock.key}
          onClick={() => onSelect(i)}
          className={
            i === sel
              ? 'rounded-2xl bg-[#254839] p-4 text-left text-[#fdf8ed]'
              : 'rounded-2xl bg-[#fdfaf1] p-4 text-left text-fg transition-colors hover:bg-white'
          }
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-medium">{m.stock.wrapper}</span>
            <span className="text-[11px] opacity-70">{m.stock.name}</span>
          </div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{price(m.price)}</div>
          <div className="mt-1 text-[11px] opacity-70">
            Max LTV {pct(m.maxLtv)} · {m.marketOpen ? 'open' : 'closed'}
            {connected && m.balance > 0n ? ` · ${qty(m.balance, 2)} held` : ''}
          </div>
        </button>
      ))}
    </div>
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

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split('\n')[0].slice(0, 140);
}
