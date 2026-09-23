'use client';

import { PublicKey } from '@solana/web3.js';
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import {
  connectProvider,
  detectWallets,
  detectWalletsWithRetry,
  type DetectedWallet,
  type SolanaProvider,
} from './wallet';

type Ctx = {
  address: PublicKey | undefined;
  provider: SolanaProvider | null;
  label: string;
  connecting: boolean;
  error: string;
  /// Opens the picker. The pill calls this; the modal calls connectTo.
  connect: () => Promise<void>;
  connectTo: (w: DetectedWallet) => Promise<void>;
  detected: DetectedWallet[];
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  disconnect: () => void;
  refreshKey: number;
  refresh: () => void;
};

const C = createContext<Ctx>({
  address: undefined,
  provider: null,
  label: '',
  connecting: false,
  error: '',
  connect: async () => {},
  connectTo: async () => {},
  detected: [],
  pickerOpen: false,
  setPickerOpen: () => {},
  disconnect: () => {},
  refreshKey: 0,
  refresh: () => {},
});

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<SolanaProvider | null>(null);
  const [address, setAddress] = useState<PublicKey>();
  const [label, setLabel] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [detected, setDetected] = useState<DetectedWallet[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const connectTo = useCallback(async (w: DetectedWallet) => {
    setError('');
    setConnecting(true);
    try {
      const key = await connectProvider(w.provider);
      if (!key) {
        setError('Connection cancelled, or the wallet exposed no account.');
        return;
      }
      setProvider(w.provider);
      setLabel(w.label);
      setAddress(key);
      setPickerOpen(false);
    } catch (e: any) {
      setError(`${w.label} refused the connection: ` + (e?.message || String(e)));
    } finally {
      setConnecting(false);
    }
  }, []);

  /// Open the picker. Injection can lag page load, so detection retries before
  /// the list is shown rather than telling someone they have no wallet when they
  /// do.
  const connect = useCallback(async () => {
    setError('');
    setPickerOpen(true);
    setDetected(detectWallets());
    const found = await detectWalletsWithRetry();
    setDetected(found);
  }, []);

  const disconnect = useCallback(() => {
    try {
      provider?.disconnect?.();
    } catch {
      /* ignore */
    }
    setProvider(null);
    setAddress(undefined);
    setLabel('');
  }, [provider]);

  return (
    <C.Provider
      value={{
        address,
        provider,
        label,
        connecting,
        error,
        connect,
        connectTo,
        detected,
        pickerOpen,
        setPickerOpen,
        disconnect,
        refreshKey,
        refresh,
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useSolanaWallet() {
  return useContext(C);
}
