'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useWallet } from './useRobinhood';

const Ctx = createContext<ReturnType<typeof useWallet>>({ address: undefined, connect: async () => {} });

export function RobinhoodWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return <Ctx.Provider value={wallet}>{children}</Ctx.Provider>;
}

export function useRobinhoodWallet() {
  return useContext(Ctx);
}
