"use client";

import {useState} from "react";
import {parseAbi, type Address} from "viem";
import {useAccount, useChainId} from "wagmi";

import {OKB_TESTNET_FAUCET, TESTNET_ID, txUrl} from "@/lib/chains";
import {getDeployment, isForkDeployment} from "@/lib/deployment";
import {useTx} from "@/lib/tx";

const faucetAbi = parseAbi(["function faucet(address to, uint256 amount)"]);

const USDG_AMOUNT = 5_000n * 10n ** 6n; // cap 10,000 per call
const STOCK_AMOUNT = 10n * 10n ** 18n; // cap 100 per call

/// X Layer Testnet only: mints the faucet stand-ins (USDG + the four wrapped
/// xStocks) to the connected wallet, one wallet transaction per token.
export function TestnetFaucetButton() {
  const chainId = useChainId();
  const {address} = useAccount();
  const tx = useTx(TESTNET_ID);
  const [step, setStep] = useState<{i: number; n: number; label: string} | null>(null);
  const [result, setResult] = useState<"ok" | "err" | null>(null);
  const d = getDeployment(TESTNET_ID);

  if (chainId !== TESTNET_ID || !address || !d) return null;

  const mints: {label: string; token: Address; amount: bigint}[] = [
    {label: "USDG", token: d.tokens.USDG, amount: USDG_AMOUNT},
    {label: "wTSLAx", token: d.tokens.wTSLAx, amount: STOCK_AMOUNT},
    {label: "wNVDAx", token: d.tokens.wNVDAx, amount: STOCK_AMOUNT},
    {label: "wSPYx", token: d.tokens.wSPYx, amount: STOCK_AMOUNT},
    {label: "wAAPLx", token: d.tokens.wAAPLx, amount: STOCK_AMOUNT},
  ];

  const run = async () => {
    setResult(null);
    for (let i = 0; i < mints.length; i++) {
      const m = mints[i];
      setStep({i: i + 1, n: mints.length, label: m.label});
      const ok = await tx.send({address: m.token, abi: faucetAbi, functionName: "faucet", args: [address, m.amount]});
      if (!ok) {
        setStep(null);
        setResult("err");
        return;
      }
    }
    setStep(null);
    setResult("ok");
    window.setTimeout(() => setResult(null), 5000);
  };

  const busy = step !== null;
  const url = tx.hash ? txUrl(TESTNET_ID, tx.hash) : undefined;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title={
          result === "err" && tx.error
            ? tx.error
            : "Mints 5,000 USDG and 10 each of wTSLAx, wNVDAx, wSPYx, wAAPLx (testnet stand-ins), one wallet transaction per token"
        }
        className={
          "inline-flex h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors disabled:opacity-80 " +
          (result === "err"
            ? "border-coral text-coral"
            : result === "ok"
              ? "border-mint bg-mint/15 text-mint"
              : "border-dashed border-mint/70 text-mint hover:bg-mint/10")
        }
      >
        {busy
          ? `Minting ${step.label} (${step.i}/${step.n})`
          : result === "ok"
            ? "Test tokens received"
            : result === "err"
              ? "Faucet failed, retry"
              : "Get test tokens"}
      </button>
      {busy && url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="absolute left-0 right-0 top-11 truncate text-center text-2xs text-dim underline underline-offset-2"
        >
          view tx
        </a>
      )}
    </div>
  );
}

/// Shown when the addresses of the current chain come from a local fork
/// deploy (`deployments/<id>-fork.json`) instead of the real deployment.
export function ForkDeploymentStrip() {
  const chainId = useChainId();
  if (!isForkDeployment(chainId)) return null;
  return (
    <div className="border-b border-white/15 bg-white/[0.04]">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2 text-xs text-mute md:px-6">
        Addresses for chain {chainId} come from a local fork deploy (deployments/{chainId}-fork.json), not from a live
        deployment.
      </div>
    </div>
  );
}

/// Shown on X Layer Testnet under the header.
export function TestnetStrip() {
  const chainId = useChainId();
  if (chainId !== TESTNET_ID || !getDeployment(TESTNET_ID)) return null;
  return (
    <div className="border-b border-sand/30 bg-sand/[0.07]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs md:px-6">
        <span className="text-white">
          Testnet: USDG and the xStocks are faucet stand-ins, not real Backed tokens.
        </span>
        <span className="text-mute">
          Gas: get test OKB from the{" "}
          <a href={OKB_TESTNET_FAUCET} target="_blank" rel="noreferrer" className="text-mint underline underline-offset-2 hover:text-white">
            OKX X Layer faucet
          </a>
          .
        </span>
      </div>
    </div>
  );
}
