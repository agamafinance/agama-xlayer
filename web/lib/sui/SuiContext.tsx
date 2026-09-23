'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';

type Ctx = {
  address: string | null;
  connecting: boolean;
  connect: () => void;
  disconnect: () => void;
  /** Bumped after each successful tx to trigger data refetches. */
  refreshKey: number;
  refresh: () => void;
  /** True once the dapp-kit WalletProvider is mounted (client-only). Pages that
   *  use wallet-write hooks must wait for this before rendering. */
  ready: boolean;
};

// A safe default so pages can render during SSR / before the wallet provider
// mounts on the client (dapp-kit's WalletProvider is client-only — see SuiProviders).
const DEFAULT_CTX: Ctx = {
  address: null,
  connecting: false,
  connect: () => {},
  disconnect: () => {},
  refreshKey: 0,
  refresh: () => {},
  ready: false,
};

const SuiCtx = createContext<Ctx>(DEFAULT_CTX);

/** Wallet context mirroring useStellar's shape, backed by @mysten/dapp-kit.
 *  MUST live under SuiClientProvider + WalletProvider (see SuiProviders). */
export function SuiWalletProvider({ children }: { children: ReactNode }) {
  const account = useCurrentAccount();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const connect = useCallback(() => setOpen(true), []);
  const disconnect = useCallback(() => disconnectWallet(), [disconnectWallet]);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <SuiCtx.Provider
      value={{ address: account?.address ?? null, connecting: false, connect, disconnect, refreshKey, refresh, ready: true }}
    >
      {children}
      {/* Single controlled connect modal; connect() just opens it. */}
      <ConnectModal open={open} onOpenChange={setOpen} trigger={<span style={{ display: 'none' }} />} />
    </SuiCtx.Provider>
  );
}

export function useSui() {
  return useContext(SuiCtx);
}
