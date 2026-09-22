"use client";

import clsx from "clsx";
import {zeroAddress} from "viem";
import {useMemo, useState, type ReactNode} from "react";
import {useAccount, useReadContract} from "wagmi";

import {BuyTicket} from "@/components/earn/BuyTicket";
import {HFGauge} from "@/components/HFGauge";
import {TxButton} from "@/components/TxButton";
import {AmountField, Divider, Figure, NotDeployed, PageHead, Pill, Row, Slider} from "@/components/ui";
import {TESTNET_ID, XLAYER_ID, chainName, type AppChainId} from "@/lib/chains";
import {useDeployment} from "@/lib/deployment";
import {
  BPS,
  RAY,
  SAGUSD_DECIMALS,
  STOCK_DECIMALS,
  USDG_DECIMALS,
  fmt,
  fmtAge,
  fmtBps,
  fmtRay,
  fmtUsd,
  hfToNumber,
  parseAmount,
} from "@/lib/format";
import {accountAbi, earnRouterAbi} from "@/lib/generated/abis";
import {approve, useAllowance, useProtocol, useStockMarket, useTokenBalance, type StockMarket} from "@/lib/hooks";
import {STOCKS} from "@/lib/stocks";
import {useTx} from "@/lib/tx";

const SOFT_TRIGGER = 1.15;

