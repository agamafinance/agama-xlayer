"use client";

import {useEffect, useState} from "react";

/// A phone browser has no wallet extension, and our WalletConnect fallback has
/// no project id, so the only way in from a phone is the OKX Wallet in-app
/// browser. This reopens the current page there (and sends the user to the
/// store if the app is missing), which is the path an OKX withdrawal user is
/// already on anyway.
///
/// Link shape taken from the OKX wallet adapters:
///   https://www.okx.com/download?deeplink=<encoded okx://wallet/dapp/url?dappUrl=<encoded href>>
export function OpenInOkxWallet() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isPhone = /Android|iPhone|iPad|iPod/i.test(ua);
    // Inside the OKX in-app browser the provider is already injected: nothing to do.
    const hasWallet = typeof (window as {ethereum?: unknown}).ethereum !== "undefined";
    if (!isPhone || hasWallet) return;
    const deeplink = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(window.location.href)}`;
    setHref(`https://www.okx.com/download?deeplink=${encodeURIComponent(deeplink)}`);
  }, []);

  if (!href) return null;

  return (
    <div className="border-b border-mint/20 bg-mint/10">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 py-2.5 text-xs md:px-6">
        <span className="text-mute">
          On a phone, open this inside OKX Wallet to connect and sign.
        </span>
        <a
          href={href}
          className="shrink-0 rounded-full bg-mint px-3 py-1.5 font-medium text-forest-deep transition-colors hover:bg-white"
        >
          Open in OKX Wallet
        </a>
      </div>
    </div>
  );
}
