'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { detectWalletsWithRetry, connectWalletObject } from './wallet';

type StarknetWallet = {
  address: string | undefined;
  wallet: any;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshKey: number;
  refresh: () => void;
};

const Ctx = createContext<StarknetWallet>({
  address: undefined,
  wallet: null,
  connecting: false,
  error: '',
  connect: async () => {},
  disconnect: () => {},
  refreshKey: 0,
  refresh: () => {},
});

// Preference order when several wallets are injected.
const PREFERRED = ['ready', 'argentX', 'braavos'];

export function StarknetWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<any>(null);
  const [address, setAddress] = useState<string>('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const connect = useCallback(async () => {
    setError('');
    setConnecting(true);
    try {
      const found = await detectWalletsWithRetry();
      if (found.length === 0) {
        setError('No Starknet wallet detected. Install Ready or Braavos, then reload.');
        return;
      }
      const swo =
        PREFERRED.map((id) => found.find((w: any) => String(w.id).toLowerCase() === id)).find(Boolean) ||
        found[0];
      const { address: addr } = await connectWalletObject(swo);
      if (!addr) {
        setError('Connection cancelled or no account exposed.');
        return;
      }
      setWallet(swo);
      setAddress(addr);
    } catch (e: any) {
      setError('Connect failed: ' + (e?.message || String(e)));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAddress('');
  }, []);

  return (
    <Ctx.Provider
      value={{ address: address || undefined, wallet, connecting, error, connect, disconnect, refreshKey, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStarknetWallet() {
  return useContext(Ctx);
}
