'use client';

import { useState } from 'react';
import { parseUnits } from 'viem';
import { VAULTS, ADDR } from '@/lib/arbitrum/config';
import { ERC20_ABI, VAULT_ABI } from '@/lib/arbitrum/abis';
import { useArbitrumData, useWalletActions } from '@/lib/arbitrum/useArbitrum';
import { useArbWallet } from '@/lib/arbitrum/WalletProvider';
import { Stat, CuratorBadge, ActionButton } from '../ui';

const card = 'rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]';

export default function FaucetPage() {
  const { address } = useArbWallet();
  const { account, refresh } = useArbitrumData(address);
  const act = useWalletActions(address, refresh);
  const [mint, setMint] = useState<Record<string, string>>({});

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-fg-muted">
            <img src="/arbitrum.svg" alt="" className="h-4 w-4" /> Faucet · Arbitrum Sepolia
          </div>
          <h1 className="mt-3 text-[34px] md:text-[40px] leading-[1.05] text-fg font-semibold">Fund your demo wallet</h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Mint test USDC, then turn it into RWA vault shares to use as collateral — two clicks.
          </p>
          <div className="mt-7 flex flex-wrap gap-x-10 gap-y-6">
            <Stat label="Your USDC" value={account ? account.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'} />
            <Stat label="Your agUSD" value={account ? account.agusd.toFixed(2) : '—'} />
            <Stat label="Your sagUSD" value={account ? account.sagusd.toFixed(2) : '—'} />
          </div>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1100px] mx-auto space-y-5">
          <div className={card}>
            <div className="text-[16px] font-semibold text-fg">1 · Mint USDC</div>
            <p className="mt-1 text-[13px] text-fg-muted">100,000 test USDC per click.</p>
            <div className="mt-4">
              <ActionButton label="Faucet 100,000 USDC" disabled={!address}
                onClick={() => act.write(ADDR.MockUSDC, ERC20_ABI, 'faucet', [parseUnits('100000', 6)])} />
            </div>
          </div>

          <div className={card}>
            <div className="text-[16px] font-semibold text-fg">2 · Mint RWA vault shares</div>
            <p className="mt-1 text-[13px] text-fg-muted">Deposit USDC into a vault to receive its shares (collateral for borrowing).</p>
            <div className="mt-4 space-y-2.5">
              {VAULTS.map((v) => (
                <div key={v.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/60 ring-1 ring-[#254839]/8 px-3 py-2.5">
                  <CuratorBadge curator={v.curator} size="md" />
                  <div className="w-[150px] min-w-[120px]">
                    <div className="text-[14px] text-fg font-medium">{v.key}</div>
                    <div className="text-[12px] text-fg-muted">{v.curator} · {v.apyLabel}</div>
                  </div>
                  <div className="flex-1 min-w-[140px] max-w-[220px]">
                    <div className="flex items-center rounded-xl border border-[#254839]/15 bg-white px-3 h-10 focus-within:border-[#254839]/40">
                      <input value={mint[v.key] || ''} onChange={(e) => setMint((m) => ({ ...m, [v.key]: e.target.value.replace(/[^0-9.]/g, '') }))}
                        placeholder="0.0" inputMode="decimal" className="w-full bg-transparent text-[15px] text-fg outline-none tabular-nums" />
                      <span className="ml-2 text-[13px] text-fg-muted">USDC</span>
                    </div>
                  </div>
                  <ActionButton label="Mint" variant="ghost" disabled={!address || !mint[v.key]}
                    onClick={async () => {
                      const amt = parseUnits(mint[v.key] || '0', 6);
                      await act.ensure(ADDR.MockUSDC, v.address, amt);
                      await act.write(v.address, VAULT_ABI, 'deposit', [amt]);
                      setMint((m) => ({ ...m, [v.key]: '' }));
                    }} />
                  <span className="ml-auto text-[12px] text-fg-muted tabular-nums whitespace-nowrap">
                    held: {account ? (account.collateral[v.key] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
