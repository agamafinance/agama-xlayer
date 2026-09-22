"use client";

import clsx from "clsx";
import {useState} from "react";
import {erc20Abi, zeroAddress} from "viem";
import {useAccount, useBlock, useReadContracts} from "wagmi";

import {TxButton} from "@/components/TxButton";
import {AmountField, Divider, Figure, NotDeployed, PageHead, Pill, Row} from "@/components/ui";
import {chainName, type AppChainId} from "@/lib/chains";
import type {Deployment} from "@/lib/deployment-types";
import {useDeployment} from "@/lib/deployment";
import {
  ARUSDG_DECIMALS,
  ASP_DECIMALS,
  MAX_UINT,
  USDG_DECIMALS,
  fmt,
  fmtBps,
  fmtDuration,
  fmtRay,
  fmtUsd,
  parseAmount,
} from "@/lib/format";
import {debtTokenAbi, lendingPoolAbi, stabilityPoolAbi} from "@/lib/generated/abis";
import {approve, useAllowance, useProtocol, useUsdgSymbol} from "@/lib/hooks";
import {useTx} from "@/lib/tx";

type Proto = ReturnType<typeof useProtocol>;

export function LendView() {
  const {chainId, d} = useDeployment();
  const proto = useProtocol(d, chainId);
  if (!d) {
    return (
      <>
        <PageHead title="Lend USDG on Arrow" />
        <NotDeployed chainName={chainName(chainId)} />
      </>
    );
  }
  return <Lend d={d} chainId={chainId} proto={proto} />;
}

function useLendData(d: Deployment, chainId: AppChainId) {
  const {address} = useAccount();
  const who = address ?? zeroAddress;
  const pool = d.contracts.pool;
  const sp = d.contracts.stabilityPool;
  const usdg = d.tokens.USDG;

  const {data: a} = useReadContracts({
    allowFailure: true,
    contracts: [
      {address: pool, abi: lendingPoolAbi, functionName: "totalAssets", chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "DEBT_TOKEN", chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "supplyCap", chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "borrowCap", chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "balanceOf", args: [who], chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "maxWithdraw", args: [who], chainId},
      {address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [pool], chainId},
      {address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [who], chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "totalAssets", chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "inventoryValue", chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "buyerDiscountBps", chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "cooldown", chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "balanceOf", args: [who], chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "exitRequests", args: [who], chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "totalSupply", chainId},
    ],
  });

  const debtToken = a?.[1]?.result;
  const spTotal = a?.[8]?.result;
  const spBal = address ? a?.[12]?.result : undefined;

  const {data: b} = useReadContracts({
    allowFailure: true,
    contracts: [
      {address: debtToken ?? zeroAddress, abi: debtTokenAbi, functionName: "totalSupply", chainId},
      {address: pool, abi: lendingPoolAbi, functionName: "convertToAssets", args: [spTotal ?? 0n], chainId},
      {address: sp, abi: stabilityPoolAbi, functionName: "convertToAssets", args: [spBal ?? 0n], chainId},
    ],
    query: {enabled: !!debtToken},
  });
  const spUserLender = b?.[2]?.result;

  const {data: c} = useReadContracts({
    allowFailure: true,
    contracts: [{address: pool, abi: lendingPoolAbi, functionName: "convertToAssets", args: [spUserLender ?? 0n], chainId}],
    query: {enabled: spUserLender !== undefined},
  });

  // Cooldowns are checked against block time, not the browser clock (they
  // differ on a fork after time travel).
  const {data: block} = useBlock({chainId, query: {refetchInterval: 12_000}});

  const exit = address ? a?.[13]?.result : undefined;
  return {
    chainNow: block?.timestamp,
    address,
    supplied: a?.[0]?.result,
    supplyCap: a?.[2]?.result,
    borrowCap: a?.[3]?.result,
    lenderShares: address ? a?.[4]?.result : undefined,
    maxWithdraw: address ? a?.[5]?.result : undefined,
    idle: a?.[6]?.result,
    usdgBalance: address ? a?.[7]?.result : undefined,
    spInventory: a?.[9]?.result,
    spDiscount: a?.[10]?.result,
    spCooldown: a?.[11]?.result,
    spBal,
    exitShares: exit ? exit[0] : undefined,
    exitUnlockAt: exit ? exit[1] : undefined,
    totalShares: a?.[14]?.result,
    borrowed: b?.[0]?.result,
    spTvl: b?.[1]?.result,
    spUserValue: address ? c?.[0]?.result : undefined,
  };
}

