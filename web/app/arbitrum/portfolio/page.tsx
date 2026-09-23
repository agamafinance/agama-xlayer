'use client';

import { TokenIcon } from '@/components/icons/TokenIcon';
import { VAULTS } from '@/lib/arbitrum/config';
import { useArbitrumData } from '@/lib/arbitrum/useArbitrum';
import { useArbWallet } from '@/lib/arbitrum/WalletProvider';

export default function ArbitrumPortfolio() {
  const { address, connect } = useArbWallet();
  const { stats, account } = useArbitrumData(address);

  const sagValue = account && stats ? account.sagusd * stats.sagusdPrice : 0;
  const netWorth = account ? account.usdc + account.agusd + sagValue + account.collateralUsd - account.debt : 0;
  const collateralVaults = account ? VAULTS.filter((v) => (account.collateral[v.key] ?? 0) > 0.0001) : [];

  return (
    <section className="px-6 md:px-24 pt-10 md:pt-14 pb-24">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="mt-2 text-[34px] text-fg font-semibold">Portfolio</h1>

        {!address ? (
          <div className="mt-8 rounded-2xl bg-[#fdfaf1] p-8 text-center shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <p className="text-[15px] text-fg-muted">Connect your wallet to view your positions on Arbitrum Sepolia.</p>
            <button type="button" onClick={connect}
              className="btn-primary mt-4 h-11 px-6 rounded-full text-[#fdf8ed] text-[14px] font-medium transition">
              Connect wallet
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[12px] uppercase tracking-wider text-fg-muted">Net worth</div>
              <div className="text-[34px] text-fg font-semibold tabular-nums">
                ${netWorth.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <a href={`https://sepolia.arbiscan.io/address/${address}`} target="_blank" rel="noreferrer"
                className="mt-1 block text-[12px] text-fg-muted break-all underline-offset-2 hover:text-fg hover:underline">
                {address}
              </a>
            </div>

            {/* Lender positions */}
            <h2 className="mt-8 mb-3 text-[13px] uppercase tracking-wider text-fg-muted">Holdings</h2>
            <div className="space-y-3">
              <Position symbol="USDC" name="USD Coin" amount={account ? account.usdc.toFixed(2) : '—'} />
              <Position symbol="agUSD" name="Agama USD" amount={account ? account.agusd.toFixed(2) : '—'} />
              <Position symbol="sagUSD" name="Staked agUSD" amount={account ? account.sagusd.toFixed(2) : '—'}
                sub={account && stats ? `≈ $${sagValue.toFixed(2)}` : undefined} />
            </div>

            {/* Borrow position */}
            <h2 className="mt-8 mb-3 text-[13px] uppercase tracking-wider text-fg-muted">Borrow position</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Collateral value" value={account ? `$${account.collateralUsd.toFixed(2)}` : '—'} />
              <Metric label="Debt" value={account ? `$${account.debt.toFixed(2)}` : '—'} />
              <Metric label="Health factor"
                value={account?.hf == null ? '∞' : account.hf.toFixed(3)}
                tone={account?.hf != null && account.hf < 1 ? 'red' : account?.hf != null && account.hf < 1.2 ? 'amber' : 'green'} />
            </div>

            {collateralVaults.length > 0 && (
              <div className="mt-3 space-y-3">
                {collateralVaults.map((v) => (
                  <Position key={v.key} symbol="agUSD" name={`${v.key} · ${v.name} collateral`}
                    amount={(account!.collateral[v.key] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    sub={`${v.curator} · ${v.apyLabel}`} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Position({ symbol, name, amount, sub }: { symbol: string; name: string; amount: string; sub?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
      <TokenIcon symbol={symbol} size={36} />
      <div>
        <div className="text-[15px] text-fg font-medium">{symbol}</div>
        <div className="text-[13px] text-fg-muted">{name}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[16px] text-fg font-semibold tabular-nums">{amount}</div>
        {sub && <div className="text-[12px] text-fg-muted">{sub}</div>}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'green' }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const color = { green: 'text-fg', amber: 'text-amber-700', red: 'text-red-600' }[tone];
  return (
    <div className="rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
