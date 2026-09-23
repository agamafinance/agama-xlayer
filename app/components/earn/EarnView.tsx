"use client";

import {useQuery} from "@tanstack/react-query";
import clsx from "clsx";
import {encodeFunctionData, parseAbi, zeroAddress} from "viem";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {useAccount, usePublicClient, useReadContract} from "wagmi";

import {BuyTicket} from "@/components/earn/BuyTicket";
import {HFGauge} from "@/components/HFGauge";
import {TxButton} from "@/components/TxButton";
import {AmountField, Divider, Figure, NotDeployed, PageHead, Pill, Row, Slider} from "@/components/ui";
import {TESTNET_ID, XLAYER_ID, chainName, type AppChainId} from "@/lib/chains";
import {useDeployment} from "@/lib/deployment";
import {useLocalState, type AgentAction} from "@/lib/local";
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
  toInput,
} from "@/lib/format";
import {accountAbi, earnRouterAbi} from "@/lib/generated/abis";
import {
  approve,
  useAllowance,
  usePreviewDeposit,
  useProtocol,
  useStockMarket,
  useTokenBalance,
  type StockMarket,
} from "@/lib/hooks";
import {STOCKS} from "@/lib/stocks";
import {useTx} from "@/lib/tx";

const SOFT_TRIGGER = 1.15;

/// Testnet stand-in DEX the agents may route through (allowlisted in the zap).
const testDexAbi = parseAbi(["function swap(address wrapper, uint256 usdgIn, uint256 priceUsdg6) returns (uint256 out)"]);

