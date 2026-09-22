import {defineChain} from "viem";

import {deployments} from "./generated/deployments";

export const XLAYER_ID = 196;
export const TESTNET_ID = 1952;
export const FORK_ID = 1961;

/// Chain 196 RPC. Point it at a local mainnet fork to exercise the zap.
export const MAINNET_RPC =
  process.env.NEXT_PUBLIC_MAINNET_RPC || process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech";

const multicall3 = {address: "0xcA11bde05977b3631167028862bE2a173976CA11"} as const;

export const xLayer = defineChain({
  id: XLAYER_ID,
  name: "X Layer",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {default: {http: [MAINNET_RPC]}},
  blockExplorers: {
    default: {name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer"},
  },
  contracts: {multicall3},
});

export const xLayerTestnet = defineChain({
  id: TESTNET_ID,
  name: "X Layer Testnet",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {default: {http: ["https://testrpc.xlayer.tech/terigon"]}},
  blockExplorers: {
    default: {name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer-test"},
  },
  contracts: {multicall3},
  testnet: true,
});

export const xLayerFork = defineChain({
  id: FORK_ID,
  name: "X Layer (fork)",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {default: {http: ["http://127.0.0.1:8545"]}},
  contracts: {multicall3},
  testnet: true,
});

const ALL = [xLayerTestnet, xLayerFork, xLayer] as const;
type AppChain = (typeof ALL)[number];
export type AppChainId = AppChain["id"];

export const FORK_DEPLOYED = !!deployments[FORK_ID];
export const TESTNET_DEPLOYED = !!deployments[TESTNET_ID];

/// Default: the public testnet demo when deployed, then the local fork, then mainnet.
export const DEFAULT_CHAIN: AppChain = TESTNET_DEPLOYED ? xLayerTestnet : FORK_DEPLOYED ? xLayerFork : xLayer;

/// Every supported chain, default first (wagmi falls back to the first one).
export const CHAINS = [DEFAULT_CHAIN, ...ALL.filter((c) => c.id !== DEFAULT_CHAIN.id)] as unknown as readonly [
  AppChain,
  ...AppChain[],
];

const EXPLORERS: Partial<Record<number, string>> = {
  [XLAYER_ID]: xLayer.blockExplorers.default.url,
  [TESTNET_ID]: xLayerTestnet.blockExplorers.default.url,
};

export function chainName(id: number | undefined): string {
  const c = ALL.find((x) => x.id === id);
  if (c) return c.name;
  return id ? `chain ${id}` : "unknown chain";
}

export function txUrl(chainId: number | undefined, hash: string): string | undefined {
  const base = chainId !== undefined ? EXPLORERS[chainId] : undefined;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function addressUrl(chainId: number | undefined, addr: string): string | undefined {
  const base = chainId !== undefined ? EXPLORERS[chainId] : undefined;
  return base ? `${base}/address/${addr}` : undefined;
}

export const OKB_TESTNET_FAUCET = "https://web3.okx.com/xlayer/faucet";
