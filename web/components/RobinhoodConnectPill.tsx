'use client';

import AnimatedButton from './AnimatedButton';
import { useRobinhoodWallet } from '@/lib/robinhood/WalletProvider';

// Same look as the Stellar / Rayls / Arbitrum connect pills.
const pillProps = {
  variant: 'primary' as const,
  fillColor: 'rgba(20, 39, 31, 0.55)',
  borderColor: 'rgba(20, 39, 31, 0.55)',
  textRestColor: '#fff',
  textHoverColor: '#fff',
  className: 'h-10 px-[17px] text-[14px] font-medium whitespace-nowrap',
};

const shorten = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function RobinhoodConnectPill() {
  const { address, connect } = useRobinhoodWallet();

  if (address) {
    return (
      <AnimatedButton {...pillProps} onClick={connect}>
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
