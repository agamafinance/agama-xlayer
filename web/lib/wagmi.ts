import {connectorsForWallets} from "@rainbow-me/rainbowkit";
import {injectedWallet, metaMaskWallet, rabbyWallet} from "@rainbow-me/rainbowkit/wallets";
import {createClient, http} from "viem";
import {createConfig} from "wagmi";

import {raylsTestnet} from "./chain";

// We deliberately do NOT include WalletConnect / Rainbow connectors:
// their SDKs touch `indexedDB` during SSR which throws inside Next.js
// Turbopack and stalls the wagmi state init — every read returns
// `undefined` and write txs never resolve their receipt poll. For the
// demo we only ship browser-injected connectors (MetaMask, Rabby,
// generic injected) which work without that side effect.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, rabbyWallet, injectedWallet],
    },
  ],
  {
    appName: "Agama Test Front",
    projectId: "agama-demo", // unused without WalletConnect
  },
);

// Two infrastructure gotchas on Rayls testnet, both worked around here:
//
// 1. The Rayls RPC at https://testnet-rpc.rayls.com/ does not send
//    permissive CORS headers, so direct browser fetches from the dev
//    server (localhost:3000) are blocked. Reads return undefined and
//    `waitForTransactionReceipt` hangs forever (the tx is broadcast by
//    MetaMask, which bypasses CORS, but the front cannot poll for
//    its receipt). Fix: route every JSON-RPC call through a same-origin
//    Next.js API route at `/api/rpc` that server-side proxies to the
//    upstream RPC. See `src/app/api/rpc/route.ts`.
//
// 2. Multicall3 is not deployed at the canonical address on Rayls.
//    viem's `multicall` action would throw `ChainDoesNotSupportContract`
//    and wagmi's fallback to individual reads is fragile in React.
//    Fix: enable viem's deployless multicall — every multicall sends
//    the Multicall3 bytecode inline as part of the eth_call.
const RPC_URL =
  typeof window === "undefined"
    ? raylsTestnet.rpcUrls.default.http[0]
    : `${window.location.origin}/api/rpc`;

export const wagmiConfig = createConfig({
  connectors,
  chains: [raylsTestnet],
  client({chain}) {
    return createClient({
      chain,
      transport: http(RPC_URL),
      batch: {
        multicall: {
          deployless: true,
        },
      },
    });
  },
  ssr: true,
});
