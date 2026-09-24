'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatUnits, type Address } from 'viem';

import { TokenIcon } from '@/components/icons/TokenIcon';
import { ADAPTERS, ADDR, EXPLORER, RAY, STOCK_DECIMALS, STOCKS, TOKENS, USDG_DECIMALS } from '@/lib/xlayer/config';
import { accountAbi, amplifyRouterAbi, earnRouterAbi, lendingPoolAbi } from '@/lib/xlayer/generated/abis';
import {
  atLiveRate, erc20Abi, pub, useTick, useXLayerMarkets, useXLayerProtocol,
  type AmplifyPosition, type RouterPosition,
} from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

const usd = (v: bigint) =>
  `$${Number(formatUnits(v, USDG_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: bigint, dp = 4) => Number(formatUnits(v, STOCK_DECIMALS)).toFixed(dp);

const ZERO = '0x0000000000000000000000000000000000000000';

interface StockRow {
  key: string;
  account: Address;
  symbol: string;
  name: string;
  /// Held: in the wallet plus deposited as collateral. It is one holding.
  amount: bigint;
  value: bigint;
  deposited: bigint;
  debt: bigint;
  hf: bigint;
}

export default function XLayerPortfolioPage() {
  const { address, connect } = useXLayerWallet();
  const [tick] = useTick();
  const proto = useXLayerProtocol(address, tick);
  const { markets } = useXLayerMarkets(address);

  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [amp, setAmp] = useState<AmplifyPosition | null>(null);
  const [supplied, setSupplied] = useState(0n);
  const [buffer, setBuffer] = useState(0n);

  useEffect(() => {
    if (!address) { setStocks([]); setAmp(null); setSupplied(0n); setBuffer(0n); return; }
    let alive = true;
    (async () => {
      try {
        const rows = await Promise.all(STOCKS.map(async (st) => {
          const wrapper = TOKENS[st.wrapper];
          const m = markets.find((x) => x.stock.key === st.key);
          const [p, baseHeld] = await Promise.all([
            pub.readContract({
              address: ADDR.earnRouter, abi: earnRouterAbi, functionName: 'position',
              args: [address, ADAPTERS[st.key]],
            }) as Promise<RouterPosition>,
            pub.readContract({
              address: wrapper, abi: erc20Abi, functionName: 'asset',
            }).then((base) => pub.readContract({
              address: base as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address],
            })) as Promise<bigint>,
          ]);
          // One holding, wherever it sits: pledged as collateral, wrapped in the
          // wallet, or in the base token OKX sends. Add it up in wrapper shares,
          // which is the unit the price is quoted in, then say it in the base
          // token, which is the one the app names.
          const fromBase = baseHeld === 0n ? 0n : ((await pub.readContract({
            address: wrapper, abi: erc20Abi, functionName: 'convertToShares', args: [baseHeld],
          }).catch(() => baseHeld)) as bigint);
          const shares = p.collateral + (m?.balance ?? 0n) + fromBase;
          const amount = shares === 0n ? 0n : ((await pub.readContract({
            address: wrapper, abi: erc20Abi, functionName: 'convertToAssets', args: [shares],
          }).catch(() => shares)) as bigint);
          return {
            key: st.key, symbol: st.base, name: st.name, account: p.account,
            amount, value: (shares * (m?.wrapperPrice ?? 0n)) / 10n ** BigInt(STOCK_DECIMALS),
            deposited: p.collateral, debt: p.debt, hf: p.healthFactorRay,
          };
        }));
        // The Agama account is one per wallet, so its vault buffer is counted
        // once here, not once per stock, and at the rate it would be redeemed
        // at rather than the capped rate Arrow lends against.
        const acct = rows.find((r) => r.account !== ZERO)?.account;
        const buffer = acct
          ? ((await pub.readContract({
              address: acct, abi: accountAbi, functionName: 'redeemableUsdg',
            }).catch(() => 0n)) as bigint)
          : 0n;
        const a = await atLiveRate((await pub.readContract({
          address: ADDR.amplifyRouter, abi: amplifyRouterAbi, functionName: 'position', args: [address],
        })) as AmplifyPosition);
        const shares = (await pub.readContract({
          address: ADDR.pool, abi: erc20Abi, functionName: 'balanceOf', args: [address],
        })) as bigint;
        const lent = shares > 0n
          ? ((await pub.readContract({
              address: ADDR.pool, abi: lendingPoolAbi, functionName: 'convertToAssets', args: [shares],
            })) as bigint)
          : 0n;
        if (alive) {
          setStocks(rows.filter((r) => r.amount > 0n || r.debt > 0n));
          setAmp(a.exposure > 0n ? a : null);
          setSupplied(lent);
          setBuffer(buffer);
        }
      } catch (e) {
        console.error('xlayer portfolio', e);
      }
    })();
    return () => { alive = false; };
  }, [address, tick, markets]);

  const wallet = proto?.usdg ?? 0n;
  // What the wallet would be worth if everything were unwound right now: the
  // stock at the oracle, plus the vault buffer behind it, less what is owed.
  const netWorth =
    wallet + supplied + buffer + (amp?.equity ?? 0n)
    + stocks.reduce((t, r) => t + r.value - r.debt, 0n);

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
              className="mt-4 h-11 rounded-full bg-[#254839] px-6 text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31]"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
              <div className="text-[12px] uppercase tracking-wider text-fg-muted">Net worth</div>
              <div className="text-[34px] font-semibold tabular-nums text-fg">{usd(netWorth)}</div>
              <a
                href={`${EXPLORER}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
              >
                {address}
              </a>
            </div>

            <div className="mt-4 space-y-3">
              {stocks.map((r) => (
                <Row
                  key={r.key}
                  icon={r.symbol}
                  title={r.symbol}
                  name={`${r.name} · ${
                    r.debt > 0n
                      ? `${usd(r.debt)} borrowed`
                      : r.deposited > 0n ? 'deposited, nothing borrowed' : 'in your wallet'
                  }`}
                  amount={qty(r.amount)}
                  sub={
                    r.debt > 0n
                      ? `${usd(r.value)} · health ${(Number(r.hf) / Number(RAY)).toFixed(2)}`
                      : usd(r.value)
                  }
                  href="/xlayer"
                />
              ))}

              {amp && (
                <Row
                  icon="sagUSD"
                  title="Amplify"
                  name={`Vault loop at ${(Number(amp.leverageBps) / 10_000).toFixed(2)}x`}
                  amount={Number(formatUnits(amp.exposure, USDG_DECIMALS)).toFixed(2)}
                  sub={`${usd(amp.equity)} of equity · ${usd(amp.debt)} borrowed`}
                  href="/xlayer/amplify"
                />
              )}

              {supplied > 0n && (
                <Row
                  icon="USDG"
                  title="Supplied to Arrow"
                  name="Lending USDG against tokenized stocks"
                  amount={Number(formatUnits(supplied, USDG_DECIMALS)).toFixed(2)}
                  sub={`${usd(supplied)} · redeemable now`}
                  href="/xlayer/lend"
                />
              )}

              <Row
                icon="USDG"
                title="USDG"
                name="Global Dollar"
                amount={Number(formatUnits(wallet, USDG_DECIMALS)).toFixed(2)}
                sub={usd(wallet)}
                href="/xlayer/faucet"
              />

              {stocks.length === 0 && !amp && supplied === 0n && wallet === 0n && (
                <p className="rounded-2xl bg-[#fdfaf1] px-5 py-4 text-[14px] text-fg-muted shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
                  No position yet. Deposit a stock on{' '}
                  <Link href="/xlayer" className="underline underline-offset-2">Earn</Link> and the agents take it
                  from there, or lend USDG on{' '}
                  <Link href="/xlayer/lend" className="underline underline-offset-2">Arrow</Link>.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Row({
  icon, title, name, amount, sub, href,
}: { icon: string; title: string; name: string; amount: string; sub?: string; href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06)]"
    >
      <TokenIcon symbol={icon} size={36} />
      <div>
        <div className="text-[15px] font-medium text-fg">{title}</div>
        <div className="text-[13px] text-fg-muted">{name}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[16px] font-semibold tabular-nums text-fg">{amount}</div>
        {sub && <div className="text-[12px] text-fg-muted">{sub}</div>}
      </div>
    </Link>
  );
}
