'use client';

import AnimatedButton from './AnimatedButton';
import { OKX_DOWNLOAD, useOkxWallet } from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

// Same pill as the other networks: dark-green AnimatedButton, address shortened
// and centred inside a "Connect Wallet" footprint so the navbar never reflows.
const pillProps = {
  variant: 'primary' as const,
  fillColor: 'rgba(20, 39, 31, 0.55)',
  borderColor: 'rgba(20, 39, 31, 0.55)',
  textRestColor: '#fff',
  textHoverColor: '#fff',
  className: 'h-10 px-[17px] text-[14px] font-medium whitespace-nowrap',
};

const shorten = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function XLayerConnectPill() {
  const { address, connect, disconnect } = useXLayerWallet();
  const hasOkx = useOkxWallet();

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

  // One wallet is offered here and it is OKX: this is an OKX chain, and the
  // deposit path starts with a withdrawal from the OKX app. Without it the
  // button installs it rather than quietly connecting something else.
  if (!hasOkx) {
    return (
      <AnimatedButton {...pillProps} as="a" href={OKX_DOWNLOAD} target="_blank" rel="noreferrer">
        Get OKX Wallet
      </AnimatedButton>
    );
  }

  return (
    <AnimatedButton {...pillProps} onClick={connect}>
      Connect OKX Wallet
    </AnimatedButton>
  );
}
