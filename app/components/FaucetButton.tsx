"use client";

import {useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {useAccount, useChainId} from "wagmi";

import {FORK_ID} from "@/lib/chains";
import {withBase} from "@/lib/base-path";

type State = {kind: "idle"} | {kind: "busy"} | {kind: "ok"; text: string} | {kind: "err"; text: string};

/// Local fork only: credits 10,000 USDG, 10 of each wrapped xStock and
/// 10 OKB to the connected wallet through anvil cheat codes.
export function FaucetButton() {
  const chainId = useChainId();
  const {address} = useAccount();
  const qc = useQueryClient();
  const [state, setState] = useState<State>({kind: "idle"});

  if (chainId !== FORK_ID || !address) return null;

  const run = async () => {
    setState({kind: "busy"});
    try {
      const res = await fetch(withBase("/api/faucet"), {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({address}),
      });
      const body = (await res.json()) as {ok?: boolean; error?: string};
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setState({kind: "ok", text: "Credited"});
      await qc.invalidateQueries();
    } catch (e) {
      setState({kind: "err", text: e instanceof Error ? e.message : String(e)});
    }
    window.setTimeout(() => setState({kind: "idle"}), 5000);
  };

  const label =
    state.kind === "busy" ? "Crediting…" : state.kind === "ok" ? state.text : state.kind === "err" ? "Faucet failed" : "Fork faucet";

  return (
    <button
      type="button"
      onClick={run}
      disabled={state.kind === "busy"}
      title={
        state.kind === "err"
          ? state.text
          : "Credits 10,000 USDG, 10 wTSLAx, 10 wNVDAx, 10 wSPYx, 10 wAAPLx and 10 OKB on the local fork"
      }
      className={
        "inline-flex h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors disabled:opacity-60 " +
        (state.kind === "err"
          ? "border-coral text-coral"
          : state.kind === "ok"
            ? "border-mint bg-mint/15 text-mint"
            : "border-dashed border-mint/70 text-mint hover:bg-mint/10")
      }
    >
      {label}
    </button>
  );
}
