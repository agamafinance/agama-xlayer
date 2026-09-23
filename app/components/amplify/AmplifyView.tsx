"use client";

import clsx from "clsx";
import {useState} from "react";
import {zeroAddress, type Address} from "viem";
import {useAccount, useReadContract, useReadContracts} from "wagmi";

import {HFGauge} from "@/components/HFGauge";
import {TxButton} from "@/components/TxButton";
import {AmountField, Divider, Figure, NotDeployed, PageHead, Row, Slider} from "@/components/ui";
import {chainName, type AppChainId} from "@/lib/chains";
import type {Deployment} from "@/lib/deployment-types";
import {useDeployment} from "@/lib/deployment";
import {BPS, SAGUSD_DECIMALS, USDG_DECIMALS, fmt, fmtRay, fmtUsd, hfToNumber, parseAmount} from "@/lib/format";
import {accountAbi, amplifyRouterAbi} from "@/lib/generated/abis";
import {approve, useAllowance, useProtocol, useTokenBalance, useUsdgSymbol} from "@/lib/hooks";
import {useTx} from "@/lib/tx";

const LADDER = [10_000, 15_000, 20_000, 25_000, 30_000];

type Proto = ReturnType<typeof useProtocol>;

/// HF right after opening at leverage L: pledged value (after haircut) x LT / debt.
function hfEstimate(L: number, haircutBps = 300, ltBps = 8_000): number {
  if (L <= 1) return Number.POSITIVE_INFINITY;
  return ((1 - haircutBps / 10_000) * L * (ltBps / 10_000)) / (L - 1);
}

export function AmplifyView() {
  const {chainId, d} = useDeployment();
  const proto = useProtocol(d, chainId);

  if (!d) {
    return (
      <>
        <PageHead title="Amplify the vault yield" />
        <NotDeployed chainName={chainName(chainId)} />
      </>
    );
  }
  return <Amplify d={d} chainId={chainId} proto={proto} />;
}

function Amplify({d, chainId, proto}: {d: Deployment; chainId: AppChainId; proto: Proto}) {
  const {address} = useAccount();
  const router = d.contracts.amplifyRouter;
  const vaultApy = proto.vaultApy ?? 0n;

  const {data: pos} = useReadContract({
    address: router,
    abi: amplifyRouterAbi,
    functionName: "position",
    args: [address ?? zeroAddress],
    chainId,
    query: {enabled: !!address},
  });
  const account = pos?.account && pos.account !== zeroAddress ? pos.account : undefined;

  const {data: ladder} = useReadContracts({
    allowFailure: true,
    contracts: LADDER.map((l) => ({
      address: router,
      abi: amplifyRouterAbi,
      functionName: "netApyRay" as const,
      args: [vaultApy, BigInt(l)] as const,
      chainId,
    })),
    query: {enabled: proto.vaultApy !== undefined},
  });

  const {data: free} = useReadContracts({
    allowFailure: true,
    contracts: [
      {address: account ?? zeroAddress, abi: accountAbi, functionName: "freeShares", chainId},
      {address: account ?? zeroAddress, abi: accountAbi, functionName: "freeSharesValue", chainId},
    ],
    query: {enabled: !!account},
  });
  const freeShares = account ? free?.[0]?.result : undefined;
  const freeValue = account ? free?.[1]?.result : undefined;

  const hasPos = !!pos && (pos.pledgedShares > 0n || pos.debt > 0n);
  const {data: currentNet} = useReadContract({
    address: router,
    abi: amplifyRouterAbi,
    functionName: "netApyRay",
    args: [vaultApy, pos?.leverageBps ?? 10_000n],
    chainId,
    query: {enabled: hasPos && proto.vaultApy !== undefined},
  });

  return (
    <>
      <PageHead
        title="Amplify the vault yield"
        stats={
          <>
            <Figure
              label="Agama vault APY"
              value={fmtRay(proto.vaultApy)}
              sub={proto.vaultApyIsTarget ? "Target, not yet measured" : "Realized"}
              tone="mint"
            />
            <Figure label="Arrow borrow APR" value={fmtRay(proto.borrowRate)} sub="Paid on the looped part" />
            <Figure label="Net APY at 3.0x" value={fmtRay(ladder?.[4]?.result)} sub="Before any rate change" />
          </>
        }
      >
        Deposit USDG into the Agama vault and loop it on Arrow: vault shares as collateral, borrow USDG, back into the
        vault, up to 3x. Net APY = vault APY + (L - 1) × (vault APY - borrow APR).
      </PageHead>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Ticket d={d} chainId={chainId} proto={proto} ladder={ladder?.map((r) => r.result)} freeShares={freeShares} freeValue={freeValue} />
        <section className="panel-muted p-5" aria-labelledby="amp-pos">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="amp-pos" className="text-md text-white">
              Your Amplify position
            </h2>
            {account && (
              <span className="text-2xs text-dim" title={account}>
                Agama account {account.slice(0, 6)}
                {"…"}
                {account.slice(-4)}
              </span>
            )}
          </div>
          <div className="mt-4">
            <HFGauge
              mode="amplify"
              hf={hasPos ? hfToNumber(pos!.healthFactorRay) : undefined}
              haircutBps={proto.haircutBps !== undefined ? Number(proto.haircutBps) : undefined}
            />
          </div>
          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <div>
              <Row label="Exposure" value={hasPos ? fmtUsd(pos!.exposure) : "-"} sub="in the vault" />
              <Row label="Debt" value={hasPos ? fmtUsd(pos!.debt) : "-"} sub="USDG" />
              <Row label="Equity" value={hasPos ? fmtUsd(pos!.equity) : "-"} />
            </div>
            <div>
              <Row label="Leverage" value={hasPos ? `${(Number(pos!.leverageBps) / 10_000).toFixed(2)}x` : "-"} />
              <Row
                label="Net APY now"
                value={hasPos && currentNet !== undefined ? <span className={currentNet < 0n ? "text-coral" : "text-mint"}>{fmtRay(currentNet)}</span> : "-"}
              />
              <Row label="Pledged" value={hasPos ? fmt(pos!.pledgedShares, SAGUSD_DECIMALS, 2) : "-"} sub="sagUSD" />
            </div>
          </div>
          <ClosePanel router={router} chainId={chainId} hasPos={hasPos} />
          <p className="mt-4 text-2xs leading-relaxed text-dim">
            Spread guard: if the Arrow borrow rate plus 1% rises above the vault&apos;s realized APY, anyone can unwind the
            loop back to 1x on-chain. A loop with negative carry is never left running.
          </p>
        </section>
      </div>
    </>
  );
}

