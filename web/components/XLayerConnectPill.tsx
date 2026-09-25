'use client';

import { useEffect, useRef, useState } from 'react';

import AnimatedButton from './AnimatedButton';
import { availableWallets, WALLETS, type FoundWallet } from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

// Same pill as the other networks: dark-green AnimatedButton, address shortened
// and centred inside a "Connect Wallet" footprint so the navbar never reflows.
const pillProps = {
  variant: 'primary' as const,
  fillColor: 'rgba(20, 39, 31, 0.55)',
  borderColor: 'rgba(20, 39, 31, 0.55)',
  textRestColor: '#fff',
  textHoverColor: '#fff',
  className: 'h-10 px-[17px] text-[14px] font-medium whitespace-nowrap',
};

const shorten = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function XLayerConnectPill() {
  const { address, connect, disconnect } = useXLayerWallet();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<FoundWallet[]>([]);
  const box = useRef<HTMLDivElement>(null);

  // Wallets announce themselves a tick after the page loads, so the list is
  // read when the menu opens rather than on mount.
  useEffect(() => {
    if (!open) return;
    setFound(availableWallets());
    const onAway = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onAway);
    return () => document.removeEventListener('mousedown', onAway);
  }, [open]);

  if (address) {
    return (
      <AnimatedButton {...pillProps} onClick={disconnect}>
        <span className="relative inline-block">
          <span className="invisible whitespace-nowrap">Connect Wallet</span>
          <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
            {shorten(address)}
          </span>
        </span>
      </AnimatedButton>
    );
  }

  const pick = async (id: string) => {
    setOpen(false);
    await connect(id);
  };

  return (
    <div className="relative" ref={box}>
      <AnimatedButton {...pillProps} onClick={() => setOpen((v) => !v)}>
        Connect Wallet
      </AnimatedButton>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[232px] overflow-hidden rounded-2xl bg-[#fdfaf1] p-1.5 shadow-[0_1px_3px_rgba(20,50,35,0.10),0_16px_40px_rgba(20,50,35,0.22)]">
          {found.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => pick(w.id)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-fg hover:bg-[#254839]/[0.07]"
            >
              <WalletMark wallet={w} />
              {w.name}
            </button>
          ))}

          {/* Nothing installed, or only some of them: the way out is the
              download page, not a dead button. */}
          {WALLETS.filter((k) => !found.some((f) => f.id === k.id)).map((k) => (
            <a
              key={k.id}
              href={k.download}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-fg-muted hover:bg-[#254839]/[0.07]"
            >
              <span className="h-6 w-6 shrink-0 rounded-full bg-[#254839]/[0.10]" />
              {k.name}
              <span className="ml-auto text-[12px]">Install</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/// The icon the wallet announced over EIP-6963, so there is no wallet artwork
/// of ours to keep up to date. A wallet found the legacy way announced none.
function WalletMark({ wallet }: { wallet: FoundWallet }) {
  if (!wallet.icon) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#254839] text-[11px] font-semibold text-[#fdf8ed]">
        {wallet.name[0]}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={wallet.icon} alt="" className="h-6 w-6 shrink-0 rounded-full" />;
}
