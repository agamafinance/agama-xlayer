'use client';

import { useEffect } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { KNOWN_WALLETS } from '@/lib/magicblock/wallet';
import { useSolanaWallet } from '@/lib/magicblock/WalletProvider';

// A wallet picker, because auto-selecting the first injected provider is wrong
// twice over: it picks for someone who has several, and it fails invisibly for
// someone who has none.
export default function WalletModal() {
  const { pickerOpen, setPickerOpen, detected, connectTo, connecting, error } = useSolanaWallet();

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen, setPickerOpen]);

  if (!pickerOpen) return null;

  const installed = new Set(detected.map((d) => d.key));
  // Anything we know about and did not find. The catch-all injected entry is not
  // something you can install, so it never belongs in this list.
  const missing = KNOWN_WALLETS.filter((w) => w.key !== 'solana' && !installed.has(w.key));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-[#14271f]/50 backdrop-blur-[2px]"
        onClick={() => setPickerOpen(false)}
      />

      <div className="relative w-full max-w-[380px] rounded-3xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.08),0_24px_60px_rgba(20,50,35,0.28)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-fg">Connect a wallet</h2>
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-[#254839]/[0.08] hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-fg-muted">Solana devnet</p>

        {detected.length > 0 ? (
          <div className="mt-5 space-y-2">
            {detected.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => connectTo(w)}
                disabled={connecting}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#254839]/12 bg-white/60 px-4 py-3 text-left transition-colors hover:bg-white disabled:opacity-50"
              >
                <WalletIcon icon={w.icon} label={w.label} />
                <span className="text-[15px] font-medium text-fg">{w.label}</span>
                <span className="ml-auto text-[12px] text-fg-muted">
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Detected'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#254839]/[0.06] px-4 py-3 text-[13px] text-fg-muted">
            No Solana wallet found in this browser. Install one below, then reload the page.
          </p>
        )}

        {missing.length > 0 && (
          <>
            <div className="mt-5 text-[11px] uppercase tracking-wider text-fg-muted">
              {detected.length > 0 ? 'Or install' : 'Get one'}
            </div>
            <div className="mt-2 space-y-2">
              {missing.map((w) => (
                <a
                  key={w.key}
                  href={w.install}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-[#254839]/[0.06]"
                >
                  <WalletIcon icon={w.icon} label={w.label} muted />
                  <span className="text-[15px] text-fg-muted">{w.label}</span>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-fg-muted" />
                </a>
              ))}
            </div>
          </>
        )}

        {error && <p className="mt-4 text-[13px] text-fg">{error}</p>}
      </div>
    </div>
  );
}

function WalletIcon({ icon, label, muted }: { icon?: string; label: string; muted?: boolean }) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className={`h-8 w-8 shrink-0 rounded-full ${muted ? 'opacity-50' : ''}`}
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#254839]/[0.08] text-[13px] font-semibold text-fg">
      {label.slice(0, 1)}
    </span>
  );
}
