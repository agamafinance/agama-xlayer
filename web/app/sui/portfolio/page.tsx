'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { useSui } from '@/lib/sui/SuiContext';
import { useSuiState, useNav } from '@/lib/sui/hooks';
import { useConfidential } from '@/lib/sui/ConfidentialContext';
import { fromBaseUnits, explorerAccount } from '@/lib/sui/config';

// Client-only: derives/reveals confidential balances in place (contra + wasm).
const ConfidentialDeriver = dynamic(
  () => import('@/components/sui/ConfidentialDeriver').then((m) => m.ConfidentialDeriver),
  { ssr: false },
);

// Truncate to 2 decimals (floor) so USD values match the truncated token amounts
// (e.g. 99.999999 USDC shows as 99.99, not a rounded-up 100.00).
const usd = (n: number) => `$${(Math.floor(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SuiPortfolioPage() {
  const { address, connect } = useSui();
  const { data } = useSuiState();
  const conf = useConfidential();
  const { data: nav = 1 } = useNav(); // sagUSD NAV per share — drives the USD value

  const u = data?.user;
  // USD value per line: USDC and cagUSD are 1:1 with USD (agUSD mints/redeems 1:1);
  // only csagUSD is NAV-priced (staked shares appreciate with vault yield).
  const usdcN = u ? Number(u.usdc) / 1e6 : 0;
  const cagUsd = conf.cag !== null ? Number(conf.cag) : 0;
  const csagUsd = conf.csag !== null ? Number(conf.csag) * nav : 0;
  const netWorth = usdcN + cagUsd + csagUsd;

  return (
    <section className="px-6 md:px-24 pt-10 md:pt-14 pb-24">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="mt-2 text-[34px] text-fg font-semibold">Portfolio</h1>

        {!address ? (
          <div className="mt-8 rounded-2xl bg-[#fdfaf1] p-8 text-center shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <p className="text-[15px] text-fg-muted">Connect your wallet to view your positions.</p>
            <button type="button" onClick={connect} className="mt-4 h-11 px-6 rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31]">
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <ConfidentialDeriver />
            <div className="mt-6 rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[12px] uppercase tracking-wider text-fg-muted">Net worth</div>
              <div className="text-[34px] text-fg font-semibold tabular-nums">{usd(netWorth)}</div>
              <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="mt-1 block text-[12px] text-fg-muted break-all underline-offset-2 hover:text-fg hover:underline">
                {address}
              </a>
            </div>

            <div className="mt-4 space-y-3">
              <Position symbol="USDC" name="USD Coin" amount={u ? fromBaseUnits(u.usdc) : '—'} sub={u ? usd(usdcN) : undefined} href="/sui/faucet" />
              <Position symbol="cagUSD" name="Confidential Agama USD" amount={conf.cag ?? ''} sub={conf.cag !== null ? usd(cagUsd) : undefined} masked={conf.cag === null} onReveal={conf.requestDerive} href="/sui/swap" />
              <Position symbol="csagUSD" name="Staked cagUSD" amount={conf.csag ?? ''} sub={conf.csag !== null ? `${usd(csagUsd)} · NAV ${nav.toFixed(4)}` : undefined} masked={conf.csag === null} onReveal={conf.requestDerive} href="/sui/swap" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Position({ symbol, name, amount, sub, href, masked, onReveal }: { symbol: string; name: string; amount: string; sub?: string; href: string; masked?: boolean; onReveal?: () => void }) {
  const body = (
    <>
      <TokenIcon symbol={symbol} size={36} />
      <div>
        <div className="text-[15px] text-fg font-medium">{symbol}</div>
        <div className="text-[13px] text-fg-muted">{name}</div>
      </div>
      <div className="ml-auto text-right">
        {masked ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onReveal?.(); }}
            title="Confidential — click to derive your viewing key and reveal"
            className="text-[16px] font-semibold tracking-[0.32em] text-[#254839]/45 hover:text-[#254839] cursor-pointer"
          >
            ****
          </button>
        ) : (
          <div className="text-[16px] text-fg font-semibold tabular-nums">{amount}</div>
        )}
        {sub && <div className="text-[12px] text-fg-muted">{sub}</div>}
      </div>
    </>
  );
  const cls = 'flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]';
  // Masked rows stay put so the "****" click reveals in place; revealed rows link.
  return masked ? <div className={cls}>{body}</div> : <Link href={href} className={cls}>{body}</Link>;
}
