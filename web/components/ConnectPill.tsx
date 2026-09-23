'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import AnimatedButton from './AnimatedButton';

/// A skinned wallet-connect button that matches the existing "Connect Wallet"
/// pill in the Navbar. Wraps RainbowKit's ConnectButton.Custom so we keep
/// the brand visual language (dark green pill, AnimatedButton hover) and
/// avoid the default RainbowKit chrome.
export function ConnectPill() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <AnimatedButton
              variant="primary"
              fillColor="rgba(20, 39, 31, 0.55)"
              borderColor="rgba(20, 39, 31, 0.55)"
              textRestColor="#fff"
              textHoverColor="#fff"
              className="h-10 px-[17px] text-[14px] font-medium whitespace-nowrap opacity-60"
            >
              Loading…
            </AnimatedButton>
          );
        }

        if (!connected) {
          return (
            <AnimatedButton
              variant="primary"
              fillColor="rgba(20, 39, 31, 0.55)"
              borderColor="rgba(20, 39, 31, 0.55)"
              textRestColor="#fff"
              textHoverColor="#fff"
              className="h-10 px-[17px] text-[14px] font-medium whitespace-nowrap"
              onClick={openConnectModal}
            >
              Connect Wallet
            </AnimatedButton>
          );
        }

        if (chain.unsupported) {
          return (
            <AnimatedButton
              variant="primary"
              fillColor="rgba(150, 35, 35, 0.85)"
              borderColor="rgba(150, 35, 35, 0.85)"
              textRestColor="#fff"
              textHoverColor="#fff"
              className="h-10 px-[17px] text-[14px] font-medium whitespace-nowrap"
              onClick={openChainModal}
            >
              Wrong network
            </AnimatedButton>
          );
        }

        // Keep the short 4+4 truncation (RainbowKit's displayName) but pin
        // the pill width to "Connect Wallet" via an invisible ghost span —
        // the address sits centred in the same footprint so connecting
        // never resizes the pill.
        return (
          <AnimatedButton
            variant="primary"
            fillColor="rgba(20, 39, 31, 0.55)"
            borderColor="rgba(20, 39, 31, 0.55)"
            textRestColor="#fff"
            textHoverColor="#fff"
            className="h-10 px-[17px] text-[14px] font-medium whitespace-nowrap"
            onClick={openAccountModal}
          >
            <span className="relative inline-block">
              <span className="invisible whitespace-nowrap">Connect Wallet</span>
              <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
                {account.displayName}
              </span>
            </span>
          </AnimatedButton>
        );
      }}
    </ConnectButton.Custom>
  );
}
