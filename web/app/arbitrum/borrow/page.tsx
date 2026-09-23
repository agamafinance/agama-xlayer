'use client';

import { useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { Space_Grotesk } from 'next/font/google';
import { VAULTS, ADDR } from '@/lib/arbitrum/config';
import { POOL_ABI } from '@/lib/arbitrum/abis';
import { useArbitrumData, useWalletActions } from '@/lib/arbitrum/useArbitrum';
import { useArbWallet } from '@/lib/arbitrum/WalletProvider';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'] });
const curatorLogo = (c: string) => (c === 'Qiro' ? '/qiro-icon.svg' : '/tenka.svg');

export default function ArbitrumBorrow() {
  const { address } = useArbWallet();
  const { stats, vaults, account, refresh } = useArbitrumData(address);
  const act = useWalletActions(address, refresh);
  const [sel, setSel] = useState('tMEZ');
  const [col, setCol] = useState('');
  const [borrow, setBorrow] = useState('');
  const [stress, setStress] = useState(0);

  const vault = VAULTS.find((v) => v.key === sel)!;
  const live = vaults[sel];
  const hf = account?.hf ?? null;

  const stressedHf = useMemo(() => {
    if (!account || account.debt === 0) return null;
    let weighted = 0;
    for (const v of VAULTS) {
      const shares = account.collateral[v.key] ?? 0;
      if (!shares) continue;
      const nav = vaults[v.key]?.nav ?? 1;
      const hair = v.key === sel ? 1 - stress / 100 : 1;
      weighted += shares * nav * hair * v.threshold;
    }
    return account.debt > 0 ? weighted / account.debt : null;
  }, [account, vaults, sel, stress]);

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto">
          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            Borrow USDC against
            <br />
            real-world collateral
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Deposit tokenized Qiro &amp; Tenka credit-vault shares and borrow USDC up to the vault
            LTV. Your health factor updates live; a NAV drop is what triggers liquidation.
          </p>
          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Your debt" value={account ? `$${account.debt.toFixed(2)}` : '—'} />
            <Stat label="Collateral" value={account ? `$${account.collateralUsd.toFixed(2)}` : '—'} />
            <Stat label="Health factor" value={fmtHf(hf)} valueClass={hfColor(hf)} />
            <Stat label="Borrow APR" value={stats ? `${stats.borrowRate.toFixed(2)}%` : '—'} />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-4 lg:grid-cols-[1fr_360px] items-stretch">
          {/* left column */}
          <div className="flex flex-col gap-4">
            {/* collateral */}
            <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[15px] text-fg font-medium mb-3">Collateral</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {VAULTS.map((v) => (
                  <button key={v.key} type="button" onClick={() => setSel(v.key)}
                    className={`flex items-center gap-1.5 rounded-full pl-1.5 pr-3 h-9 text-[13px] transition-colors ${sel === v.key ? 'bg-[#254839] text-[#fdf8ed]' : 'bg-white text-[#254839] ring-1 ring-[#254839]/10 hover:bg-[#254839]/[0.05]'}`}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-[#254839]/10">
                      <img src={curatorLogo(v.curator)} alt="" className="h-3.5 w-3.5 object-contain" />
                    </span>
                    {v.key}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 text-[13px] mb-4">
                <Mini label="NAV / share" value={live ? `$${live.nav.toFixed(4)}` : '—'} />
                <Mini label="Max LTV" value={`${(vault.ltv * 100).toFixed(0)}%`} />
                <Mini label="You deposited" value={account ? (account.collateral[sel] ?? 0).toFixed(0) : '—'} />
              </div>
              <AmountInput value={col} onChange={setCol} suffix={`${sel} shares`} />
              <div className="mt-3 flex gap-2">
                <Btn label="Deposit collateral" primary disabled={!address || !col}
                  onClick={async () => { const a = parseUnits(col || '0', 18); await act.ensure(vault.address, ADDR.LendingPool, a); await act.write(ADDR.LendingPool, POOL_ABI, 'depositCollateral', [vault.address, a]); setCol(''); }} />
                <Btn label="Withdraw" disabled={!address || !col}
                  onClick={async () => { await act.write(ADDR.LendingPool, POOL_ABI, 'withdrawCollateral', [vault.address, parseUnits(col || '0', 18)]); setCol(''); }} />
              </div>
            </div>

            {/* borrow / repay */}
            <div className="flex-1 rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[15px] text-fg font-medium mb-3">Borrow / repay USDC</div>
              <AmountInput value={borrow} onChange={setBorrow} suffix="USDC" />
              <div className="mt-3 flex gap-2">
                <Btn label="Borrow" primary disabled={!address || !borrow}
                  onClick={async () => { await act.write(ADDR.LendingPool, POOL_ABI, 'borrow', [parseUnits(borrow || '0', 6)]); setBorrow(''); }} />
                <Btn label="Repay" disabled={!address || !borrow}
                  onClick={async () => { const a = parseUnits(borrow || '0', 6); await act.ensure(ADDR.MockUSDC, ADDR.LendingPool, a); await act.write(ADDR.LendingPool, POOL_ABI, 'repay', [a]); setBorrow(''); }} />
              </div>
            </div>
          </div>

          {/* right column */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="flex items-center justify-between">
                <div className="text-[15px] text-fg font-medium">Health factor</div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${hf == null ? 'bg-emerald-500/12 text-emerald-700' : hf < 1 ? 'bg-red-500/12 text-red-700' : hf < 1.25 ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/12 text-emerald-700'}`}>
                  {hf == null ? 'no debt' : hf < 1 ? 'liquidatable' : hf < 1.25 ? 'at risk' : 'safe'}
                </span>
              </div>
              <div className={`mt-2 text-[36px] font-semibold tabular-nums ${hfColor(hf)}`}>{fmtHf(hf)}</div>
              <div className="mt-3 h-2.5 w-full rounded-full bg-[#254839]/10 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${hf == null ? 100 : Math.min(hf / 2, 1) * 100}%`, background: hf == null ? '#10b981' : hf < 1 ? '#ef4444' : hf < 1.25 ? '#f59e0b' : '#10b981' }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-fg-muted"><span>0</span><span>1.0 · liquidation</span><span>2.0+</span></div>
              <p className="mt-3 text-[12px] text-fg-muted">Below 1.0 anyone can liquidate (50% close factor + bonus).</p>
            </div>

            <div className="flex-1 rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[15px] text-fg font-medium">NAV stress test</div>
              <p className="mt-1 text-[12px] text-fg-muted">Simulate a credit event on {sel}: drop its NAV, watch your health factor.</p>
              <input type="range" min={0} max={60} value={stress} onChange={(e) => setStress(Number(e.target.value))} className="mt-4 w-full accent-[#254839]" />
              <div className="mt-1 flex justify-between text-[12px] text-fg-muted"><span>−{stress}% NAV</span><span>{sel}</span></div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-fg-muted">Stressed HF</div>
                  <div className={`text-[28px] font-semibold tabular-nums ${hfColor(stressedHf)}`}>{fmtHf(stressedHf)}</div>
                </div>
                {stressedHf != null && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${stressedHf < 1 ? 'bg-red-500/12 text-red-700' : stressedHf < 1.25 ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/12 text-emerald-700'}`}>
                    {stressedHf < 1 ? 'liquidatable' : stressedHf < 1.25 ? 'at risk' : 'safe'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// Format a health factor for display: ∞ when there's no debt, capped so a near-infinite
// value never floods the UI, otherwise 2 decimals.
function fmtHf(hf: number | null) {
  if (hf == null) return '∞';
  if (hf >= 100) return '99+';
  return hf.toFixed(2);
}
function hfColor(hf: number | null) {
  if (hf == null) return 'text-emerald-700';
  if (hf < 1) return 'text-red-600';
  if (hf < 1.25) return 'text-amber-700';
  return 'text-emerald-700';
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={`text-[26px] font-semibold tabular-nums ${valueClass || 'text-fg'}`}>{value}</div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#254839]/8">
      <div className="text-[11px] text-fg-muted">{label}</div>
      <div className="text-[14px] text-fg tabular-nums">{value}</div>
    </div>
  );
}
function AmountInput({ value, onChange, suffix }: { value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div className="flex items-center rounded-xl border border-[#254839]/15 bg-white px-3 h-11 focus-within:border-[#254839]/40">
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" inputMode="decimal"
        className="flex-1 bg-transparent text-[15px] text-fg outline-none tabular-nums" />
      <span className="ml-2 text-[13px] text-fg-muted">{suffix}</span>
    </div>
  );
}
function Btn({ label, onClick, primary, disabled }: { label: string; onClick: () => Promise<void>; primary?: boolean; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={disabled || busy}
        onClick={async () => { setErr(null); setBusy(true); try { await onClick(); } catch (e: any) { setErr(e?.shortMessage || e?.message || 'failed'); } finally { setBusy(false); } }}
        className={`rounded-full h-10 px-5 text-[14px] font-medium transition disabled:opacity-40 ${primary ? 'btn-primary text-[#fdf8ed]' : 'border border-[#254839]/25 text-[#254839] hover:bg-[#254839]/[0.06]'}`}>
        {busy ? '…' : label}
      </button>
      {err && <span className="text-[11px] text-red-600 max-w-[200px] truncate" title={err}>{err}</span>}
    </div>
  );
}