function ClosePanel({router, chainId, hasPos}: {router: Address; chainId: AppChainId; hasPos: boolean}) {
  const redeemTx = useTx(chainId);
  const keepTx = useTx(chainId);
  if (!hasPos) {
    return (
      <p className="mt-4 text-sm text-mute">
        No Amplify position yet. Pick an amount and a leverage, or stack it on the vault shares of an Earn
        position.
      </p>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <TxButton
        tx={redeemTx}
        label="Close to USDG"
        variant="secondary"
        hint="Unwinds the loop and pays your equity in USDG."
        onClick={() => redeemTx.send({address: router, abi: amplifyRouterAbi, functionName: "close", args: [true]})}
      />
      <TxButton
        tx={keepTx}
        label="Close, keep sagUSD"
        variant="secondary"
        hint="Unwinds and sends the equity as vault shares."
        onClick={() => keepTx.send({address: router, abi: amplifyRouterAbi, functionName: "close", args: [false]})}
      />
    </div>
  );
}

function Ticket({
  d,
  chainId,
  proto,
  ladder,
  freeShares,
  freeValue,
}: {
  d: Deployment;
  chainId: AppChainId;
  proto: Proto;
  ladder: (bigint | undefined)[] | undefined;
  freeShares: bigint | undefined;
  freeValue: bigint | undefined;
}) {
  const {address} = useAccount();
  const router = d.contracts.amplifyRouter;
  const usdg = d.tokens.USDG;
  const [amountStr, setAmountStr] = useState("");
  const [L, setL] = useState(2);
  const leverageBps = BigInt(Math.round(L * 10_000));
  const amount = parseAmount(amountStr, USDG_DECIMALS) ?? 0n;
  const usdgSymbol = useUsdgSymbol(d, chainId);

  const balance = useTokenBalance(usdg, address, chainId);
  const allowance = useAllowance(usdg, address, router, chainId);
  const approveTx = useTx(chainId);
  const openTx = useTx(chainId);
  const stackTx = useTx(chainId);

  const {data: netApy} = useReadContract({
    address: router,
    abi: amplifyRouterAbi,
    functionName: "netApyRay",
    args: [proto.vaultApy ?? 0n, leverageBps],
    chainId,
    query: {enabled: proto.vaultApy !== undefined},
  });

  const haircut = proto.haircutBps !== undefined ? Number(proto.haircutBps) : 300;
  const lt = proto.vaultLt !== undefined ? Number(proto.vaultLt) : 8_000;
  const hf = hfEstimate(L, haircut, lt);
  const exposure = (amount * leverageBps) / BPS;
  const borrowed = exposure - amount;
  const perYear = netApy !== undefined ? (amount * netApy) / 10n ** 27n : undefined;

  const needsApproval = amount > 0n && (allowance ?? 0n) < amount;
  const over = balance !== undefined && amount > balance;
  const loopBlocked = L > 1 && proto.vaultBorrowAllowed === false;
  const canSubmit = !!address && amount > 0n && !over;

  return (
    <section className="panel p-5" aria-labelledby="amp-ticket">
      <h2 id="amp-ticket" className="text-md text-white">
        Loop the Agama vault
      </h2>

      <div className="mt-4 space-y-3">
        <AmountField
          id="amp-amount"
          label="Deposit"
          value={amountStr}
          onChange={setAmountStr}
          decimals={USDG_DECIMALS}
          symbol={usdgSymbol}
          balance={balance}
        />
        <Slider
          id="amp-lev"
          label="Leverage"
          value={L}
          min={1}
          max={3}
          step={0.05}
          onChange={setL}
          display={`${L.toFixed(2)}x`}
          minLabel="1.00x, vault only"
          maxLabel="3.00x max"
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-mute">
        If the borrow rate rises above the vault APY, the spread guard unwinds the loop back to 1x on its own: anyone
        can trigger it and your equity stays in vault shares. You do not have to watch the rate.
      </p>

      <div className="mt-4">
        <Row
          label="Net APY"
          strong
          value={netApy === undefined ? "-" : <span className={netApy < 0n ? "text-coral" : "text-mint"}>{fmtRay(netApy)}</span>}
        />
        <Row label="Per year at today's rates" value={perYear !== undefined && amount > 0n ? fmtUsd(perYear) : "-"} />
        <Divider />
        <Row label="Vault exposure" value={amount > 0n ? fmtUsd(exposure) : "-"} />
        <Row label="Borrowed on Arrow" value={amount > 0n ? fmtUsd(borrowed) : "-"} sub="USDG" />
        <Row label="Break-even borrow APR" value={fmtRay(proto.vaultApy)} sub="= vault APY" />
        <Row
          label="Health factor after (est.)"
          value={Number.isFinite(hf) ? hf.toFixed(2) : "No debt"}
          sub={`${((10_000 - haircut) / 100).toFixed(0)}% × L × ${(lt / 100).toFixed(0)}% / (L - 1)`}
        />
      </div>

      <table className="mt-4 w-full text-left text-sm">
        <caption className="pb-1.5 text-left text-xs text-mute">Leverage ladder at today&apos;s rates</caption>
        <thead>
          <tr className="text-2xs text-dim">
            <th className="py-1 font-normal">Leverage</th>
            <th className="py-1 text-right font-normal">Net APY</th>
            <th className="py-1 text-right font-normal">HF est.</th>
          </tr>
        </thead>
        <tbody>
          {LADDER.map((l, i) => {
            const active = Math.abs(l / 10_000 - L) < 0.001;
            const v = ladder?.[i];
            const h = hfEstimate(l / 10_000, haircut, lt);
            return (
              <tr
                key={l}
                onClick={() => setL(l / 10_000)}
                className={clsx("cursor-pointer border-t border-white/10", active ? "text-white" : "text-mute hover:text-white")}
              >
                <td className="py-1.5">
                  <button type="button" onClick={() => setL(l / 10_000)} className="text-left">
                    {active && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint align-middle" aria-hidden />}
                    {(l / 10_000).toFixed(1)}x
                  </button>
                </td>
                <td className={clsx("py-1.5 text-right", v !== undefined && v < 0n && "text-coral")}>{fmtRay(v)}</td>
                <td className="py-1.5 text-right">{Number.isFinite(h) ? h.toFixed(2) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <TxButton
          tx={approveTx}
          variant={needsApproval ? "primary" : "secondary"}
          label={amount > 0n && !needsApproval ? `${usdgSymbol} approved` : `Approve ${usdgSymbol}`}
          disabled={!canSubmit || !needsApproval}
          onClick={() => approve(approveTx, usdg, router, amount)}
        />
        <TxButton
          tx={openTx}
          label={`Open at ${L.toFixed(2)}x`}
          disabled={!canSubmit || needsApproval || loopBlocked}
          hint={loopBlocked ? "Vault NAV breaker active: borrowing against sagUSD is paused." : undefined}
          onClick={async () => {
            const ok = await openTx.send({address: router, abi: amplifyRouterAbi, functionName: "open", args: [amount, leverageBps]});
            if (ok) setAmountStr("");
          }}
        />
      </div>

      <div className="mt-4 rounded-box border border-line/70 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-white">Stack on my Earn shares</span>
          <span className="text-xs text-dim">
            {freeValue !== undefined ? `${fmtUsd(freeValue)} free` : "No Earn shares"}
            {freeShares !== undefined && freeShares > 0n && ` (${fmt(freeShares, SAGUSD_DECIMALS, 2)} sagUSD)`}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-mute">
          Pledges the vault shares your Earn positions produced and loops them at {L.toFixed(2)}x. Those shares stop being
          the soft-deleverage buffer of your stock positions.
        </p>
        <TxButton
          className="mt-2.5"
          tx={stackTx}
          variant="secondary"
          label={`Stack at ${L.toFixed(2)}x`}
          disabled={!address || !freeShares || freeShares === 0n || L <= 1 || loopBlocked}
          onClick={() => stackTx.send({address: router, abi: amplifyRouterAbi, functionName: "openFromEarn", args: [leverageBps]})}
        />
      </div>
    </section>
  );
}
