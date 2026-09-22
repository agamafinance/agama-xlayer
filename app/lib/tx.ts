"use client";

import {useQueryClient} from "@tanstack/react-query";
import {useCallback, useRef, useState} from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  decodeErrorResult,
  formatUnits,
  type Abi,
  type Address,
  type Hash,
} from "viem";
import {useAccount, useConfig} from "wagmi";
import {simulateContract, waitForTransactionReceipt, writeContract} from "wagmi/actions";

import type {AppChainId} from "./chains";
import {allErrorsAbi} from "./generated/abis";

export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export type TxStatus = "idle" | "simulating" | "signing" | "mining" | "success" | "error";

export type Tx = {
  status: TxStatus;
  hash?: Hash;
  chainId?: number;
  error?: string;
  busy: boolean;
  send: (call: Call) => Promise<boolean>;
  reset: () => void;
};

/// One transaction slot: simulate (decoded revert reasons before the wallet
/// opens), sign, wait for the receipt, then refetch every on-chain read.
export function useTx(chainId: AppChainId): Tx {
  const config = useConfig();
  const {address} = useAccount();
  const qc = useQueryClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();
  const timer = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    setStatus("idle");
    setHash(undefined);
    setError(undefined);
  }, []);

  const send = useCallback(
    async (call: Call) => {
      window.clearTimeout(timer.current);
      setError(undefined);
      setHash(undefined);
      if (!address) {
        setStatus("error");
        setError("Connect a wallet first.");
        return false;
      }
      // Merge every custom error of the stack so nested reverts decode.
      const request = {...call, abi: [...call.abi, ...allErrorsAbi] as Abi, account: address, chainId};
      try {
        setStatus("simulating");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await simulateContract(config, request as any);
        setStatus("signing");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = await writeContract(config, request as any);
        setHash(h);
        setStatus("mining");
        const receipt = await waitForTransactionReceipt(config, {hash: h, chainId});
        if (receipt.status !== "success") throw new Error("Transaction reverted on-chain.");
        setStatus("success");
        await qc.invalidateQueries();
        timer.current = window.setTimeout(() => setStatus("idle"), 4000);
        return true;
      } catch (e) {
        setStatus("error");
        setError(explainError(e));
        await qc.invalidateQueries();
        return false;
      }
    },
    [address, chainId, config, qc],
  );

  return {
    status,
    hash,
    chainId,
    error,
    busy: status === "simulating" || status === "signing" || status === "mining",
    send,
    reset,
  };
}

// ---- Revert reasons ----------------------------------------------------------------

const RAY = 10n ** 27n;
const n = (v: unknown) => (typeof v === "bigint" ? v : 0n);
const pct = (bps: unknown) => `${(Number(n(bps)) / 100).toFixed(2)}%`;
const hf = (ray: unknown) => (Number((n(ray) * 1000n) / RAY) / 1000).toFixed(3);

const MESSAGES: Record<string, (args: readonly unknown[]) => string> = {
  LtvTooHigh: (a) => `LTV ${pct(a[0])} is above this market's max of ${pct(a[1])}.`,
  MarketClosed: () => "The stock market is closed: new borrows are frozen until the next open. You can still deposit at 0% LTV.",
  BorrowNotAllowed: () => "Borrowing is paused on this market (market closed, stale price or vault NAV breaker).",
  PriceStale: (a) => `The oracle price is stale (${String(a[1] ?? "?")}s old, max ${String(a[2] ?? "?")}s). Wait for the next price push.`,
  HealthFactorOk: (a) => `Health factor is ${hf(a[0])}, above the 1.15 trigger. Nothing to deleverage.`,
  HealthFactorTooLow: () => "This would put the health factor under the allowed limit.",
  InsufficientToRepay: (a) =>
    `The free vault shares fall ${formatUnits(n(a[0]), 6)} USDG short of the debt: close with a top-up from your wallet.`,
  TooLittleBought: (a) =>
    `The swap returned ${formatUnits(n(a[0]), 18)} tokens, under the ${formatUnits(n(a[1]), 18)} minimum. Retry: the route moved.`,
  TargetNotAllowed: (a) => `The aggregator router ${String(a[0])} is not allowlisted on the zap.`,
  SpenderNotAllowed: (a) => `The aggregator spender ${String(a[0])} is not allowlisted on the zap.`,
  SwapFailed: () => "The aggregator swap failed, usually an expired route. Retry to get a fresh one.",
  NothingToDeleverage: () => "No free vault shares or cash left to repay with.",
  RedemptionQueued: () => "The vault's instant liquidity is short: the redemption was queued instead of paid now.",
  BorrowCapExceeded: () => "The Arrow pool borrow cap is reached.",
  SupplyCapExceeded: () => "The Arrow pool supply cap is reached.",
  LiquidityShortfall: () => "Not enough idle USDG in the Arrow pool right now.",
  AmountBelowMinimum: () => "Amount is below the minimum (1 USDG borrow).",
  AmountZero: () => "Enter an amount above zero.",
  LeverageOutOfRange: () => "Leverage must be between 1.0x and 3.0x.",
  Underwater: () => "Position is underwater: collateral value does not cover the debt.",
  UnwindIncomplete: (a) => `Unwind stopped with ${formatUnits(n(a[0]), 6)} USDG of debt left. Try again.`,
  NotAuthorized: () => "Only the account owner can do this.",
  CooldownActive: (a) =>
    Number(n(a[0])) === 0
      ? "Request an exit first, then redeem after the cooldown."
      : `Cooldown active until ${new Date(Number(n(a[0])) * 1000).toLocaleString()}.`,
  ExceedsRequest: (a) => `You can redeem at most the requested ${formatUnits(n(a[0]), 12)} shares.`,
  SameBlock: () => "Deposit and withdrawal cannot happen in the same block.",
  InsufficientInventory: () => "The stability pool does not hold enough lender shares for this exit.",
  WithdrawalsArePaused: () => "Withdrawals from the Arrow pool are paused.",
  EnforcedPause: () => "The contract is paused.",
  ERC20InsufficientBalance: () => "Insufficient token balance.",
  ERC20InsufficientAllowance: () => "Allowance too low: approve first.",
  ERC4626ExceededMaxWithdraw: () => "Amount is above what you can withdraw right now.",
  ERC4626ExceededMaxRedeem: () => "Amount is above what you can redeem right now.",
  VaultPositionNotOpened: () => "No Arrow position opened for this account.",
  SpreadPositive: () => "The carry is still positive: auto-unwind is not allowed.",
};

export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "Rejected in the wallet.";
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (rev) {
      let name = rev.data?.errorName;
      let args: readonly unknown[] = rev.data?.args ?? [];
      if (!name && rev.raw) {
        try {
          const d = decodeErrorResult({abi: allErrorsAbi, data: rev.raw});
          name = d.errorName;
          args = (d.args ?? []) as readonly unknown[];
        } catch {
          /* unknown selector */
        }
      }
      if (name) return MESSAGES[name]?.(args) ?? `Reverted: ${name}${args.length ? `(${args.map(String).join(", ")})` : ""}`;
      if (rev.reason) return `Reverted: ${rev.reason}`;
    }
    const msg = e.shortMessage || e.message;
    if (/chain.*mismatch|does not match the target chain/i.test(msg)) return "Wallet is on another network. Switch network and retry.";
    return msg.split("\n")[0];
  }
  if (e instanceof Error) return e.message.split("\n")[0];
  return String(e);
}
