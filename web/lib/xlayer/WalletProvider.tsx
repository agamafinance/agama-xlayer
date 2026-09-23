'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useWallet } from './useXLayer';

const Ctx = createContext<ReturnType<typeof useWallet>>({ address: undefined, connect: async () => {} });

export function XLayerWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return <Ctx.Provider value={wallet}>{children}</Ctx.Provider>;
}

export function useXLayerWallet() {
  return useContext(Ctx);
}
