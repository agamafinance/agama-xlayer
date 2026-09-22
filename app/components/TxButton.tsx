"use client";

import clsx from "clsx";
import type {ReactNode} from "react";

import {txUrl} from "@/lib/chains";
import type {Tx} from "@/lib/tx";

/// Button bound to a `useTx` slot. Shows simulate / sign / mining states,
/// the tx hash (explorer link on X Layer mainnet) and a decoded revert reason.
export function TxButton({
  tx,
  label,
  onClick,
  disabled,
  variant = "primary",
  hint,
  className,
}: {
  tx: Tx;
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  hint?: ReactNode;
  className?: string;
}) {
  const url = tx.hash ? txUrl(tx.chainId, tx.hash) : undefined;

  let content: ReactNode = label;
  if (tx.status === "simulating") content = <Busy text="Checking…" />;
  else if (tx.status === "signing") content = <Busy text="Confirm in wallet…" />;
  else if (tx.status === "mining") content = <Busy text="Waiting for block…" />;
  else if (tx.status === "success") content = "Done";

  const tone = (() => {
    if (tx.status === "success") return "bg-mint/20 text-mint border-mint";
    if (variant === "primary") return "bg-mint text-forest-deep border-mint hover:bg-white hover:border-white";
    if (variant === "danger") return "bg-transparent text-coral border-coral/80 hover:bg-coral/10";
    return "bg-transparent text-white border-white/70 hover:bg-white/[0.08]";
  })();

  return (
    <div className={clsx("flex min-w-0 flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || tx.busy}
        className={clsx(
          "h-11 w-full rounded-box border-1.5 px-4 text-base font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/[0.04] disabled:text-dim",
          tone,
        )}
      >
        {content}
      </button>
      {tx.status === "error" && tx.error ? (
        <p className="text-xs text-coral" role="alert">
          {tx.error}
        </p>
      ) : tx.hash && tx.status !== "idle" ? (
        <p className="truncate text-2xs text-dim">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="underline decoration-dim/60 underline-offset-2 hover:text-white">
              {tx.hash.slice(0, 10)}{"…"}{tx.hash.slice(-6)} on OKX Explorer
            </a>
          ) : (
            <span>tx {tx.hash.slice(0, 10)}{"…"}{tx.hash.slice(-6)}</span>
          )}
        </p>
      ) : hint ? (
        <p className="text-2xs text-dim">{hint}</p>
      ) : null}
    </div>
  );
}

function Busy({text}: {text: string}) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      {text}
    </span>
  );
}
