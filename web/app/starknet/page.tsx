'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavChart from '@/components/starknet/NavChart';
import { ADDRESSES, EXPLORER } from '@/lib/starknet/config';
import {
  amountStr,
  blendedAprPct,
  depositCalls,
  fromUnits,
  projectNav,
  projectPoolValue,
  readU256,
  readVaultState,
  redeemCalls,
  sharePriceStr,
  sharesToUsdc,
  toUnits,
  type VaultState,
} from '@/lib/starknet/agama';
import { useStarknetWallet } from '@/lib/starknet/WalletProvider';

const WINDOW = 150; // live-chart points (~2.5 min at 1s)

export default function StarknetEarnPage() {
  const { address, wallet, connect } = useStarknetWallet();
  const [vault, setVault] = useState<VaultState | null>(null);
  const [now, setNow] = useState<number>(0); // seeded on mount to avoid hydration mismatch
  const [series, setSeries] = useState<number[]>([]);
  const [bal, setBal] = useState({ usdc: 0n, agusd: 0n });
  const [tab, setTab] = useState<'deposit' | 'redeem'>('deposit');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [txs, setTxs] = useState<{ label: string; hash: string }[]>([]);

  // 1s clock drives the live price projection (real time set only after mount).
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const loadVault = useCallback(async () => {
    try {
      setVault(await readVaultState());
    } catch {
      /* ignore transient read errors */
    }
  }, []);

  useEffect(() => {
    loadVault();
    const t = setInterval(loadVault, 30000);
    return () => clearInterval(t);
  }, [loadVault]);

  // Build the live price series: seed a window by back-projecting the exact on-chain
  // formula, then append one real sample per tick so the chart scrolls live.
  useEffect(() => {
    if (!vault || now === 0) return;
    const price = parseFloat(sharePriceStr(vault, BigInt(now), 8));
    setSeries((s) => {
      const base =
        s.length > 0
          ? s
          : Array.from({ length: WINDOW - 1 }, (_, k) =>
              parseFloat(sharePriceStr(vault, BigInt(now - (WINDOW - 1) + k), 8)),
            );
      return [...base, price].slice(-WINDOW);
    });
  }, [now, vault]);

  const refresh = useCallback(async (addr?: string) => {
    if (!addr) return;
    try {
      const [usdc, agusd] = await Promise.all([
        readU256(ADDRESSES.usdc, 'balanceOf', [addr]),
        readU256(ADDRESSES.agusd, 'balance_of', [addr]),
      ]);
      setBal({ usdc, agusd });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (address) refresh(address);
    else setBal({ usdc: 0n, agusd: 0n });
  }, [address, refresh]);

  const nowB = BigInt(now || 0);
  const nav = vault ? projectNav(vault, nowB) : 0n;
  const price = vault ? sharePriceStr(vault, nowB, 8) : '1.00000000';
  const userValue = vault ? sharesToUsdc(bal.agusd, nav, vault.supply) : 0n;

  const amt = toUnits(amount);
  // Estimated output for the amount panel.
  const estOut = useMemo(() => {
    if (amt <= 0n || !vault) return 0n;
    const p = parseFloat(price) || 1;
    if (tab === 'deposit') return BigInt(Math.round((Number(amt) / p))); // USDC -> agYLD shares
    return sharesToUsdc(amt, nav, vault.supply); // agYLD -> USDC
  }, [amt, tab, price, nav, vault]);

  const send = async () => {
    if (!wallet?.account) {
      connect();
      return;
    }
    const label = tab === 'deposit' ? 'Deposit' : 'Redeem';
    const calls = tab === 'deposit' ? depositCalls(amt) : redeemCalls(amt);
    try {
      setBusy(true);
      setStatus(`${label}…`);
      const tx = await wallet.account.execute(calls);
      setStatus(`${label} sent`);
      setTxs((t) => [{ label, hash: tx.transaction_hash }, ...t].slice(0, 8));
      setAmount('');
      // Auto-update: poll the on-chain balances until they reflect the tx, then
      // refresh the UI on its own a few seconds after the deposit (no manual reload).
      const isDep = tab === 'deposit';
      const watched = isDep ? bal.usdc : bal.agusd;
      void (async () => {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const [usdc, agusd] = await Promise.all([
              readU256(ADDRESSES.usdc, 'balanceOf', [address]),
              readU256(ADDRESSES.agusd, 'balance_of', [address]),
            ]);
            if ((isDep ? usdc : agusd) !== watched) {
              setBal({ usdc, agusd });
              loadVault();
              setStatus(`${label} confirmed`);
              break;
            }
          } catch {
            /* keep polling */
          }
        }
      })();
    } catch (e: any) {
      setStatus('Error: ' + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const fromBal = tab === 'deposit' ? bal.usdc : bal.agusd;
  const fromSym = tab === 'deposit' ? 'USDC' : 'agYLD';
  const toSym = tab === 'deposit' ? 'agYLD' : 'USDC';
  const canSend = !!address && amt > 0n && amt <= fromBal;

  return (
    <>
      {/* Header */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <div aria-hidden className="pointer-events-none absolute right-0 -top-2 z-20 hidden lg:block">
            <img src="/logos/coin-pair.svg" alt="" className="h-[300px] w-auto" />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            A yield-bearing token
            <br />
            settled on Starknet
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Deposit USDC to mint agYLD, a yield-bearing token whose price rises as Agama&apos;s
            private-credit lending pools earn. Live on Starknet Sepolia, with STRK20, Starknet&apos;s
            native privacy layer, for shielded deposits.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Net APY" value={vault ? `${blendedAprPct(vault, nav)}%` : '—'} />
            <Stat label="Price / share" value={vault ? `${sharePriceStr(vault, nowB, 4)} USDC` : '—'} />
            <Stat
              label="Your agYLD"
              value={address ? fromUnits(bal.agusd) : '—'}
              sub={address && bal.agusd > 0n ? `= ${amountStr(userValue, 6)} USDC` : undefined}
            />
          </div>
        </div>
      </section>

      {/* Chart + swap + pools */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] items-start">
            {/* Price-per-share chart */}
            <NavChart vault={vault} now={now} live={series} />

            {/* Deposit / Redeem card */}
            <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="flex items-center gap-1 rounded-full bg-[#254839]/[0.06] p-1 w-fit">
                {(['deposit', 'redeem'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setAmount(''); }}
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

              {/* FROM */}
              <div className="mt-4 rounded-2xl border border-[#254839]/12 bg-white/60 p-4">
                <div className="flex items-center justify-between text-[12px] text-fg-muted">
                  <span>From</span>
                  <button
                    onClick={() => setAmount(amountStr(fromBal, 6))}
                    className="hover:text-fg"
                  >
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

              {/* arrow */}
              <div className="my-1.5 flex justify-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#254839] text-[#fdf8ed]">↓</span>
              </div>

              {/* TO */}
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
                      ? 'Deposit'
                      : 'Redeem'}
              </button>
              {status && <div className="mt-3 text-center text-[13px] text-fg-muted">{status}</div>}

              {txs.length > 0 && (
                <div className="mt-4 border-t border-[#254839]/10 pt-3">
                  <div className="text-[11px] uppercase tracking-wider text-fg-muted">Transactions (Sepolia)</div>
                  {txs.map((t) => (
                    <div key={t.hash} className="mt-1.5 flex items-center justify-between text-[13px]">
                      <span className="text-fg-muted">{t.label}</span>
                      <a
                        href={`${EXPLORER}/tx/${t.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-fg underline decoration-[#254839]/30 underline-offset-2 hover:decoration-[#254839]"
                      >
                        {t.hash.slice(0, 8)}…{t.hash.slice(-4)} ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lending pools */}
          <div>
            <h2 className="text-[13px] uppercase tracking-wider text-fg-muted pt-4 pb-1">Lending pools behind agYLD</h2>
            <p className="text-[13px] text-fg-muted max-w-[680px] mb-4">
              Deposited USDC is allocated across these pools by Agama&apos;s{' '}
              <span className="text-fg">Allocation Engine</span>. Each accrues yield at its own APR,
              every block, and lifts the agYLD price.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(vault?.pools ?? []).map((p) => (
                <a
                  key={p.address}
                  href={`${EXPLORER}/contract/${p.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] hover:ring-1 hover:ring-[#254839]/20 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-fg font-medium">{p.label}</span>
                    <span className="rounded-full bg-[#254839]/[0.08] px-2.5 py-1 text-[11px] text-fg-muted">
                      {(Number(p.aprBps) / 100).toFixed(0)}% APR
                    </span>
                  </div>
                  <div className="text-[13px] text-fg-muted">{p.sector}</div>
                  <div className="mt-3 text-[22px] font-semibold text-fg tabular-nums">
                    {amountStr(projectPoolValue(p, nowB), 6)}
                  </div>
                  <div className="text-[12px] text-fg-muted">USDC · marked live</div>
                </a>
              ))}
              {!vault && <div className="text-[13px] text-fg-muted">Loading pools…</div>}
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
