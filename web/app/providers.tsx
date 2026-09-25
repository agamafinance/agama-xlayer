'use client';

import { ReactNode } from 'react';

import { NetworkProvider } from '@/lib/network/NetworkContext';
import { XLayerWalletProvider } from '@/lib/xlayer/WalletProvider';

/// One network, one provider.
///
/// The app this is forked from stacks a wallet provider per platform, and with
/// them wagmi, RainbowKit and the Stellar, Sui, Starknet and Solana SDKs. None
/// of that is reachable from a deployment that serves only /xlayer, and all of
/// it was in the bundle every page had to parse before it could ask the chain
/// anything. The X Layer pages talk to the wallet through a plain EIP-1193
/// hook, so this is the whole of it.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NetworkProvider>
      <XLayerWalletProvider>{children}</XLayerWalletProvider>
    </NetworkProvider>
  );
}
