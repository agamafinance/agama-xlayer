'use client';

import { useEffect } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { registerEnokiWallets } from '@mysten/enoki';
import { ENOKI_API_KEY, GOOGLE_CLIENT_ID } from './enoki-config';

/** Adds "Sign in with Google" (zkLogin via Enoki) to the dapp-kit connect modal.
 *  Must render under SuiClientProvider (uses useSuiClient); registered wallets are
 *  picked up by the sibling WalletProvider. */
export function EnokiRegistration() {
  const client = useSuiClient();
  useEffect(() => {
    if (!ENOKI_API_KEY || !GOOGLE_CLIENT_ID) return;
    const { unregister } = registerEnokiWallets({
      apiKey: ENOKI_API_KEY,
      providers: { google: { clientId: GOOGLE_CLIENT_ID, redirectUrl: window.location.origin } },
      client: client as any,
      network: 'testnet',
    });
    return unregister;
  }, [client]);
  return null;
}