function Lend({d, chainId, proto}: {d: Deployment; chainId: AppChainId; proto: Proto}) {
  const x = useLendData(d, chainId);
  const util =
    x.supplied !== undefined && x.borrowed !== undefined && x.supplied > 0n
      ? Number((x.borrowed * 10_000n) / x.supplied) / 100
      : undefined;

  return (
    <>
      <PageHead
        title="Lend USDG on Arrow"
        stats={
          <>
            <Figure label="Supply APR" value={fmtRay(proto.supplyRate)} tone="mint" sub="Paid by borrowers" />
            <Figure label="Borrow APR" value={fmtRay(proto.borrowRate)} sub="Variable rate" />
            <Figure label="Utilization" value={util === undefined ? "-" : `${util.toFixed(2)}%`} />
          </>
        }
      >
        The Arrow USDG pool funds every Earn and Amplify borrow. Lenders get the interest; the Stability Pool backstops
        liquidations and keeps the collateral bonus.
      </PageHead>

      <div className="panel-muted mb-5 grid grid-cols-2 gap-x-8 gap-y-4 px-5 py-4 md:grid-cols-5">
        <Figure label="Supplied" value={fmtUsd(x.supplied)} sub="USDG in the pool" />
        <Figure label="Borrowed" value={fmtUsd(x.borrowed)} sub="Outstanding debt" />
        <Figure label="Available" value={fmtUsd(x.idle)} sub="Idle, withdrawable now" />
        <Figure
          label="Supply cap"
          value={x.supplyCap === undefined ? "-" : x.supplyCap >= MAX_UINT / 2n ? "None" : `${fmt(x.supplyCap, ARUSDG_DECIMALS, 0)}`}
          sub="arUSDG shares"
        />
        <Figure
          label="Borrow cap"
          value={x.borrowCap === undefined ? "-" : x.borrowCap >= MAX_UINT / 2n ? "None" : fmtUsd(x.borrowCap, USDG_DECIMALS, 0)}
          sub="Guarded launch"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SupplyPanel d={d} chainId={chainId} x={x} />
        <StabilityPanel d={d} chainId={chainId} x={x} />
      </div>
    </>
  );
}

type LendData = ReturnType<typeof useLendData>;

