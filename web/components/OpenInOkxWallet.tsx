'use client';

import { useEffect, useState } from 'react';

/// A phone browser has no wallet extension, so the way in from a phone is the
/// OKX Wallet in-app browser. This reopens the current page there, and sends
/// the user to the store if the app is missing. It is the path an OKX
/// withdrawal user is already on.
///
/// Link shape taken from the OKX wallet adapters:
///   https://www.okx.com/download?deeplink=<encoded okx://wallet/dapp/url?dappUrl=<encoded href>>
export function OpenInOkxWallet() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    // Inside the OKX in-app browser the provider is already injected.
    const w = window as unknown as { okxwallet?: unknown; ethereum?: unknown };
    if (!isPhone || w.okxwallet || w.ethereum) return;
    const deeplink = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(window.location.href)}`;
    setHref(`https://www.okx.com/download?deeplink=${encodeURIComponent(deeplink)}`);
  }, []);

  if (!href) return null;

  return (
    <div className="border-b border-[#254839]/20 bg-[#fdf8ed]">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 py-2.5 text-[12px] md:px-6">
        <span className="text-fg-muted">On a phone, open this inside OKX Wallet to connect and sign.</span>
        <a
          href={href}
          className="shrink-0 rounded-full bg-[#254839] px-3 py-1.5 font-medium text-[#fdf8ed] transition-colors hover:bg-[#1F3D31]"
        >
          Open in OKX Wallet
        </a>
      </div>
    </div>
  );
}
