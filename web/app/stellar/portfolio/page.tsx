'use client';

import Link from 'next/link';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { useStellar } from '@/lib/stellar/StellarContext';
import { useStellarState } from '@/lib/stellar/hooks';
import { fromBaseUnits } from '@/lib/stellar/client';
import { SHARE_PRICE_SCALE, explorerAccount } from '@/lib/stellar/config';

export default function StellarPortfolioPage() {
  const { address, connect, connecting } = useStellar();
  const { data } = useStellarState();

  const u = data?.user;
  const sagValue =
    u && data ? (u.sagusd * data.sharePrice) / BigInt(SHARE_PRICE_SCALE) : 0n;
  const netWorth = u ? u.usdc + u.agusd + sagValue : 0n;

  return (
    <section className="px-6 md:px-24 pt-10 md:pt-14 pb-24">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="mt-2 text-[34px] text-fg font-semibold">Portfolio</h1>

        {!address ? (
          <div className="mt-8 rounded-2xl bg-[#fdfaf1] p-8 text-center shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <p className="text-[15px] text-fg-muted">Connect your wallet to view your positions.</p>
            <button
              type="button"
              onClick={connect}
              className="mt-4 h-11 px-6 rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31]"
            >
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[12px] uppercase tracking-wider text-fg-muted">Net worth</div>
              <div className="text-[34px] text-fg font-semibold tabular-nums">
                ${fromBaseUnits(netWorth)}
              </div>
              <a
                href={explorerAccount(address)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-[12px] text-fg-muted break-all underline-offset-2 hover:text-fg hover:underline"
              >
                {address}
              </a>
            </div>

            <div className="mt-4 space-y-3">
              <Position symbol="USDC" name="USD Coin" amount={u ? fromBaseUnits(u.usdc) : '—'} href="/stellar/faucet" />
              <Position symbol="agUSD" name="Agama USD" amount={u ? fromBaseUnits(u.agusd) : '—'} href="/stellar/swap" />
              <Position
                symbol="sagUSD"
                name="Staked agUSD"
                amount={u ? fromBaseUnits(u.sagusd) : '—'}
                sub={u ? `≈ ${fromBaseUnits(sagValue)} agUSD` : undefined}
                href="/stellar/swap"
              />
              {u && u.pending.assets > 0n && (
                <Position
                  symbol="agUSD"
                  name="Pending withdrawal"
                  amount={fromBaseUnits(u.pending.assets)}
                  href="/stellar/swap"
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Position({
  symbol,
  name,
  amount,
  sub,
  href,
}: {
  symbol: string;
  name: string;
  amount: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]"
    >
      <TokenIcon symbol={symbol} size={36} />
      <div>
        <div className="text-[15px] text-fg font-medium">{symbol}</div>
        <div className="text-[13px] text-fg-muted">{name}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[16px] text-fg font-semibold tabular-nums">{amount}</div>
        {sub && <div className="text-[12px] text-fg-muted">{sub}</div>}
      </div>
    </Link>
  );
}