function SupplyPanel({d, chainId, x}: {d: Deployment; chainId: AppChainId; x: LendData}) {
  const [tab, setTab] = useState<"supply" | "withdraw">("supply");
  const [amountStr, setAmountStr] = useState("");
  const pool = d.contracts.pool;
  const sym = useUsdgSymbol(d, chainId);
  const amount = parseAmount(amountStr, USDG_DECIMALS) ?? 0n;
  const allowance = useAllowance(d.tokens.USDG, x.address, pool, chainId);
  const approveTx = useTx(chainId);
  const actTx = useTx(chainId);

  const needsApproval = tab === "supply" && amount > 0n && (allowance ?? 0n) < amount;
  const limit = tab === "supply" ? x.usdgBalance : x.maxWithdraw;
  const over = limit !== undefined && amount > limit;
  const illiquid = tab === "withdraw" && x.idle !== undefined && amount > x.idle;
  const canSubmit = !!x.address && amount > 0n && !over;

  const act = async () => {
    let ok: boolean;
    if (tab === "supply") {
      ok = await actTx.send({address: pool, abi: lendingPoolAbi, functionName: "deposit", args: [amount, x.address!]});
    } else if (x.maxWithdraw !== undefined && amount === x.maxWithdraw && x.lenderShares) {
      // Full exit: redeem every share so no dust is left behind.
      ok = await actTx.send({address: pool, abi: lendingPoolAbi, functionName: "redeem", args: [x.lenderShares, x.address!, x.address!]});
    } else {
      ok = await actTx.send({address: pool, abi: lendingPoolAbi, functionName: "withdraw", args: [amount, x.address!, x.address!]});
    }
    if (ok) setAmountStr("");
  };

  return (
    <section className="panel p-5" aria-labelledby="supply-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="supply-title" className="text-md text-white">
          Arrow USDG pool
        </h2>
        <div className="pill-bar flex rounded-full p-0.5 text-sm" role="tablist">
          {(["supply", "withdraw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setAmountStr("");
                actTx.reset();
              }}
              className={clsx("rounded-full px-3.5 py-1 capitalize", tab === t ? "bg-white/[0.14] text-white" : "text-mute hover:text-white")}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Row label="Your supply" value={fmtUsd(x.maxWithdraw)} sub="USDG" strong />
        <Row label="Pool shares" value={fmt(x.lenderShares, ARUSDG_DECIMALS, 4)} sub="arUSDG" />
      </div>

      <div className="mt-3">
        <AmountField
          id="lend-amount"
          label={tab === "supply" ? "Supply" : "Withdraw"}
          value={amountStr}
          onChange={setAmountStr}
          decimals={USDG_DECIMALS}
          symbol={sym}
          balance={limit}
          balanceLabel={tab === "supply" ? "Wallet" : "Supplied"}
          footer={illiquid ? undefined : tab === "withdraw" ? `${fmtUsd(x.idle)} idle in the pool right now` : undefined}
        />
        {illiquid && <p className="mt-1.5 text-xs text-sand">Above the idle liquidity: wait for repayments or withdraw less.</p>}
      </div>

      <div className={clsx("mt-4 grid gap-3", tab === "supply" ? "grid-cols-2" : "grid-cols-1")}>
        {tab === "supply" && (
          <TxButton
            tx={approveTx}
            variant={needsApproval ? "primary" : "secondary"}
            label={amount > 0n && !needsApproval ? `${sym} approved` : `Approve ${sym}`}
            disabled={!canSubmit || !needsApproval}
            onClick={() => approve(approveTx, d.tokens.USDG, pool, amount)}
          />
        )}
        <TxButton
          tx={actTx}
          label={tab === "supply" ? `Supply ${sym}` : `Withdraw ${sym}`}
          disabled={!canSubmit || needsApproval || illiquid}
          onClick={act}
        />
      </div>
      {!x.address && <p className="mt-3 text-xs text-dim">Connect a wallet to supply.</p>}
    </section>
  );
}

function StabilityPanel({d, chainId, x}: {d: Deployment; chainId: AppChainId; x: LendData}) {
  const sp = d.contracts.stabilityPool;
  const sym = useUsdgSymbol(d, chainId);
  const [depStr, setDepStr] = useState("");
  const [exitStr, setExitStr] = useState("");
  const dep = parseAmount(depStr, USDG_DECIMALS) ?? 0n;
  const exitAmt = parseAmount(exitStr, ASP_DECIMALS) ?? 0n;
  const allowance = useAllowance(d.tokens.USDG, x.address, sp, chainId);
  const approveTx = useTx(chainId);
  const depTx = useTx(chainId);
  const reqTx = useTx(chainId);
  const redeemTx = useTx(chainId);

  const needsApproval = dep > 0n && (allowance ?? 0n) < dep;
  const depOver = x.usdgBalance !== undefined && dep > x.usdgBalance;
  const exitOver = x.spBal !== undefined && exitAmt > x.spBal;

  const now = x.chainNow ?? BigInt(Math.floor(Date.now() / 1000));
  const pending = x.exitShares !== undefined && x.exitShares > 0n;
  const unlocked = pending && x.exitUnlockAt !== undefined && x.exitUnlockAt <= now;
  const redeemable = pending && x.spBal !== undefined ? (x.exitShares! < x.spBal ? x.exitShares! : x.spBal) : 0n;

  return (
    <section className="panel-muted p-5" aria-labelledby="sp-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sp-title" className="text-md text-white">
          Arrow Stability Pool
        </h2>
        <span className="text-2xs text-dim">aSP-USDG</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-mute">
        Stakers absorb liquidated debt and receive the collateral with the liquidation bonus, then sell it to buyers at a
        {` ${fmtBps(x.spDiscount, 0)} `}discount. Idle stake stays supplied in the Arrow pool and keeps earning the supply APR.
      </p>

      <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
        <div>
          <Row label="TVL" value={fmtUsd(x.spTvl)} sub="USDG" />
          <Row label="Collateral inventory" value={fmtUsd(x.spInventory)} />
          <Row label="Exit cooldown" value={fmtDuration(x.spCooldown)} />
        </div>
        <div>
          <Row label="Your stake" value={fmtUsd(x.spUserValue)} sub="USDG" />
          <Row label="Your shares" value={fmt(x.spBal, ASP_DECIMALS, 4)} />
          <Row
            label="Exit request"
            value={
              pending ? (
                unlocked ? (
                  <Pill tone="mint">Ready</Pill>
                ) : (
                  <Pill tone="sand" title={new Date(Number(x.exitUnlockAt) * 1000).toLocaleString()}>
                    Unlocks {new Date(Number(x.exitUnlockAt) * 1000).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}
                  </Pill>
                )
              ) : (
                "None"
              )
            }
          />
        </div>
      </div>

      <Divider />

      <div className="mt-2">
        <AmountField
          id="sp-dep"
          label={`Stake ${sym}`}
          value={depStr}
          onChange={setDepStr}
          decimals={USDG_DECIMALS}
          symbol={sym}
          balance={x.usdgBalance}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TxButton
            tx={approveTx}
            variant={needsApproval ? "primary" : "secondary"}
            label={dep > 0n && !needsApproval ? `${sym} approved` : `Approve ${sym}`}
            disabled={!x.address || dep === 0n || depOver || !needsApproval}
            onClick={() => approve(approveTx, d.tokens.USDG, sp, dep)}
          />
          <TxButton
            tx={depTx}
            label="Stake"
            disabled={!x.address || dep === 0n || depOver || needsApproval}
            onClick={async () => {
              const ok = await depTx.send({address: sp, abi: stabilityPoolAbi, functionName: "depositUSDG", args: [dep, x.address!]});
              if (ok) setDepStr("");
            }}
          />
        </div>
      </div>

      <div className="mt-5">
        <AmountField
          id="sp-exit"
          label="Unstake (shares)"
          value={exitStr}
          onChange={setExitStr}
          decimals={ASP_DECIMALS}
          symbol="aSP-USDG"
          balance={x.spBal}
          balanceLabel="Staked"
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TxButton
            tx={reqTx}
            variant="secondary"
            label="Request exit"
            disabled={!x.address || exitAmt === 0n || exitOver}
            hint={`Starts a ${fmtDuration(x.spCooldown)} cooldown. A new request replaces the old one.`}
            onClick={async () => {
              const ok = await reqTx.send({address: sp, abi: stabilityPoolAbi, functionName: "requestExit", args: [exitAmt]});
              if (ok) setExitStr("");
            }}
          />
          <TxButton
            tx={redeemTx}
            variant={unlocked ? "primary" : "secondary"}
            label={pending ? `Redeem ${fmt(redeemable, ASP_DECIMALS, 2)}` : "Redeem"}
            disabled={!x.address || !unlocked || redeemable === 0n}
            hint="Paid in arUSDG pool shares, withdraw them as USDG on the left."
            onClick={() =>
              redeemTx.send({address: sp, abi: stabilityPoolAbi, functionName: "redeem", args: [redeemable, x.address!, x.address!]})
            }
          />
        </div>
      </div>
    </section>
  );
}
