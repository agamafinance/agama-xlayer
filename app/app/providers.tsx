"use client";

import {RainbowKitProvider, darkTheme} from "@rainbow-me/rainbowkit";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState, type ReactNode} from "react";
import {WagmiProvider} from "wagmi";

import {DEFAULT_CHAIN} from "@/lib/chains";
import {wagmiConfig} from "@/lib/wagmi";

import "@rainbow-me/rainbowkit/styles.css";

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {queries: {refetchInterval: 12_000, refetchOnWindowFocus: true, retry: 1}},
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={DEFAULT_CHAIN}
          theme={darkTheme({
            accentColor: "#9fd9b8",
            accentColorForeground: "#1e3c2f",
            borderRadius: "medium",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
