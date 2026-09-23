'use client';

import Link from 'next/link';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { amountStr, projectNav, sharePriceStr, sharesToUsdc } from '@/lib/magicblock/agama';
import { explorerAcc } from '@/lib/magicblock/config';
import { useSolanaWallet } from '@/lib/magicblock/WalletProvider';
import { useAgama, useClock } from '@/lib/magicblock/useAgama';

// Truncate rather than round, so the USD figures match the token amounts exactly.
const usd = (n: number) =>
  `$${(Math.floor(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amt2 = (n: number) =>
  (Math.floor(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MagicBlockPortfolioPage() {
  const { address, connect } = useSolanaWallet();
  const { live, bal } = useAgama(address);
  const now = useClock();

  const nowB = BigInt(now || 0);
  const nav = live ? projectNav(live, nowB) : 0n;
  const navPrice = live ? sharePriceStr(live, nowB, 4) : '1.0000';
  const usdcN = Number(bal.usdc) / 1e6;
  const agyldN = Number(bal.agyld) / 1e6;
  const agyldValue = live ? Number(sharesToUsdc(bal.agyld, nav, live.vault.shares)) / 1e6 : 0;
  const netWorth = usdcN + agyldValue;

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
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[12px] uppercase tracking-wider text-fg-muted">Net worth</div>
              <div className="text-[34px] text-fg font-semibold tabular-nums">{usd(netWorth)}</div>
              <a
                href={explorerAcc(address.toBase58())}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-[12px] text-fg-muted break-all underline-offset-2 hover:text-fg hover:underline"
              >
                {address.toBase58()}
              </a>
            </div>

            <div className="mt-4 space-y-3">
              <Position
                symbol="USDC"
                name="USD Coin (devnet)"
                amount={amt2(usdcN)}
                sub={usd(usdcN)}
                href="/magicblock/faucet"
              />
              <Position
                symbol="agYLD"
                icon="agUSD"
                name="Yield-bearing token"
                amount={amt2(agyldN)}
                sub={`${usd(agyldValue)} · NAV ${navPrice}`}
                href="/magicblock"
              />
            </div>

            <p className="mt-4 text-[12px] text-fg-muted">
              Marked at {amountStr(nav, 6)} USDC of NAV across the lending book.
            </p>
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
  icon,
}: {
  symbol: string;
  name: string;
  amount: string;
  sub?: string;
  href: string;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]"
    >
      <TokenIcon symbol={icon ?? symbol} size={36} />
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
