'use client';

import AnimatedButton from './AnimatedButton';
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
  const { address, connect } = useXLayerWallet();

  return (
    <AnimatedButton {...pillProps} onClick={connect}>
      <span className="relative inline-block">
        <span className={address ? 'invisible whitespace-nowrap' : 'whitespace-nowrap'}>Connect Wallet</span>
        {address && (
          <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
            {shorten(address)}
          </span>
        )}
      </span>
    </AnimatedButton>
  );
}
