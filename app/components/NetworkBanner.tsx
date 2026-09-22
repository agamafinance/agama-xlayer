"use client";

import {useAccount, useSwitchChain} from "wagmi";

import {CHAINS, chainName} from "@/lib/chains";
import {getDeployment} from "@/lib/deployment";

/// Shown when the wallet sits on a chain the app does not support.
export function NetworkBanner() {
  const {isConnected, chainId} = useAccount();
  const {switchChain, isPending, error} = useSwitchChain();

  if (!isConnected || chainId === undefined) return null;
  if (CHAINS.some((c) => c.id === chainId)) return null;

  return (
    <div className="border-b border-coral/40 bg-coral/10">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-3 px-4 py-2.5 text-sm md:px-6">
        <span className="text-white">
          Your wallet is on {chainName(chainId)}. This app runs on X Layer.
        </span>
        <div className="flex gap-2">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={isPending}
              onClick={() => switchChain({chainId: c.id})}
              className="rounded-full border border-white/60 px-3 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
            >
              Switch to {c.name}
              {!getDeployment(c.id) && <span className="ml-1 text-dim">(not deployed yet)</span>}
            </button>
          ))}
        </div>
        {error && <span className="text-xs text-coral">{error.message.split("\n")[0]}</span>}
      </div>
    </div>
  );
}