/// What the keepers emit on an account when they act on a market.
const agentEvents = parseAbi([
  "event Rebalanced(address indexed caller, address indexed adapter, int256 debtDelta, uint256 ltvBpsAfter)",
  "event CompoundedIntoStock(address indexed caller, address indexed adapter, uint256 usdgSpent, uint256 stockAdded)",
]);

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

  // What the agents added since the deposit. The chain keeps no deposit
  // baseline and the public RPC caps log scans at 100 blocks, so the browser
  // remembers the deposited amount and the growth is read off the collateral.
  const [baseline, setBaseline] = useLocalState<string>(
    `agama.deposited.${chainId}.${address ?? "none"}.${m.adapter}`,
    "0",
  );
  const deposited = (() => {
    try {
      return BigInt(baseline);
    } catch {
      return 0n;
    }
  })();
  useEffect(() => {
    // No deposit baseline on chain: seed it the first time a position shows up
    // so the stock the agents add from here on is visible.
    if (deposited === 0n && m.hasPosition && m.position && m.position.collateral > 0n) {
      setBaseline(m.position.collateral.toString());
    }
  }, [deposited, m.hasPosition, m.position, setBaseline]);
  const grown =
    m.position && deposited > 0n && m.position.collateral > deposited ? m.position.collateral - deposited : undefined;
  const positionHf = m.position
    ? hfToNumber(m.position.healthFactorRay === 0n ? undefined : m.position.healthFactorRay)
    : undefined;
  const positionExtra =
    spread !== undefined && m.position && m.position.collateralValue > 0n
      ? (spread * ((m.position.debt * BPS) / m.position.collateralValue)) / BPS
      : undefined;

  if (!d) {
    return (
      <>
        <PageHead title="Deposit your stock, get more stock" />
        <NotDeployed chainName={chainName(chainId)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Deposit your stock, get more stock"
        stats={
          m.hasPosition && m.position ? (
            <>
              <Figure
                label={`Your ${m.symbol ?? m.stock.wrapper}`}
                value={fmt(m.position.collateral, STOCK_DECIMALS, 4)}
                sub={
                  grown !== undefined
                    ? `+${fmt(grown, STOCK_DECIMALS, 4)} added by the agents`
                    : `${fmtUsd(m.position.collateralValue)} at the oracle`
                }
                tone="mint"
              />
              <Figure
                label="Extra yield on it"
                value={positionExtra === undefined ? "-" : `${fmtRay(positionExtra)} a year`}
                sub={`Vault ${fmtRay(proto.vaultApy)} less borrow ${fmtRay(proto.borrowRate)}`}
                tone={positionExtra !== undefined && positionExtra < 0n ? "coral" : undefined}
              />
              <Figure
                label="Health factor"
                value={positionHf === undefined ? "-" : Number.isFinite(positionHf) ? positionHf.toFixed(2) : "No debt"}
                sub="Liquidation at 1.00, agents act at 1.15"
                tone={positionHf !== undefined && positionHf < 1.15 ? "sand" : undefined}
              />
            </>
          ) : (
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
          )
        }
      >
        Deposit an xStock, wrapped or straight out of the OKX app. The USDG borrowed against it works in the Agama
        vault, and permissionless agents turn that yield into more stock and keep the position at the level you picked.
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
            onDeposited={(added) => setBaseline(((deposited > 0n ? deposited : 0n) + added).toString())}
          />
        )}
        <PositionPanel
          m={m}
          chainId={chainId}
          router={d.contracts.earnRouter}
          usdg={d.tokens.USDG}
          testDex={testDex}
          grown={grown}
          onClosed={() => setBaseline("0")}
        />
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
                    <span className="text-white">{m.symbol ?? m.stock.wrapper}</span>
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
  onDeposited,
}: {
  m: StockMarket;
  proto: Proto;
  router: `0x${string}`;
  chainId: AppChainId;
  tabs?: ReactNode;
  zapNote?: boolean;
  onDeposited: (collateralAdded: bigint) => void;
}) {
  const {address} = useAccount();
  const [amountStr, setAmountStr] = useState("");
  const maxLtvPct = m.maxLtv !== undefined ? Number(m.maxLtv) / 100 : 30;
  const [ltvPct, setLtvPct] = useState(25);
  const ltv = Math.min(ltvPct, maxLtvPct);
  const ltvBps = BigInt(Math.round(ltv * 100));

  // The wrapper is the collateral, but a stock withdrawn from the OKX app
  // lands as the BASE token: accept either and wrap on the way in.
  const [picked, setPicked] = useState<"wrapper" | "base" | null>(null);
  const holdsBase = (m.baseBalance ?? 0n) > 0n;
  const useBase = picked === null ? holdsBase && !m.hasPosition : picked === "base";
  const inputToken = useBase ? m.base : m.token;
  const inputSymbol = (useBase ? m.baseSymbol : m.symbol) ?? m.stock.wrapper;
  const inputBalance = useBase ? m.baseBalance : m.balance;

  const amount = parseAmount(amountStr, STOCK_DECIMALS) ?? 0n;
  const wrapped = usePreviewDeposit(useBase ? m.token : undefined, amount, chainId);
  /// Collateral the position will hold: the wrapper shares minted from the base.
  const collateralIn = useBase ? wrapped : amount;
  const allowance = useAllowance(inputToken, address, router, chainId);
  const approveTx = useTx(chainId);
  const openTx = useTx(chainId);
  const addTx = useTx(chainId);

  const quote = useReadContract({
    address: router,
    abi: earnRouterAbi,
    functionName: "quote",
    args: [m.adapter, collateralIn ?? 0n, ltvBps],
    chainId,
    query: {enabled: (collateralIn ?? 0n) > 0n},
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

  const overBalance = inputBalance !== undefined && amount > inputBalance;
  const needsApproval = amount > 0n && (allowance ?? 0n) < amount;
  const frozen = m.borrowAllowed === false;
  const borrowBlocked = ltvBps > 0n && frozen;
  const canSubmit = !!address && amount > 0n && !overBalance;

  const st = marketState(m);

  return (
    <section className="panel p-5" aria-labelledby="ticket-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ticket-title" className="text-md text-white">
          Deposit {inputSymbol}
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
        {m.base && (
          <>
            <ol className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-mute">
              {[
                "Withdraw your stock from the OKX app to X Layer",
                `It arrives as ${m.baseSymbol ?? "the base xStock"}`,
                "Deposit it here in one transaction",
              ].map((stepText, i) => (
                <li key={stepText} className="flex items-baseline gap-1.5">
                  <span className="text-white">{i + 1}.</span>
                  {stepText}
                </li>
              ))}
              {chainId === TESTNET_ID && (
                <li className="text-dim">On testnet, Get test tokens stands in for the OKX withdrawal.</li>
              )}
            </ol>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-mute">Deposit</span>
              <div className="pill-bar flex rounded-full p-0.5" role="radiogroup" aria-label="Token to deposit">
                {(
                  [
                    ["wrapper", `Wrapped (${m.symbol ?? m.stock.wrapper})`, m.balance, null],
                    ["base", `From OKX (${m.baseSymbol ?? "base"})`, m.baseBalance, "OKX withdrawal"],
                  ] as const
                ).map(([id, label, bal, tag]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={useBase === (id === "base")}
                    onClick={() => {
                      setPicked(id);
                      setAmountStr("");
                    }}
                    className={clsx(
                      "whitespace-nowrap rounded-full px-3 py-1",
                      useBase === (id === "base") ? "bg-white/[0.14] text-white" : "text-mute hover:text-white",
                    )}
                  >
                    {label}
                    <span className="ml-1.5 text-2xs text-dim">{fmt(bal, STOCK_DECIMALS, 2)}</span>
                    {tag && <span className="ml-1.5 text-2xs text-dim">{tag}</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <AmountField
          id="earn-amount"
          label="Amount"
          value={amountStr}
          onChange={setAmountStr}
          decimals={STOCK_DECIMALS}
          symbol={inputSymbol}
          balance={inputBalance}
          footer={
            useBase && collateralIn !== undefined && collateralIn > 0n
              ? `Wrapped into ${fmt(collateralIn, STOCK_DECIMALS, 4)} ${m.symbol ?? m.stock.wrapper}${stockValue !== undefined ? `, ${fmtUsd(stockValue)}` : ""}`
              : m.wrapperPrice !== undefined
                ? `${fmtUsd(m.wrapperPrice)} per ${m.symbol ?? m.stock.wrapper}${stockValue !== undefined ? `, ${fmtUsd(stockValue)} in total` : ""}`
                : m.priceUnavailable
                  ? "Price unavailable right now"
                  : undefined
          }
        />
        {useBase && holdsBase && !m.hasPosition && amountStr === "" && (
          <p className="text-xs text-mute">
            You hold {fmt(m.baseBalance, STOCK_DECIMALS, 2)} {m.baseSymbol ?? "base xStock"} from OKX. Put it to work.
            <button
              type="button"
              onClick={() => setAmountStr(toInput(m.baseBalance!, STOCK_DECIMALS, 8))}
              className="ml-2 rounded-md px-1.5 py-0.5 text-mint hover:bg-mint/10"
            >
              Max
            </button>
          </p>
        )}
        <Slider
          id="earn-ltv"
          label="How hard your stock works"
          value={ltv}
          min={0}
          max={maxLtvPct}
          step={0.5}
          onChange={setLtvPct}
          display={<span className="text-sm text-dim">{ltv.toFixed(1)}% LTV</span>}
          minLabel="Off, deposit only"
          maxLabel={`${maxLtvPct.toFixed(0)}% LTV, market max`}
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
          label={`Soft deleverage if ${m.symbol ?? m.stock.wrapper} falls to`}
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
          label={amount > 0n && !needsApproval ? `${inputSymbol} approved` : `Approve ${inputSymbol}`}
          disabled={!canSubmit || !needsApproval || !inputToken}
          onClick={() => inputToken && approve(approveTx, inputToken, router, amount)}
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
            const ok = await openTx.send({
              address: router,
              abi: earnRouterAbi,
              functionName: useBase ? "openWithBase" : "open",
              args: [m.adapter, amount, ltvBps],
            });
            if (ok) {
              onDeposited(collateralIn ?? amount);
              setAmountStr("");
            }
          }}
        />
      </div>
      {m.hasPosition && !useBase && (
        <div className="mt-3">
          <TxButton
            tx={addTx}
            variant="secondary"
            label="Add as collateral only (no new borrow)"
            disabled={!canSubmit || needsApproval}
            onClick={async () => {
              const ok = await addTx.send({address: router, abi: earnRouterAbi, functionName: "addCollateral", args: [m.adapter, amount]});
              if (ok) {
                onDeposited(amount);
                setAmountStr("");
              }
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
  testDex,
  grown,
  onClosed,
}: {
  m: StockMarket;
  chainId: AppChainId;
  router: `0x${string}`;
  usdg: `0x${string}`;
  testDex?: `0x${string}`;
  grown?: bigint;
  onClosed: () => void;
}) {
  const {address} = useAccount();
  const closeTx = useTx(chainId);
  const closeBaseTx = useTx(chainId);
  const softTx = useTx(chainId);
  const rebalanceTx = useTx(chainId);
  const compoundTx = useTx(chainId);
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

  // Same two paths as the wrapper close, but handing back the base xStock.
  const closeBase = async () => {
    if (!needsTopUp) {
      if (await closeBaseTx.send({address: router, abi: earnRouterAbi, functionName: "closeToBase", args: [m.adapter]}))
        onClosed();
      return;
    }
    if ((topUpAllowance ?? 0n) < maxTopUp) {
      const ok = await approve(closeBaseTx, usdg, router, maxTopUp);
      if (!ok) return;
    }
    if (
      await closeBaseTx.send({
        address: router,
        abi: earnRouterAbi,
        functionName: "closeToBaseWithTopUp",
        args: [m.adapter, maxTopUp],
      })
    )
      onClosed();
  };

  const close = async () => {
    if (!needsTopUp) {
      if (await closeTx.send({address: router, abi: earnRouterAbi, functionName: "close", args: [m.adapter]})) onClosed();
      return;
    }
    if ((topUpAllowance ?? 0n) < maxTopUp) {
      const ok = await approve(closeTx, usdg, router, maxTopUp);
      if (!ok) return;
    }
    if (await closeTx.send({address: router, abi: earnRouterAbi, functionName: "closeWithTopUp", args: [m.adapter, maxTopUp]}))
      onClosed();
  };

  // ---- Agents -------------------------------------------------------------
  // Both entry points are permissionless: the buttons are a manual trigger of
  // what the keepers do, no approval needed.
  const target = m.targetLtvBps;
  const currentLtvBps =
    has && p!.collateralValue > 0n ? (p!.debt * BPS) / p!.collateralValue : undefined;
  const bandBps = m.rebalanceBandBps ?? 100n;
  const offTarget =
    target !== undefined && target > 0n && currentLtvBps !== undefined
      ? (currentLtvBps > target ? currentLtvBps - target : target - currentLtvBps) > bandBps
      : false;
  const surplus =
    m.redeemableUsdg !== undefined && p && m.redeemableUsdg > p.debt ? m.redeemableUsdg - p.debt : 0n;
  // Below a cent of surplus there is nothing worth swapping.
  const compoundable = (surplus * 999n) / 1000n;
  const canCompound = has && !!testDex && compoundable >= 10_000n && !!m.wrapperPrice && m.wrapperPrice > 0n;

  // Seen while the app is open: the public RPC caps log scans at 100 blocks,
  // so history further back is not readable from the browser.
  const [lastAction, setLastAction] = useLocalState<AgentAction | null>(
    `agama.agent.${chainId}.${address ?? "none"}.${m.adapter}`,
    null,
  );
  // Agent actions, polled over the last 100 blocks: that is the widest range
  // the public X Layer RPC accepts for eth_getLogs, and the poll is faster
  // than 100 blocks so nothing is missed while the page is open.
  const client = usePublicClient({chainId});
  useQuery({
    queryKey: ["agent-actions", chainId, m.account, m.adapter],
    enabled: !!client && !!m.account,
    refetchInterval: 15_000,
    queryFn: async () => {
      const latest = await client!.getBlockNumber();
      const fromBlock = latest > 99n ? latest - 99n : 0n;
      const logs = await client!.getLogs({
        address: m.account,
        events: agentEvents,
        fromBlock,
        toBlock: latest,
      });
      const mine = logs.filter((l) => {
        const a = l.args as {adapter?: string};
        return a.adapter?.toLowerCase() === m.adapter.toLowerCase();
      });
      const last = mine[mine.length - 1];
      if (!last) return null;
      const block = await client!.getBlock({blockNumber: last.blockNumber});
      const args = last.args as {stockAdded?: bigint; debtDelta?: bigint};
      const action: AgentAction =
        args.stockAdded !== undefined
          ? {kind: "compound", amount: args.stockAdded.toString(), at: Number(block.timestamp) * 1000}
          : {kind: "rebalance", amount: (args.debtDelta ?? 0n).toString(), at: Number(block.timestamp) * 1000};
      if (!lastAction || action.at > lastAction.at) setLastAction(action);
      return action;
    },
  });

  const compound = async () => {
    if (!testDex || !m.wrapperPrice) return;
    // Spend a shade under the surplus: interest accrues between this read and
    // the transaction landing, and `usdgIn` must be what the calldata spends.
    const usdgIn = (surplus * 999n) / 1000n;
    if (usdgIn === 0n) return;
    const minOut = (((usdgIn * 10n ** 18n) / m.wrapperPrice) * 98n) / 100n;
    const data = encodeFunctionData({
      abi: testDexAbi,
      functionName: "swap",
      args: [m.token, usdgIn, m.wrapperPrice],
    });
    await compoundTx.send({
      address: m.account!,
      abi: accountAbi,
      functionName: "compoundIntoStock",
      args: [m.adapter, usdgIn, testDex, testDex, data, minOut],
    });
  };

  const hf = has ? hfToNumber(p!.healthFactorRay === 0n ? undefined : p!.healthFactorRay) : undefined;
  const softOpen = has && p!.debt > 0n && hf !== undefined && hf < SOFT_TRIGGER;
  const net = has ? p!.collateralValue + p!.freeSharesValue - p!.debt : undefined;
  const coverage = has && p!.debt > 0n ? Number((p!.freeSharesValue * 10_000n) / p!.debt) / 100 : undefined;

  return (
    <section className="panel-muted p-5" aria-labelledby="pos-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pos-title" className="text-md text-white">
          Your {m.symbol ?? m.stock.wrapper} position
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
          <Row label="Collateral" value={has ? fmt(p!.collateral, STOCK_DECIMALS, 4) : "-"} sub={m.symbol ?? m.stock.wrapper} />
          <Row label="Collateral value" value={has ? fmtUsd(p!.collateralValue) : "-"} />
          <Row label="Debt" value={has ? fmtUsd(p!.debt) : "-"} sub="USDG" />
        </div>
        <div>
          <Row
            label="Yield buffer"
            value={has ? fmtUsd(p!.freeSharesValue) : "-"}
            sub={has ? `${fmt(p!.freeShares, SAGUSD_DECIMALS, 2)} sagUSD` : undefined}
          />
          <Row label="Buffer vs debt" value={coverage !== undefined ? `${coverage.toFixed(1)}%` : "-"} />
          <Row
            label="Stock added by the agents"
            value={grown !== undefined ? `+${fmt(grown, STOCK_DECIMALS, 4)}` : "-"}
            sub={grown !== undefined ? (m.symbol ?? m.stock.wrapper) : undefined}
          />
        </div>
      </div>

      {has && (
        <div className="mt-4 rounded-box border border-line/70 p-3">
          <p className="text-xs leading-relaxed text-mute">
            Agents keep this position at your chosen level and turn the vault yield into more stock. You do not have to
            come back.
          </p>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs">
            <span className="text-mute">
              {target !== undefined && target > 0n ? (
                <>
                  Target <span className="text-white">{fmtBps(target, 1)}</span>
                  {currentLtvBps !== undefined && <span className="text-dim"> now {fmtBps(currentLtvBps, 1)}</span>}
                </>
              ) : (
                <>
                  Now <span className="text-white">{fmtBps(currentLtvBps, 1)}</span>
                  <span className="text-dim"> no target recorded on this market</span>
                </>
              )}
            </span>
            <span className="text-dim">
              {lastAction
                ? `Last agent action: ${
                    lastAction.kind === "compound"
                      ? `+${fmt(BigInt(lastAction.amount), STOCK_DECIMALS, 4)} ${m.symbol ?? m.stock.wrapper}`
                      : `debt ${BigInt(lastAction.amount) < 0n ? "-" : "+"}${fmt(
                          BigInt(lastAction.amount) < 0n ? -BigInt(lastAction.amount) : BigInt(lastAction.amount),
                          USDG_DECIMALS,
                          2,
                        )} USDG`
                  }, ${fmtAge(Math.floor(lastAction.at / 1000))}`
                : "No agent action seen while this page was open"}
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <TxButton
              tx={rebalanceTx}
              variant="secondary"
              label="Rebalance now"
              disabled={!offTarget || !m.account}
              hint={
                target === undefined || target === 0n
                  ? "No target set on this market."
                  : offTarget
                    ? "Borrows more or repays to get back to your level."
                    : `Already on target, inside the ${fmtBps(bandBps, 0)} band.`
              }
              onClick={() =>
                rebalanceTx.send({address: m.account!, abi: accountAbi, functionName: "rebalance", args: [m.adapter]})
              }
            />
            <TxButton
              tx={compoundTx}
              variant="secondary"
              label="Compound yield into stock"
              disabled={!canCompound}
              hint={
                !testDex
                  ? "Needs an allowlisted swap venue on this network."
                  : canCompound
                    ? `Buys ${m.symbol ?? m.stock.wrapper} with the ${fmtUsd(compoundable)} of yield above the debt.`
                    : "No surplus above the debt yet."
              }
              onClick={compound}
            />
          </div>
        </div>
      )}

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
            tx={closeBaseTx}
            variant="secondary"
            label={
              needsTopUp
                ? `Close to ${m.baseSymbol ?? "base"} (for OKX), add ${fmt(shortfall, USDG_DECIMALS, 2)} USDG`
                : `Close to ${m.baseSymbol ?? "the base token"} (send back to OKX)`
            }
            disabled={!m.base || lacksUsdg}
            title={`${m.baseSymbol ?? "The base xStock"} is the token an OKX deposit accepts.`}
            hint={
              needsTopUp
                ? `Approve the USDG top-up, then close to ${m.baseSymbol ?? "the base xStock"}. Unused USDG is not pulled.`
                : `Unwraps to ${m.baseSymbol ?? "the base xStock"}, the token an OKX deposit accepts.`
            }
            onClick={closeBase}
          />
          <TxButton
            className="col-span-2"
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
          No {m.symbol ?? m.stock.wrapper} position yet. Deposit on the left: the USDG you borrow lands in the Agama vault and stays in
          your account as a free buffer that protects the stock.
        </p>
      )}

      {has && m.base && (
        <p className="mt-3 text-xs text-mute">
          Closing to {m.baseSymbol ?? "the base xStock"} gives you the token an OKX deposit accepts.
        </p>
      )}

      <p className="mt-4 text-2xs leading-relaxed text-dim">
        Values in USDG ({USDG_DECIMALS} decimals). Liquidation bonus on this market {fmtBps(m.bonus)}, paid to the Arrow
        Stability Pool only if the health factor falls under 1.00.
      </p>
    </section>
  );
}
