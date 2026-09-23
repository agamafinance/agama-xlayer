import {defineChain} from "viem";

export const raylsTestnet = defineChain({
  id: 7295799,
  name: "Rayls Testnet",
  nativeCurrency: {
    name: "USDr",
    symbol: "USDr",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        // Primary: same-origin retry proxy (3 attempts on Cloudflare 5xx).
        // The wallet (MetaMask / Rabby) talks to the chain via this URL when
        // it needs eth_getTransactionCount / eth_estimateGas / etc., so the
        // upstream Rayls 520s get absorbed instead of bubbling to the user.
        "https://app.agama.finance/api/rpc",
        // Fallback: direct upstream if our proxy is itself down.
        "https://testnet-rpc.rayls.com/",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Rayls Explorer",
      url: "https://testnet-explorer.rayls.com",
      apiUrl: "https://testnet-explorer.rayls.com/api",
    },
  },
  testnet: true,
});
