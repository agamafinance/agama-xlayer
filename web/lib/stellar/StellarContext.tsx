'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { connectWallet, signWithKit, disconnectKit } from './wallet';
import { StellarWalletModal } from '@/components/StellarWalletModal';

type Ctx = {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Sign a transaction XDR with the connected wallet. */
  signXDR: (xdr: string, networkPassphrase: string) => Promise<string>;
  /** Bumped after each successful tx to trigger data refetches. */
  refreshKey: number;
  refresh: () => void;
};

const StellarContext = createContext<Ctx | null>(null);

const WALLET_KEY = 'stellar_wallet_id';
const ADDRESS_KEY = 'stellar_wallet_address';

export function StellarProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showModal, setShowModal] = useState(false);

  // Silently restore a previous session on load.
  useEffect(() => {
    const savedId = localStorage.getItem(WALLET_KEY);
    if (!savedId) return;
    connectWallet(savedId)
      .then((a) => {
        setAddress(a);
        localStorage.setItem(ADDRESS_KEY, a);
      })
      .catch(() => {
        localStorage.removeItem(WALLET_KEY);
        localStorage.removeItem(ADDRESS_KEY);
      });
  }, []);

  // Opening the connect UI just shows the picker modal.
  const connect = useCallback(async () => {
    setShowModal(true);
  }, []);

  const handleWalletSelect = useCallback(async (walletId: string) => {
    setShowModal(false);
    setConnecting(true);
    setError(null);
    try {
      const a = await connectWallet(walletId);
      setAddress(a);
      localStorage.setItem(WALLET_KEY, walletId);
      localStorage.setItem(ADDRESS_KEY, a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(ADDRESS_KEY);
    disconnectKit().catch(() => {});
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const signXDR = useCallback(
    async (xdr: string, networkPassphrase: string) => {
      if (!address) throw new Error('Wallet not connected');
      return signWithKit(xdr, networkPassphrase, address);
    },
    [address],
  );

  return (
    <StellarContext.Provider
      value={{ address, connecting, error, connect, disconnect, signXDR, refreshKey, refresh }}
    >
      {children}
      {showModal && (
        <StellarWalletModal
          onSelect={handleWalletSelect}
          onClose={() => setShowModal(false)}
        />
      )}
    </StellarContext.Provider>
  );
}

export function useStellar() {
  const ctx = useContext(StellarContext);
  if (!ctx) throw new Error('useStellar must be used within StellarProvider');
  return ctx;
}
