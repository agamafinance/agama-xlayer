"use client";

import {useQuery} from "@tanstack/react-query";
import {useEffect, useState, type ReactNode} from "react";
import {encodeFunctionData, parseAbi, type Address} from "viem";
import {useAccount, useReadContract} from "wagmi";

import {TxButton} from "@/components/TxButton";
import {AmountField, Divider, Pill, Row, Slider} from "@/components/ui";
import type {AppChainId} from "@/lib/chains";
import {
  BPS,
  RAY,
  STOCK_DECIMALS,
  USDG_DECIMALS,
  fmt,
  fmtRay,
  fmtUsd,
  hfToNumber,
  parseAmount,
} from "@/lib/format";
import {earnRouterAbi, zapRouterAbi} from "@/lib/generated/abis";
import {approve, useAllowance, useTokenBalance, type StockMarket} from "@/lib/hooks";
import {useTx} from "@/lib/tx";

const testDexAbi = parseAbi(["function swap(address wrapper, uint256 usdgIn, uint256 priceUsdg6) returns (uint256 out)"]);

/// The stand-in router quotes the oracle price minus a 0.3% spread.
const TEST_DEX_SPREAD_BPS = 30n;

type ZapQuote = {toTokenAmount: string; unitPrice: string | null};
type ZapSwap = {
  router: Address;
  spender: Address;
  data: `0x${string}`;
  minReceive: string;
  toTokenAmount: string;
  unitPrice: string | null;
  slippagePercent: string;
};

async function zapApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/zap", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & {error?: string};
  if (!res.ok || json.error) throw new Error(json.error || `Route request failed (${res.status})`);
  return json;
}

