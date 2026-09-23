'use client';

import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';

import { wagmiConfig } from '@/lib/wagmi';
import { raylsTestnet } from '@/lib/chain';
import { NetworkGuard } from '@/components/NetworkGuard';
import { NetworkProvider } from '@/lib/network/NetworkContext';
import { StellarProvider } from '@/lib/stellar/StellarContext';
import { ArbWalletProvider } from '@/lib/arbitrum/WalletProvider';
import { SuiProviders } from '@/lib/sui/SuiProviders';
import { RobinhoodWalletProvider } from '@/lib/robinhood/WalletProvider';
import { StarknetWalletProvider } from '@/lib/starknet/WalletProvider';
import { SolanaWalletProvider } from '@/lib/magicblock/WalletProvider';
import WalletModal from '@/components/magicblock/WalletModal';

import '@rainbow-me/rainbowkit/styles.css';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NetworkProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <StellarProvider>
           <ArbWalletProvider>
            <SuiProviders>
             <StarknetWalletProvider>
             <SolanaWalletProvider>
             <RobinhoodWalletProvider>
             <RainbowKitProvider
              theme={lightTheme({
                accentColor: '#254839',
                accentColorForeground: '#fdf8ed',
                borderRadius: 'medium',
                fontStack: 'system',
                overlayBlur: 'small',
              })}
              initialChain={raylsTestnet}
             >
              <NetworkGuard />
              <WalletModal />
              {children}
             </RainbowKitProvider>
             </RobinhoodWalletProvider>
             </SolanaWalletProvider>
             </StarknetWalletProvider>
            </SuiProviders>
           </ArbWalletProvider>
          </StellarProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </NetworkProvider>
  );
}
