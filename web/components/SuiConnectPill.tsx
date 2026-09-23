'use client';

import AnimatedButton from './AnimatedButton';
import { useSui } from '@/lib/sui/SuiContext';

const pillProps = {
  variant: 'primary' as const,
  fillColor: 'rgba(20, 39, 31, 0.55)',
  borderColor: 'rgba(20, 39, 31, 0.55)',
  textRestColor: '#fff',
  textHoverColor: '#fff',
  className: 'h-10 px-[17px] text-[14px] font-medium whitespace-nowrap',
};

function shorten(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/// Sui wallet connect button (Slush / dapp-kit) — mirrors ConnectPill's look.
export function SuiConnectPill() {
  const { address, connect, disconnect } = useSui();

  if (address) {
    return (
      <AnimatedButton {...pillProps} onClick={disconnect}>
        <span className="relative inline-block">
          <span className="invisible whitespace-nowrap">Connect Wallet</span>
          <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
            {shorten(address)}
          </span>
        </span>
      </AnimatedButton>
    );
  }

  return (
    <AnimatedButton {...pillProps} onClick={connect}>
      Connect Wallet
    </AnimatedButton>
  );
}