/// Buy the wrapped xStock through the OKX DEX aggregator and open the Earn
/// position in one transaction (AgamaZapRouter). The swap calldata is fetched
/// again right before sending: aggregator routes are short-lived.
export function BuyTicket({
  m,
  chainId,
  router,
  zap,
  testDex,
  usdg,
  spread,
  tabs,
  marketPill,
}: {
  m: StockMarket;
  chainId: AppChainId;
  router: Address;
  zap: Address;
  /// Testnet stand-in DEX: when set, the calldata is built here instead of
  /// asking the OKX aggregator through /api/zap.
  testDex?: Address;
  usdg: Address;
  spread: bigint | undefined;
  tabs?: ReactNode;
  marketPill?: ReactNode;
}) {
  const {address} = useAccount();
  const [amountStr, setAmountStr] = useState("");
  const [debounced, setDebounced] = useState("");
  const maxLtvPct = m.maxLtv !== undefined ? Number(m.maxLtv) / 100 : 30;
  const [ltvPct, setLtvPct] = useState(25);
  const ltv = Math.min(ltvPct, maxLtvPct);
  const ltvBps = BigInt(Math.round(ltv * 100));

  const amount = parseAmount(amountStr, USDG_DECIMALS) ?? 0n;
  const balance = useTokenBalance(usdg, address, chainId);
  const allowance = useAllowance(usdg, address, zap, chainId);
  const approveTx = useTx(chainId);
  const buyTx = useTx(chainId);
  const [preparing, setPreparing] = useState(false);
  const [zapError, setZapError] = useState<string>();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(amountStr), 400);
    return () => window.clearTimeout(t);
  }, [amountStr]);
  const debouncedAmount = parseAmount(debounced, USDG_DECIMALS) ?? 0n;

  const route = useQuery({
    queryKey: ["zap-quote", chainId, m.stock.key, debouncedAmount.toString()],
    enabled: !testDex && debouncedAmount > 0n,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: () => zapApi<ZapQuote>({mode: "quote", stock: m.stock.key, amount: debouncedAmount.toString()}),
  });

  // Testnet: the stand-in router prices at the Agama oracle, so the preview is
  // exact and needs no round trip. Mainnet: the OKX aggregator quote.
  const oraclePrice = m.wrapperPrice;
  const priceOk = oraclePrice !== undefined && oraclePrice > 0n;
  const stockOut = (usdgIn: bigint, bps: bigint) =>
    priceOk ? (((usdgIn * 10n ** 18n) / oraclePrice!) * bps) / BPS : 0n;
  const expected = testDex
    ? debouncedAmount > 0n && priceOk
      ? stockOut(debouncedAmount, BPS - TEST_DEX_SPREAD_BPS)
      : undefined
    : route.data
      ? BigInt(route.data.toTokenAmount)
      : undefined;
  // The swap enforces `minStockOut`; the preview uses the same 1% tolerance.
  const minPreview = testDex
    ? debouncedAmount > 0n && priceOk
      ? stockOut(debouncedAmount, 9_900n)
      : undefined
    : expected !== undefined
      ? (expected * 99n) / 100n
      : undefined;

  // Oracle-side numbers for the amount we expect to buy.
  const {data: onchainQuote} = useReadContract({
    address: router,
    abi: earnRouterAbi,
    functionName: "quote",
    args: [m.adapter, expected ?? 0n, ltvBps],
    chainId,
    query: {enabled: expected !== undefined && expected > 0n},
  });
  const [stockValue, borrow, hfRay] = onchainQuote ?? [];

  const perYear = spread !== undefined && borrow !== undefined ? (borrow * spread) / RAY : undefined;
  const extraOnStock = spread !== undefined ? (spread * ltvBps) / BPS : undefined;

  const over = balance !== undefined && amount > balance;
  const needsApproval = amount > 0n && (allowance ?? 0n) < amount;
  const frozen = m.borrowAllowed === false && ltvBps > 0n;
  const canSubmit = !!address && amount > 0n && !over && !frozen && !m.priceUnavailable;

  const buy = async () => {
    setZapError(undefined);
    setPreparing(true);
    try {
      let target: Address;
      let spender: Address;
      let data: `0x${string}`;
      let minStockOut: bigint;
      if (testDex) {
        if (!priceOk) throw new Error("No oracle price for this market right now.");
        target = testDex;
        spender = testDex; // the stand-in router pulls the USDG itself
        data = encodeFunctionData({abi: testDexAbi, functionName: "swap", args: [m.token, amount, oraclePrice!]});
        minStockOut = stockOut(amount, 9_900n);
      } else {
        // Fresh calldata: a route quoted a minute ago is already stale.
        const swap = await zapApi<ZapSwap>({mode: "swap", stock: m.stock.key, amount: amount.toString()});
        target = swap.router;
        spender = swap.spender;
        data = swap.data;
        minStockOut = BigInt(swap.minReceive);
      }
      setPreparing(false);
      const ok = await buyTx.send({
        address: zap,
        abi: zapRouterAbi,
        functionName: "buyAndEarn",
        args: [amount, target, spender, data, m.adapter, minStockOut, ltvBps],
      });
      if (ok) {
        setAmountStr("");
        route.refetch();
      }
    } catch (e) {
      setPreparing(false);
      setZapError(e instanceof Error ? e.message : String(e));
    }
  };

  const unitPrice =
    testDex && priceOk
      ? Number(oraclePrice) / 1e6
      : route.data?.unitPrice
        ? Number(route.data.unitPrice)
        : undefined;

  return (
    <section className="panel p-5" aria-labelledby="buy-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="buy-title" className="text-md text-white">
          Buy {m.stock.wrapper} and earn
        </h2>
        <div className="flex items-center gap-3">
          {marketPill}
          {tabs}
        </div>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-mute">
        One transaction: your USDG buys the stock, the position opens on Arrow and the borrowed USDG goes to the
        vault. You approve USDG to the Agama zap, never to the router that swaps.
      </p>

      <div className="mt-4 space-y-3">
        <AmountField
          id="buy-amount"
          label="Spend"
          value={amountStr}
          onChange={setAmountStr}
          decimals={USDG_DECIMALS}
          symbol="USDG"
          balance={balance}
          footer={
            unitPrice !== undefined
              ? `${testDex ? "Stand-in router" : "OKX route"} at $${unitPrice.toFixed(2)} per ${m.stock.wrapper}`
              : undefined
          }
        />
        <Slider
          id="buy-ltv"
          label="Borrow against it (LTV)"
          value={ltv}
          min={0}
          max={maxLtvPct}
          step={0.5}
          onChange={setLtvPct}
          display={`${ltv.toFixed(1)}%`}
          minLabel="0%, buy only"
          maxLabel={`${maxLtvPct.toFixed(0)}% max`}
        />
      </div>

      <div className="mt-4">
        <Row
          label="You receive"
          strong
          value={
            !testDex && route.isFetching && expected === undefined
              ? "Finding a route…"
              : expected !== undefined
                ? fmt(expected, STOCK_DECIMALS, 4)
                : "-"
          }
          sub={m.stock.wrapper}
        />
        <Row
          label="Minimum at 1% slippage"
          value={minPreview !== undefined ? fmt(minPreview, STOCK_DECIMALS, 4) : "-"}
          sub={m.stock.wrapper}
        />
        <Row label="Value at the Agama oracle" value={stockValue !== undefined ? fmtUsd(stockValue) : "-"} />
        <Divider />
        <Row label="Borrowed into the vault" value={borrow !== undefined ? fmtUsd(borrow) : "-"} sub="USDG" />
        <Row
          label="Extra yield on the stock"
          value={
            extraOnStock === undefined ? "-" : <span className={extraOnStock < 0n ? "text-coral" : "text-mint"}>{fmtRay(extraOnStock)} a year</span>
          }
        />
        <Row label="Per year at today's rates" value={perYear !== undefined ? fmtUsd(perYear) : "-"} />
        <Row
          label="Health factor after"
          value={(() => {
            const hf = hfToNumber(hfRay);
            if (hf === undefined) return "-";
            return Number.isFinite(hf) ? hf.toFixed(2) : "No debt";
          })()}
        />
      </div>

      {!testDex && route.isError && (
        <p className="mt-3 text-xs text-coral" role="alert">
          {(route.error as Error).message}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <TxButton
          tx={approveTx}
          variant={needsApproval ? "primary" : "secondary"}
          label={amount > 0n && !needsApproval ? "USDG approved" : "Approve USDG"}
          disabled={!address || amount === 0n || over || !needsApproval}
          hint="Approves the Agama zap, not the aggregator."
          onClick={() => approve(approveTx, usdg, zap, amount)}
        />
        <TxButton
          tx={buyTx}
          label={preparing ? "Getting the route…" : "Buy and earn"}
          disabled={!canSubmit || needsApproval || preparing || expected === undefined}
          hint={
            frozen
              ? "Market closed: set LTV to 0% to buy without borrowing."
              : m.priceUnavailable
                ? "The Agama oracle price is stale: wait for the next push."
                : testDex
              ? "Priced at the Agama oracle, 0.3% spread."
              : "Route is refreshed right before signing."
          }
          onClick={buy}
        />
      </div>
      {zapError && (
        <p className="mt-2 text-xs text-coral" role="alert">
          {zapError}
        </p>
      )}
      <p className="mt-3 text-2xs leading-relaxed text-dim">
        {testDex ? (
          <>
            On testnet the swap goes through a stand-in router priced at the oracle. On mainnet the same zap calls the
            OKX DEX aggregator (see /api/zap). Unspent USDG comes back to your wallet in the same transaction.
          </>
        ) : (
          <>
            Routed by the OKX Onchain OS DEX aggregator on AMM liquidity, slippage 1%. Unspent USDG comes back to your
            wallet in the same transaction.
          </>
        )}
      </p>
      {!testDex && route.data === undefined && !route.isFetching && amount > 0n && (
        <p className="mt-2 text-2xs text-dim">
          <Pill tone="dim">Waiting for a route</Pill>
        </p>
      )}
    </section>
  );
}
