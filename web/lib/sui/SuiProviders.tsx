'use client';

import { ReactNode, useEffect, useState } from 'react';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { SuiWalletProvider } from './SuiContext';
import { EnokiRegistration } from './EnokiRegistration';
import '@mysten/dapp-kit/dist/index.css';

const networks = {
  testnet: { url: 'https://sui-testnet-rpc.publicnode.com' },
};

/** Sui chain providers — dapp-kit client + wallet + our wallet context.
 *  Shares the parent QueryClientProvider (already in app/providers.tsx).
 *  WalletProvider (Slush/dapp-kit) touches indexedDB, so it is mounted
 *  client-only; SuiClientProvider (RPC) is SSR-safe and always present. */
export function SuiProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SuiClientProvider networks={networks} defaultNetwork="testnet">
      {mounted ? (
        <>
          <EnokiRegistration />
          <WalletProvider autoConnect>
            <SuiWalletProvider>{children}</SuiWalletProvider>
          </WalletProvider>
        </>
      ) : (
        children
      )}
    </SuiClientProvider>
  );
}
