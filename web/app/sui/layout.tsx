'use client';

import { ReactNode } from 'react';
import { useSui } from '@/lib/sui/SuiContext';
import { ConfidentialProvider } from '@/lib/sui/ConfidentialContext';

/** Gate the Sui pages behind the client-only dapp-kit WalletProvider. Pages here
 *  use wallet-write hooks (useSignAndExecuteTransaction) that require it, so we
 *  render them only once `ready` — never during SSR. */
export default function SuiLayout({ children }: { children: ReactNode }) {
  const { ready } = useSui();

  if (!ready) {
    return (
      <section className="px-6 md:px-24 pt-16 pb-24">
        <div className="max-w-[1400px] mx-auto flex items-center gap-3 text-[14px] text-fg-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#254839]/30 border-t-[#254839]" />
          Loading Sui…
        </div>
      </section>
    );
  }

  return <ConfidentialProvider>{children}</ConfidentialProvider>;
}