export function EarnView() {
  const {chainId, d} = useDeployment();
  const {address} = useAccount();
  const proto = useProtocol(d, chainId);

  const m0 = useStockMarket(d, STOCKS[0], address, chainId);
  const m1 = useStockMarket(d, STOCKS[1], address, chainId);
  const m2 = useStockMarket(d, STOCKS[2], address, chainId);
  const m3 = useStockMarket(d, STOCKS[3], address, chainId);
  const markets = [m0, m1, m2, m3];
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<Mode>("deposit");
  const m = markets[sel];

  // Buy and Earn needs the zap plus a swap venue it allowlists: the OKX DEX
  // aggregator on chain 196, the stand-in router on X Layer Testnet.
  const testDex = chainId === TESTNET_ID ? d?.contracts.testDexRouter : undefined;
  const zap =
    (chainId === XLAYER_ID || (chainId === TESTNET_ID && testDex)) ? d?.contracts.zapRouter : undefined;

  const spread = proto.vaultApy !== undefined && proto.borrowRate !== undefined ? proto.vaultApy - proto.borrowRate : undefined;

  if (!d) {
    return (
      <>
        <PageHead title="Earn on your stocks" />
        <NotDeployed chainName={chainName(chainId)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Earn on your stocks"
        stats={
          <>
            <Figure
              label="Agama vault APY"
              value={fmtRay(proto.vaultApy)}
              sub={proto.vaultApyIsTarget ? "Target, not yet measured" : "Realized, last NAV snapshots"}
              tone="mint"
            />
            <Figure label="Arrow borrow APR" value={fmtRay(proto.borrowRate)} sub="USDG, variable" />
            <Figure
              label="Spread you earn"
              value={spread === undefined ? "-" : fmtRay(spread)}
              sub="On every USDG borrowed"
              tone={spread !== undefined && spread < 0n ? "coral" : undefined}
            />
          </>
        }
      >
        Deposit a wrapped xStock and borrow USDG against it. The USDG goes into the Agama vault. You keep the stock
        exposure and earn the spread between the vault APY and the borrow rate on what you borrowed.
      </PageHead>

      <MarketBoard markets={markets} sel={sel} onSelect={setSel} connected={!!address} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {zap && mode === "buy" ? (
          <BuyTicket
            key={`buy-${chainId}-${m.stock.key}`}
            m={m}
            chainId={chainId}
            router={d.contracts.earnRouter}
            zap={zap}
            testDex={testDex}
            usdg={d.tokens.USDG}
            spread={spread}
            marketPill={<MarketPill m={m} />}
            tabs={<ModeTabs mode={mode} onChange={setMode} />}
          />
        ) : (
          <Ticket
            key={`${chainId}-${m.stock.key}`}
            m={m}
            proto={proto}
            router={d.contracts.earnRouter}
            chainId={chainId}
            tabs={zap ? <ModeTabs mode={mode} onChange={setMode} /> : undefined}
            zapNote={!zap}
          />
        )}
        <PositionPanel m={m} chainId={chainId} router={d.contracts.earnRouter} usdg={d.tokens.USDG} />
      </div>
    </>
  );
}

// ---- Market board ----------------------------------------------------------------------

function marketState(m: StockMarket): {text: string; tone: "mint" | "sand" | "coral" | "dim"; title: string} {
  if (!m.loaded) return {text: "Loading", tone: "dim", title: ""};
  if (!m.feed || !m.feed.exists || m.feed.price === 0n) return {text: "No price yet", tone: "dim", title: "The oracle has no price for this ticker yet."};
  if (m.priceUnavailable) return {text: "Price stale", tone: "coral", title: "Price older than the oracle limit: borrows are blocked."};
  if (m.feed.marketOpen && m.borrowAllowed) return {text: "Open", tone: "mint", title: "Market open: borrows allowed."};
  return {text: "Closed, frozen", tone: "sand", title: "Market closed: new borrows frozen, liquidation threshold lowered by the weekend buffer."};
}

function MarketBoard({
  markets,
  sel,
  onSelect,
  connected,
}: {
  markets: StockMarket[];
  sel: number;
  onSelect: (i: number) => void;
  connected: boolean;
}) {
  return (
    <div className="panel-muted overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <caption className="sr-only">xStock markets on Arrow</caption>
        <thead>
          <tr className="text-xs text-dim">
            <th className="py-3 pl-5 font-normal">Stock</th>
            <th className="py-3 font-normal">Oracle price</th>
            <th className="py-3 font-normal">Market</th>
            <th className="py-3 font-normal">Max LTV</th>
            <th className="py-3 font-normal">Liquidation threshold</th>
            <th className="py-3 font-normal">In wallet</th>
            <th className="py-3 pr-5 text-right font-normal">Your debt</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m, i) => {
            const st = marketState(m);
            const active = i === sel;
            const closed = m.lt !== undefined && m.baseLt !== undefined && m.lt < m.baseLt;
            return (
              <tr
                key={m.stock.key}
                onClick={() => onSelect(i)}
                className={clsx(
                  "cursor-pointer border-t border-white/10 text-base transition-colors",
                  active ? "bg-white/[0.07]" : "hover:bg-white/[0.03]",
                )}
              >
                <td className="relative py-3 pl-5">
                  {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-mint" aria-hidden />}
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    aria-pressed={active}
                    className="text-left focus-visible:outline-offset-4"
                  >
                    <span className="text-white">{m.stock.wrapper}</span>
                    <span className="ml-2 text-xs text-dim">{m.stock.name}</span>
                  </button>
                </td>
                <td className="py-3">
                  {m.feed && m.feed.price > 0n ? (
                    <>
                      <span className="text-white">${fmt(m.feed.price, 18, 2)}</span>
                      <span className="ml-2 text-2xs text-dim">{fmtAge(m.feed.observedAt)}</span>
                    </>
                  ) : (
                    <span className="text-dim">-</span>
                  )}
                </td>
                <td className="py-3">
                  <Pill tone={st.tone} title={st.title}>
                    {st.text}
                  </Pill>
                </td>
                <td className="py-3 text-white">{fmtBps(m.maxLtv)}</td>
                <td className="py-3">
                  <span className={closed ? "text-sand" : "text-white"}>{fmtBps(m.lt)}</span>
                  {closed && <span className="ml-1.5 text-2xs text-dim">from {fmtBps(m.baseLt)}</span>}
                </td>
                <td className="py-3 text-white">{connected ? fmt(m.balance, STOCK_DECIMALS, 4) : <span className="text-dim">-</span>}</td>
                <td className="py-3 pr-5 text-right">
                  {m.hasPosition && m.position ? (
                    <span className="text-white">{fmtUsd(m.position.debt)}</span>
                  ) : (
                    <span className="text-dim">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Mode = "deposit" | "buy";

function ModeTabs({mode, onChange}: {mode: Mode; onChange: (m: Mode) => void}) {
  return (
    <div className="pill-bar flex rounded-full p-0.5 text-sm" role="tablist" aria-label="How to open">
      {(
        [
          ["deposit", "Deposit"],
          ["buy", "Buy and Earn"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          onClick={() => onChange(id)}
          className={clsx(
            "whitespace-nowrap rounded-full px-3 py-1",
            mode === id ? "bg-white/[0.14] text-white" : "text-mute hover:text-white",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MarketPill({m}: {m: StockMarket}) {
  const st = marketState(m);
  return (
    <Pill tone={st.tone} title={st.title}>
      {st.text}
    </Pill>
  );
}

// ---- Ticket ---------------------------------------------------------------------------------

type Proto = ReturnType<typeof useProtocol>;

function Ticket({
  m,
  proto,
  router,
  chainId,
  tabs,
  zapNote,
}: {
  m: StockMarket;
  proto: Proto;
  router: `0x${string}`;
  chainId: AppChainId;
  tabs?: ReactNode;
  zapNote?: boolean;
}) {
  const {address} = useAccount();
  const [amountStr, setAmountStr] = useState("");
  const maxLtvPct = m.maxLtv !== undefined ? Number(m.maxLtv) / 100 : 30;
  const [ltvPct, setLtvPct] = useState(25);
  const ltv = Math.min(ltvPct, maxLtvPct);
  const ltvBps = BigInt(Math.round(ltv * 100));

  const amount = parseAmount(amountStr, STOCK_DECIMALS) ?? 0n;
  const allowance = useAllowance(m.token, address, router, chainId);
  const approveTx = useTx(chainId);
  const openTx = useTx(chainId);
  const addTx = useTx(chainId);

  const quote = useReadContract({
    address: router,
    abi: earnRouterAbi,
    functionName: "quote",
    args: [m.adapter, amount, ltvBps],
    chainId,
    query: {enabled: amount > 0n},
  });
  const [stockValue, borrow, hfRay] = quote.data ?? [];

  // Preview on the whole position (existing + this trade).
  const p = m.position;
  const totalValue = (p?.collateralValue ?? 0n) + (stockValue ?? 0n);
  const totalDebt = (p?.debt ?? 0n) + (borrow ?? 0n);
  const previewHf = useMemo(() => {
    if (stockValue === undefined || m.lt === undefined) return undefined;
    if (totalDebt === 0n) return Number.POSITIVE_INFINITY;
    return hfToNumber((totalValue * m.lt * RAY) / (totalDebt * BPS));
  }, [stockValue, m.lt, totalValue, totalDebt]);

  // Price levels on the wrapper at which the position hits HF 1.15 / 1.00.
  const liqPrice =
    m.wrapperPrice !== undefined && m.lt && totalValue > 0n && totalDebt > 0n
      ? (m.wrapperPrice * totalDebt * BPS) / (totalValue * m.lt)
      : undefined;
  const softPrice = liqPrice !== undefined ? (liqPrice * 115n) / 100n : undefined;

  const spread = proto.vaultApy !== undefined && proto.borrowRate !== undefined ? proto.vaultApy - proto.borrowRate : undefined;
  const extraOnStock = spread !== undefined ? (spread * ltvBps) / BPS : undefined;
  const perYear = spread !== undefined && borrow !== undefined ? (borrow * spread) / RAY : undefined;

  const overBalance = m.balance !== undefined && amount > m.balance;
  const needsApproval = amount > 0n && (allowance ?? 0n) < amount;
  const frozen = m.borrowAllowed === false;
  const borrowBlocked = ltvBps > 0n && frozen;
  const canSubmit = !!address && amount > 0n && !overBalance;

  const st = marketState(m);

  return (
    <section className="panel p-5" aria-labelledby="ticket-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ticket-title" className="text-md text-white">
          Deposit {m.stock.wrapper}
        </h2>
        <div className="flex items-center gap-3">
          <Pill tone={st.tone} title={st.title}>
            {st.text}
          </Pill>
          {tabs}
        </div>
      </div>
      {zapNote && (
        <p className="mt-1.5 text-xs text-mute">
          Buy and Earn runs on X Layer Testnet, where a swap venue is allowlisted in the zap. Here, deposit a wrapped
          xStock you already hold.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <AmountField
          id="earn-amount"
          label="Amount"
          value={amountStr}
          onChange={setAmountStr}
          decimals={STOCK_DECIMALS}
          symbol={m.stock.wrapper}
          balance={m.balance}
          footer={
            m.wrapperPrice !== undefined
              ? `${fmtUsd(m.wrapperPrice)} per ${m.stock.wrapper}${stockValue !== undefined ? `, ${fmtUsd(stockValue)} in total` : ""}`
              : m.priceUnavailable
                ? "Price unavailable right now"
                : undefined
          }
        />
        <Slider
          id="earn-ltv"
          label="Borrow against it (LTV)"
          value={ltv}
          min={0}
          max={maxLtvPct}
          step={0.5}
          onChange={setLtvPct}
          display={`${ltv.toFixed(1)}%`}
          minLabel="0%, deposit only"
          maxLabel={`${maxLtvPct.toFixed(0)}% max`}
        />
      </div>

      <div className="mt-4">
        <Row
          label="Borrowed into the vault"
          value={borrow !== undefined ? fmtUsd(borrow) : "-"}
          sub="USDG"
          strong
        />
        <Row
          label="Extra yield on the stock"
          value={
            extraOnStock === undefined ? "-" : <span className={extraOnStock < 0n ? "text-coral" : "text-mint"}>{fmtRay(extraOnStock)} a year</span>
          }
        />
        <Row label="Per year at today's rates" value={perYear !== undefined ? fmtUsd(perYear) : "-"} />
        <Divider />
        <Row
          label="Health factor after"
          value={previewHf === undefined ? (quote.isError ? "Price unavailable" : "-") : Number.isFinite(previewHf) ? previewHf.toFixed(2) : "No debt"}
        />
        <Row
          label={`Soft deleverage if ${m.stock.wrapper} falls to`}
          value={softPrice !== undefined ? fmtUsd(softPrice) : "-"}
        />
        <Row label="Liquidation price" value={liqPrice !== undefined ? fmtUsd(liqPrice) : "-"} />
      </div>

      <p className="mt-3 rounded-box border border-line/70 px-3 py-2 text-xs leading-relaxed text-mute">
        Weekend rule: the liquidation threshold is {fmtBps(m.baseLt)} while the market is open and{" "}
        {m.baseLt !== undefined && m.weekendBuffer !== undefined ? fmtBps(m.baseLt - m.weekendBuffer) : "-"} while it
        is closed ({fmtBps(m.weekendBuffer)} buffer for the reopening gap). New borrows are frozen while closed; deposits,
        repayments and soft deleverage keep working.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <TxButton
          tx={approveTx}
          variant={needsApproval ? "primary" : "secondary"}
          label={amount > 0n && !needsApproval ? `${m.stock.wrapper} approved` : `Approve ${m.stock.wrapper}`}
          disabled={!canSubmit || !needsApproval}
          onClick={() => approve(approveTx, m.token, router, amount)}
        />
        <TxButton
          tx={openTx}
          label={m.hasPosition ? "Add and borrow" : "Open position"}
          disabled={!canSubmit || needsApproval || borrowBlocked || m.priceUnavailable}
          hint={
            m.priceUnavailable
              ? "The oracle price is stale: opening waits for the next price push."
              : borrowBlocked
                ? "Market closed: set LTV to 0% to deposit only."
                : undefined
          }
          onClick={async () => {
            const ok = await openTx.send({address: router, abi: earnRouterAbi, functionName: "open", args: [m.adapter, amount, ltvBps]});
            if (ok) setAmountStr("");
          }}
        />
      </div>
      {m.hasPosition && (
        <div className="mt-3">
          <TxButton
            tx={addTx}
            variant="secondary"
            label="Add as collateral only (no new borrow)"
            disabled={!canSubmit || needsApproval}
            onClick={async () => {
              const ok = await addTx.send({address: router, abi: earnRouterAbi, functionName: "addCollateral", args: [m.adapter, amount]});
              if (ok) setAmountStr("");
            }}
          />
        </div>
      )}
      {!address && <p className="mt-3 text-xs text-dim">Connect a wallet to open a position.</p>}
      {proto.vaultApyIsTarget && (
        <p className="mt-2 text-2xs text-dim">
          Yield uses the 10% vault target: the realized APY needs two NAV snapshots a day apart.
        </p>
      )}
    </section>
  );
}

// ---- Position ----------------------------------------------------------------------------------

function PositionPanel({
  m,
  chainId,
  router,
  usdg,
}: {
  m: StockMarket;
  chainId: AppChainId;
  router: `0x${string}`;
  usdg: `0x${string}`;
}) {
  const {address} = useAccount();
  const closeTx = useTx(chainId);
  const softTx = useTx(chainId);
  const p = m.position;
  const has = m.hasPosition && !!p;

  // USDG the owner must add for close to succeed (free vault shares short of
  // the debt, e.g. after a soft deleverage or once stacked into Amplify).
  const {data: shortfall} = useReadContract({
    address: router,
    abi: earnRouterAbi,
    functionName: "closeShortfall",
    args: [address ?? zeroAddress, m.adapter],
    chainId,
    query: {enabled: has && !!address},
  });
  const needsTopUp = has && shortfall !== undefined && shortfall > 0n;
  // Small margin over the quote for interest accrued before the tx lands;
  // the router only pulls what is actually missing.
  const maxTopUp = needsTopUp ? shortfall! + shortfall! / 200n + 10_000n : 0n;
  const walletUsdg = useTokenBalance(usdg, address, chainId);
  const topUpAllowance = useAllowance(usdg, address, router, chainId);
  const lacksUsdg = needsTopUp && walletUsdg !== undefined && walletUsdg < maxTopUp;

  const close = async () => {
    if (!needsTopUp) {
      await closeTx.send({address: router, abi: earnRouterAbi, functionName: "close", args: [m.adapter]});
      return;
    }
    if ((topUpAllowance ?? 0n) < maxTopUp) {
      const ok = await approve(closeTx, usdg, router, maxTopUp);
      if (!ok) return;
    }
    await closeTx.send({address: router, abi: earnRouterAbi, functionName: "closeWithTopUp", args: [m.adapter, maxTopUp]});
  };

  const hf = has ? hfToNumber(p!.healthFactorRay === 0n ? undefined : p!.healthFactorRay) : undefined;
  const softOpen = has && p!.debt > 0n && hf !== undefined && hf < SOFT_TRIGGER;
  const net = has ? p!.collateralValue + p!.freeSharesValue - p!.debt : undefined;
  const coverage = has && p!.debt > 0n ? Number((p!.freeSharesValue * 10_000n) / p!.debt) / 100 : undefined;

  return (
    <section className="panel-muted p-5" aria-labelledby="pos-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pos-title" className="text-md text-white">
          Your {m.stock.wrapper} position
        </h2>
        {p && p.account !== "0x0000000000000000000000000000000000000000" && (
          <span className="text-2xs text-dim" title={p.account}>
            Agama account {p.account.slice(0, 6)}{"…"}{p.account.slice(-4)}
          </span>
        )}
      </div>

      <div className="mt-4">
        <HFGauge
          hf={hf}
          mode="earn"
          empty={has && p!.healthFactorRay === 0n ? "Price unavailable" : "No open position"}
        />
      </div>

      <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
        <div>
          <Row label="Collateral" value={has ? fmt(p!.collateral, STOCK_DECIMALS, 4) : "-"} sub={m.stock.wrapper} />
          <Row label="Collateral value" value={has ? fmtUsd(p!.collateralValue) : "-"} />
          <Row label="Debt" value={has ? fmtUsd(p!.debt) : "-"} sub="USDG" />
        </div>
        <div>
          <Row
            label="Free vault shares"
            value={has ? fmtUsd(p!.freeSharesValue) : "-"}
            sub={has ? `${fmt(p!.freeShares, SAGUSD_DECIMALS, 2)} sagUSD` : undefined}
          />
          <Row label="Buffer vs debt" value={coverage !== undefined ? `${coverage.toFixed(1)}%` : "-"} />
          <Row label="Net value" value={net !== undefined ? fmtUsd(net) : "-"} />
        </div>
      </div>

      {has ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <TxButton
            tx={closeTx}
            variant="secondary"
            label={needsTopUp ? `Close, add ${fmt(shortfall, USDG_DECIMALS, 2)} USDG` : "Close position"}
            disabled={lacksUsdg}
            hint={
              lacksUsdg
                ? `Needs ${fmt(maxTopUp, USDG_DECIMALS, 2)} USDG in your wallet to cover the shortfall.`
                : needsTopUp
                  ? (topUpAllowance ?? 0n) < maxTopUp
                    ? "The vault shares fall short of the debt: approve the USDG top-up, then close. Unused USDG is not pulled."
                    : "Tops up the missing USDG, repays, returns the stock."
                  : "Repays from the vault shares, returns the stock and the leftover yield."
            }
            onClick={close}
          />
          <TxButton
            tx={softTx}
            variant={softOpen ? "primary" : "secondary"}
            label="Soft deleverage"
            disabled={!softOpen}
            hint={softOpen ? "Repays from vault shares back to HF 1.40." : "Opens under HF 1.15. Anyone can call it."}
            onClick={() =>
              softTx.send({address: p!.account, abi: accountAbi, functionName: "softDeleverage", args: [m.adapter]})
            }
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-mute">
          No {m.stock.wrapper} position yet. Deposit on the left: the USDG you borrow lands in the Agama vault and stays in
          your account as a free buffer that protects the stock.
        </p>
      )}

      <p className="mt-4 text-2xs leading-relaxed text-dim">
        Values in USDG ({USDG_DECIMALS} decimals). Liquidation bonus on this market {fmtBps(m.bonus)}, paid to the Arrow
        Stability Pool only if the health factor falls under 1.00.
      </p>
    </section>
  );
}
