'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useSui } from './SuiContext';

// Shares the decrypted confidential balances across the Sui pages. The header
// and portfolio show a masked "****" while a balance is null (viewing key not
// derived), then the decrypted amount. Balances are persisted per wallet so
// they survive navigation between pages and reloads once derived.
type Ctx = {
  cag: string | null; // decrypted cagUSD balance ("" -> null means masked)
  csag: string | null; // decrypted csagUSD balance
  setCag: (s: string | null) => void;
  setCsag: (s: string | null) => void;
  deriveNonce: number; // bumped when a masked value is clicked to request derivation
  requestDerive: () => void;
};

const DEFAULT: Ctx = {
  cag: null, csag: null, setCag: () => {}, setCsag: () => {}, deriveNonce: 0, requestDerive: () => {},
};

const C = createContext<Ctx>(DEFAULT);

export function ConfidentialProvider({ children }: { children: ReactNode }) {
  const { address } = useSui();
  const [cag, setCagState] = useState<string | null>(null);
  const [csag, setCsagState] = useState<string | null>(null);
  const [deriveNonce, setDeriveNonce] = useState(0);

  // Hydrate persisted decrypted balances when the wallet changes.
  useEffect(() => {
    if (!address) { setCagState(null); setCsagState(null); return; }
    setCagState(localStorage.getItem(`agama-cag-${address}`));
    setCsagState(localStorage.getItem(`agama-csag-${address}`));
  }, [address]);

  const setCag = useCallback((s: string | null) => {
    setCagState(s);
    if (!address) return;
    if (s === null) localStorage.removeItem(`agama-cag-${address}`);
    else localStorage.setItem(`agama-cag-${address}`, s);
  }, [address]);

  const setCsag = useCallback((s: string | null) => {
    setCsagState(s);
    if (!address) return;
    if (s === null) localStorage.removeItem(`agama-csag-${address}`);
    else localStorage.setItem(`agama-csag-${address}`, s);
  }, [address]);

  const requestDerive = useCallback(() => setDeriveNonce((n) => n + 1), []);

  return (
    <C.Provider value={{ cag, csag, setCag, setCsag, deriveNonce, requestDerive }}>
      {children}
    </C.Provider>
  );
}

export function useConfidential() {
  return useContext(C);
}
