'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { ADDRESSES, EXPLORER } from '@/lib/starknet/config';
import {
  projectNav,
  readU256,
  readVaultState,
  sharePriceStr,
  sharesToUsdc,
  type VaultState,
} from '@/lib/starknet/agama';
import { useStarknetWallet } from '@/lib/starknet/WalletProvider';

// Truncate to 2 decimals (floor) so USD values match the truncated token amounts.
const usd = (n: number) =>
  `$${(Math.floor(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amt2 = (n: number) => (Math.floor(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StarknetPortfolioPage() {
  const { address, connect } = useStarknetWallet();
  const [vault, setVault] = useState<VaultState | null>(null);
  const [bal, setBal] = useState({ usdc: 0n, agusd: 0n });

  useEffect(() => {
    readVaultState().then(setVault).catch(() => {});
  }, []);

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

  const now = BigInt(Math.floor(Date.now() / 1000));
  const nav = vault ? projectNav(vault, now) : 0n;
  const navPrice = vault ? sharePriceStr(vault, now, 4) : '1.0000';
  const usdcN = Number(bal.usdc) / 1e6;
  const agusdN = Number(bal.agusd) / 1e6;
  const agusdValue = vault ? Number(sharesToUsdc(bal.agusd, nav, vault.supply)) / 1e6 : 0;
  const netWorth = usdcN + agusdValue;

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
            <div className="mt-6 rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[12px] uppercase tracking-wider text-fg-muted">Net worth</div>
              <div className="text-[34px] text-fg font-semibold tabular-nums">{usd(netWorth)}</div>
              <a href={`${EXPLORER}/contract/${address}`} target="_blank" rel="noreferrer" className="mt-1 block text-[12px] text-fg-muted break-all underline-offset-2 hover:text-fg hover:underline">
                {address}
              </a>
            </div>

            <div className="mt-4 space-y-3">
              <Position symbol="USDC" name="USD Coin" amount={amt2(usdcN)} sub={usd(usdcN)} href="/starknet/faucet" />
              <Position symbol="agYLD" icon="agUSD" name="Yield-bearing token" amount={amt2(agusdN)} sub={`${usd(agusdValue)} · NAV ${navPrice}`} href="/starknet" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Position({ symbol, name, amount, sub, href, icon }: { symbol: string; name: string; amount: string; sub?: string; href: string; icon?: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
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
