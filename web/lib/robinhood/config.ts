// Agama on Robinhood Chain testnet — the founder-house-london prototype market.
// Addresses come from poc/founder-house-london (README + script/E2E.s.sol):
// an isolated Morpho Blue market with real testnet TSLA as collateral, priced
// by our RobinhoodStockOracle, mUSDC as the loan asset.
import { defineChain } from 'viem';

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Robinhood Explorer', url: 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
});

export const ADDR = {
  Morpho: '0x9A88db5f32c7227e5C7FFabe2188Af2E4d5B91c4',
  TSLA: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E',
  MockUSDC: '0xC0E346206B5d6446f69522D29A88BC45B2B5c719',
  Oracle: '0x77D28482ace00b7760766a7699e6DcdDeAeed82E',
  Feed: '0xBb4c3A08E108465b305205D92C089cd1a63976b6',
  Irm: '0xAD6D44d86Ec31117e4D293E56B65715f33875AFe',
} as const;

export const LLTV = 850000000000000000n; // 85%

// MarketParams tuple for every Morpho call — keccak256(abi.encode(params)) is the id.
export const MARKET_PARAMS = {
  loanToken: ADDR.MockUSDC,
  collateralToken: ADDR.TSLA,
  oracle: ADDR.Oracle,
  irm: ADDR.Irm,
  lltv: LLTV,
} as const;

export const MARKET_ID = '0x0804d86012423b37100eb8cbd56029f54992cfcfce809f457f6f707a05d55bfb' as const;

export const TSLA_DECIMALS = 18;
export const USDC_DECIMALS = 6;

// Morpho oracle convention: price() is scaled by 10^(36 + loan − collateral) = 1e24.
export const ORACLE_PRICE_DECIMALS = 36 + USDC_DECIMALS - TSLA_DECIMALS;

export const MAX_UINT = 2n ** 256n - 1n;

export const explorer = (addr: string) => `https://explorer.testnet.chain.robinhood.com/address/${addr}`;
export const explorerTx = (tx: string) => `https://explorer.testnet.chain.robinhood.com/tx/${tx}`;
