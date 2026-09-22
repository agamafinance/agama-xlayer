"use client";

import {ConnectButton} from "@rainbow-me/rainbowkit";
import clsx from "clsx";

const base =
  "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-4 text-base font-medium transition-colors";

export function ConnectPill() {
  return (
    <ConnectButton.Custom>
      {({account, chain, openAccountModal, openChainModal, openConnectModal, mounted}) => {
        if (!mounted) {
          return <span className={clsx(base, "pill-bar w-[138px] text-mute opacity-60")}>Connect wallet</span>;
        }
        if (!account || !chain) {
          return (
            <button type="button" onClick={openConnectModal} className={clsx(base, "bg-mint text-forest-deep hover:bg-white")}>
              Connect wallet
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={clsx(base, "bg-coral text-forest-night hover:bg-white")}>
              Wrong network
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={openAccountModal}
            className={clsx(base, "pill-bar border border-white/20 text-white hover:border-white/50")}
          >
            <span className="mr-2 h-2 w-2 rounded-full bg-mint" aria-hidden />
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
