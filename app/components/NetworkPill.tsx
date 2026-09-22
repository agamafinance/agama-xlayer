"use client";

import clsx from "clsx";
import {useEffect, useRef, useState} from "react";
import {useAccount, useChainId, useSwitchChain} from "wagmi";

import {CHAINS} from "@/lib/chains";
import {getDeployment} from "@/lib/deployment";

/// Chain selector. Switches the wallet when connected, the read chain
/// otherwise (wagmi keeps a current chain even without a wallet).
export function NetworkPill() {
  const chainId = useChainId();
  const {isConnected} = useAccount();
  const {switchChain, isPending} = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = CHAINS.find((c) => c.id === chainId) ?? CHAINS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="pill-bar inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-3.5 text-sm text-white hover:border-white/40"
      >
        <XLayerMark />
        <span className="whitespace-nowrap">{isPending ? "Switching…" : current.name}</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-mute" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-12 z-50 w-60 rounded-box border-1.5 border-white/80 bg-card p-1.5 shadow-[0_12px_40px_rgba(10,25,18,0.45)]"
        >
          {CHAINS.map((c) => {
            const deployed = !!getDeployment(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === chainId}
                  onClick={() => {
                    switchChain({chainId: c.id});
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-sm",
                    c.id === chainId ? "bg-white/[0.1] text-white" : "text-mute hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <span>
                    {c.name}
                    <span className="ml-2 text-2xs text-dim">id {c.id}</span>
                  </span>
                  <span className={clsx("text-2xs", deployed ? "text-mint" : "text-dim")}>
                    {deployed ? "deployed" : "not deployed"}
                  </span>
                </button>
              </li>
            );
          })}
          {!isConnected && (
            <li className="px-3 pb-1 pt-2 text-2xs text-dim">Read-only until a wallet is connected.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function XLayerMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="4" fill="none" stroke="#9fd9b8" strokeWidth="1.5" />
      <path d="M5 5l6 6M11 5l-6 6" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
