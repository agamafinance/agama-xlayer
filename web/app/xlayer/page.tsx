'use client';

import { useMemo, useState } from 'react';
import { encodeFunctionData, formatUnits, parseAbi, parseUnits, type Address } from 'viem';

import { ADDR, BPS, RAY, STOCK_DECIMALS, TOKENS, USDG_DECIMALS } from '@/lib/xlayer/config';
import { earnRouterAbi, zapRouterAbi } from '@/lib/xlayer/generated/abis';
import {
  ensureAllowance, send, useXLayerMarkets, useXLayerPosition, useXLayerProtocol,
  type Market,
} from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';
import { ago, useDepositBaseline, useLastAgentAction } from '@/lib/xlayer/agents';

/// The testnet stand-in DEX, priced at the Agama oracle and allowlisted on the zap.
const testDexAbi = parseAbi([
  'function swap(address wrapper, uint256 usdgIn, uint256 priceUsdg6) returns (uint256 out)',
]);

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
  const [buying, setBuying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  // Which card the running action belongs to, so its result is reported under
  // the button that was pressed and not in the card next to it.
  const [pending, setPending] = useState<'deposit' | 'close'>('deposit');

  const token = useBase && m?.base ? m.base : m?.wrapper;
  const balance = useBase && m?.base ? m?.baseBalance : m?.balance;
  const symbol = m ? (useBase && m.base ? m.stock.wrapper.replace(/^w/, '') : m.stock.wrapper) : '';

  const amt = useMemo(() => {
    try {
      return amount ? parseUnits(amount, buying ? USDG_DECIMALS : STOCK_DECIMALS) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, buying]);

  const maxLtv = m ? Number(m.maxLtv) / 100 : 30;
  const borrowed = m && amt > 0n ? (amt * m.price / 10n ** 18n) * BigInt(Math.round(ltv * 100)) / BPS : 0n;
  const borrowedUsdg = borrowed / 10n ** 12n; // 18 -> 6 decimals
  const spread = proto ? proto.vaultApy - proto.borrowRate : undefined;
  const extra = spread !== undefined ? (spread * BigInt(Math.round(ltv * 100))) / BPS : undefined;

  const canBorrow = m ? m.borrowAllowed : true;
  const borrowBlocked = !!m && !canBorrow && ltv > 0;

  const bump = () => { setTick((t) => t + 1); refresh(); };

  /// Buy the stock and open the position in one transaction. On testnet the
  /// allowlisted venue is the oracle-priced stand-in router; on X Layer mainnet
  /// the calldata comes from the OKX aggregator through /api/zap, which signs
  /// the call server side.
  async function buyAndEarn() {
    if (!address || !m) return;
    setPending('deposit');
    const zap = ADDR.zapRouter;
    const dex = ADDR.testDexRouter;
    if (!zap) { setStatus('No zap router on this network'); return; }
    setBusy(true);
    try {
      let target: Address, spender: Address, data: `0x${string}`, minOut: bigint;
      // Whichever venue this deployment has: the stand-in router when one was
      // deployed with it, the OKX aggregator otherwise. Keying off the chain id
      // instead would send a local fork to an API that has never heard of it.
      if (dex) {
        if (!m.wrapperPrice) throw new Error('No wrapper price yet');
        target = dex; spender = dex;
        data = encodeFunctionData({
          abi: testDexAbi, functionName: 'swap', args: [m.wrapper, amt, m.wrapperPrice],
        });
        minOut = ((amt * 10n ** 18n) / m.wrapperPrice) * 98n / 100n;
      } else {
        const res = await fetch('/api/zap', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'swap', stock: m.stock.key, amount: amt.toString() }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? 'aggregator error');
        target = j.router; spender = j.spender; data = j.data; minOut = BigInt(j.minReceive);
      }
      setStatus('Approving…');
      await ensureAllowance(address, TOKENS.USDG, zap, amt);
      setStatus('Buying and opening…');
      await send(address, zap, zapRouterAbi, 'buyAndEarn',
        [amt, target, spender, data, m.adapter, minOut, BigInt(Math.round(ltv * 100))]);
      setStatus('Done');
      setAmount('');
      bump();
    } catch (e: unknown) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    if (!address || !m || !token) return;
    setPending('deposit');
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
    setPending('close');
    setBusy(true);
    try {
      setStatus('Closing…');
      // A few wei of interest can accrue between the read and the block, so the
      // router is allowed to pull a tiny top-up from the wallet.
      const topUp = parseUnits('1', USDG_DECIMALS);
      await ensureAllowance(address, TOKENS.USDG, ADDR.earnRouter, topUp);
      await send(address, ADDR.earnRouter, earnRouterAbi, 'closeToBaseWithTopUp', [m.adapter, topUp]);
      setStatus('Done');
      resetBaseline();
      bump();
    } catch (e: unknown) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const has = !!position?.hasPosition;
  const { grown, reset: resetBaseline } = useDepositBaseline(
    `agama.xlayer.deposited.${address ?? 'none'}.${m?.adapter ?? 'none'}`,
    position?.collateral,
  );
  const lastAction = useLastAgentAction(has ? position?.account : undefined, tick);

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
                {([[false, 'Deposit'], [true, 'Buy and Earn']] as const).map(([v, label]) => (
                  <button
                    key={label}
                    onClick={() => { setBuying(v); setAmount(''); }}
                    className={
                      v === buying
                        ? 'rounded-full bg-[#254839] px-4 py-1.5 text-[13px] font-medium text-[#fdf8ed]'
                        : 'rounded-full px-4 py-1.5 text-[13px] text-fg-muted hover:text-fg'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className={buying ? 'hidden' : 'mt-3 flex items-center gap-1 rounded-full bg-[#254839]/[0.06] p-1 w-fit'}>
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
                {buying
                  ? 'Do not hold the stock yet? One transaction buys it and opens the position with it.'
                  : `A stock withdrawn from the OKX app lands as ${symbol || 'the base token'}, and that is what this takes. Closing hands the same token back.`}
              </p>

              <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                <div className="flex items-center justify-between text-[12px] text-fg-muted">
                  <span>{buying ? 'Spend' : 'Deposit'}</span>
                  <button
                    onClick={() => setAmount(formatUnits(buying ? (proto?.usdg ?? 0n) : (balance ?? 0n), buying ? USDG_DECIMALS : STOCK_DECIMALS))}
                    className="hover:text-fg"
                  >
                    Balance {buying
                      ? Number(formatUnits(proto?.usdg ?? 0n, USDG_DECIMALS)).toFixed(2)
                      : qty(balance)} · Max
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
                    {buying ? 'USDG' : symbol}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-fg-muted">
                  {buying && amt > 0n && m?.wrapperPrice
                    ? `about ${qty((amt * 10n ** 18n) / m.wrapperPrice)} ${m.stock.wrapper} at ${price(m?.price)}`
                    : `${price(m?.price)} per share`}
                </div>
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
                {borrowBlocked && (
                  <p className="mt-2 text-[12px] text-[#b4571f]">
                    The equity market is closed, so new borrows are frozen on chain until it reopens.
                    You can still deposit the stock as collateral, and the position starts earning the
                    moment borrowing reopens. Slide to zero to deposit now.
                  </p>
                )}
              </div>

              <dl className="mt-4 space-y-2 text-[13px]">
                <Row label="Borrowed into the vault" value={borrowedUsdg > 0n ? usd(borrowedUsdg) : '—'} />
                <Row label="Extra yield on the stock" value={extra !== undefined && ltv > 0 ? `${rayPct(extra)} a year` : '—'} />
              </dl>

              <button
                onClick={address ? (buying ? buyAndEarn : open) : connect}
                disabled={
                  busy ||
                  borrowBlocked ||
                  (!!address && (amt === 0n || amt > (buying ? (proto?.usdg ?? 0n) : (balance ?? 0n))))
                }
                className="mt-4 w-full rounded-full bg-[#254839] px-5 py-3.5 text-[15px] font-medium text-[#fdf8ed] transition-colors hover:bg-[#1F3D31] disabled:opacity-45"
              >
                {!address
                  ? 'Connect Wallet'
                  : busy
                    ? status || 'Working…'
                    : borrowBlocked
                      ? 'Borrowing frozen, market closed'
                      : buying
                        ? 'Buy and earn'
                        : ltv > 0
                          ? 'Deposit and borrow'
                          : 'Deposit as collateral'}
              </button>
              {status && !busy && pending === 'deposit' && (
                <p className="mt-2 text-[12px] text-fg-muted">{status}</p>
              )}
            </div>

            <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <h2 className="text-[17px] font-semibold text-fg">Your position</h2>

              {!has ? (
                <>
                  <p className="mt-4 text-[14px] text-fg-muted">
                    No position yet. Deposit a stock: the USDG borrowed against it goes into the Agama vault
                    and stays in your account as the buffer that protects the stock.
                  </p>
                  <ol className="mt-5 space-y-3">
                    {[
                      ['Withdraw your stock from the OKX app to X Layer',
                       `It arrives as ${symbol || 'the base xStock'}, not the ERC-4626 wrapper lending markets take. This one takes it as it comes.`],
                      ['Deposit it here and pick one level',
                       'The protocol borrows USDG against it and puts that USDG to work in the Agama private-credit vault.'],
                      ['Then nothing',
                       'Agents hold the position at your level as the stock moves, and buy back more stock with the yield. You never have to come back.'],
                      ['Leave whenever',
                       'Closing repays from the vault shares and hands you the token an OKX deposit accepts.'],
                    ].map(([title, body], i) => (
                      <li key={title} className="flex gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#254839] text-[12px] font-medium text-[#fdf8ed]">
                          {i + 1}
                        </span>
                        <span>
                          <span className="block text-[14px] text-fg">{title}</span>
                          <span className="block text-[13px] text-fg-muted">{body}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-8">
                    <Stat
                      label={`Your ${m?.stock.wrapper}`}
                      value={qty(position?.collateral)}
                      sub={grown !== undefined ? `+${qty(grown)} added by the agents` : usd(position?.collateralValue)}
                    />
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
                  <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2" aria-hidden>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#254839] opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#254839]" />
                      </span>
                      <span className="text-[13px] font-medium text-fg">Agents running</span>
                    </div>
                    <p className="mt-1.5 text-[13px] text-fg-muted">
                      The stock moves, the debt follows it back to {pct(position?.targetLtvBps)}. The vault
                      yield above that debt is bought back as more stock. Nothing here is yours to do, and
                      nothing here is ours to control: the calls are open to anyone.
                    </p>
                    <p className="mt-2 text-[12px] text-fg-muted">
                      {lastAction
                        ? lastAction.kind === 'rebalance'
                          ? `Last action: debt ${(lastAction.debtDelta ?? 0n) >= 0n ? '+' : '-'}${usd(
                              (lastAction.debtDelta ?? 0n) < 0n ? -(lastAction.debtDelta ?? 0n) : lastAction.debtDelta ?? 0n,
                            ).replace('$', '')} USDG, ${ago(lastAction.at)}`
                          : `Last action: ${qty(lastAction.stockAdded)} ${m?.stock.wrapper} bought with the yield, ${ago(lastAction.at)}`
                        : 'No action in the last 100 blocks. The position is on target.'}
                    </p>
                  </div>
                  <button
                    onClick={close}
                    disabled={busy}
                    className="mt-4 w-full rounded-full border border-[#254839]/25 px-5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:bg-[#254839]/[0.06] disabled:opacity-45"
                  >
                    Close, send the stock back
                  </button>
                </>
              )}
              {/* Outside the branch on purpose: closing empties this card, and
                  a confirmation that unmounts with it confirms nothing. */}
              {status && !busy && pending === 'close' && (
                <p className="mt-3 text-[12px] text-fg-muted">{status}</p>
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
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[22px] font-semibold tabular-nums">{price(m.price)}</span>
            {/* While the market is closed the price is frozen on purpose, so an
                age would read as staleness. Say which it is. */}
            <span className="text-[11px] opacity-70">
              {m.marketOpen ? ago(m.observedAt) : 'at the close'}
            </span>
          </div>
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
