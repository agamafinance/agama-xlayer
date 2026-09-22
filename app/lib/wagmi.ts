import {connectorsForWallets} from "@rainbow-me/rainbowkit";
import {injectedWallet, metaMaskWallet, okxWallet} from "@rainbow-me/rainbowkit/wallets";
import {http} from "viem";
import {createConfig} from "wagmi";

import {CHAINS, FORK_ID, TESTNET_ID, XLAYER_ID} from "./chains";

// OKX Wallet first (X Layer is OKX's chain), then generic injected and
// MetaMask. Installed extensions connect through their injected provider;
// the WalletConnect fallback only works with a real project id.
const connectors = connectorsForWallets(
  [
    {
      groupName: "X Layer",
      wallets: [okxWallet, injectedWallet, metaMaskWallet],
    },
  ],
  {
    appName: "Agama x Arrow on X Layer",
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "agama-xlayer-demo",
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: CHAINS,
  transports: {
    [XLAYER_ID]: http(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech", {batch: false}),
    [TESTNET_ID]: http(process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC || "https://testrpc.xlayer.tech/terigon", {batch: false}),
    [FORK_ID]: http(process.env.NEXT_PUBLIC_FORK_RPC || "http://127.0.0.1:8545"),
  },
  // Coalesce concurrent reads into Multicall3 calls (the public X Layer RPC
  // is rate limited to a few requests per second).
  batch: {multicall: {wait: 16}},
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
