'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useWallet } from './useArbitrum';

const Ctx = createContext<ReturnType<typeof useWallet>>({ address: undefined, connect: async () => {} });

export function ArbWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return <Ctx.Provider value={wallet}>{children}</Ctx.Provider>;
}

export function useArbWallet() {
  return useContext(Ctx);
}
