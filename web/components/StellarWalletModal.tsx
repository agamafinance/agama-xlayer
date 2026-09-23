'use client';

import { useEffect, useState } from 'react';
import { getSupportedWallets, type WalletEntry } from '@/lib/stellar/wallet';

interface Props {
  onSelect: (walletId: string) => void;
  onClose: () => void;
}

export function StellarWalletModal({ onSelect, onClose }: Props) {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSupportedWallets()
      .then(setWallets)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Split into available and unavailable so users see what they have installed first
  const available = wallets.filter((w) => w.isAvailable);
  const unavailable = wallets.filter((w) => !w.isAvailable);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0e1a15] border border-[#254839]/40 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[#fdf8ed] text-lg font-semibold">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="text-[#fdf8ed]/50 hover:text-[#fdf8ed] transition-colors text-xl leading-none w-7 h-7 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[#fdf8ed]/40 text-sm">Detecting wallets…</div>
        ) : (
          <div className="flex flex-col gap-1">
            {available.length > 0 && (
              <>
                {available.map((w) => (
                  <WalletRow key={w.id} wallet={w} onSelect={onSelect} />
                ))}
              </>
            )}

            {unavailable.length > 0 && (
              <>
                {available.length > 0 && (
                  <p className="mt-3 mb-1 px-1 text-[11px] font-medium uppercase tracking-widest text-[#fdf8ed]/30">
                    Not installed
                  </p>
                )}
                {unavailable.map((w) => (
                  <WalletRow key={w.id} wallet={w} onSelect={onSelect} unavailable />
                ))}
              </>
            )}

            {wallets.length === 0 && (
              <div className="py-6 text-center text-[#fdf8ed]/40 text-sm">
                No Stellar wallets detected.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletRow({
  wallet,
  onSelect,
  unavailable = false,
}: {
  wallet: WalletEntry;
  onSelect: (id: string) => void;
  unavailable?: boolean;
}) {
  return (
    <button
      onClick={() => !unavailable && onSelect(wallet.id)}
      disabled={unavailable}
      className={[
        'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
        'border border-transparent',
        unavailable
          ? 'opacity-40 cursor-not-allowed'
          : 'text-[#fdf8ed] hover:bg-[#254839]/60 hover:border-[#254839]/60',
      ].join(' ')}
    >
      {wallet.icon ? (
        <img
          src={wallet.icon}
          alt={wallet.name}
          className="h-8 w-8 flex-none rounded-lg object-contain"
        />
      ) : (
        <div className="h-8 w-8 flex-none rounded-lg bg-[#254839]/40 flex items-center justify-center text-xs text-[#fdf8ed]/40">
          ?
        </div>
      )}
      <span className="text-sm font-medium text-[#fdf8ed]">{wallet.name}</span>
      {unavailable && (
        <span className="ml-auto text-[10px] text-[#fdf8ed]/30">Install</span>
      )}
    </button>
  );
}
