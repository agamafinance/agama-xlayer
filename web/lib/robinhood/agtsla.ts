// agTSLA (auto-compounding leveraged vault) + the 6 Qiro/Tenka credit vaults +
// the position-management agent's on-chain metrics. Extends config.ts / abis.ts.
//
// Every address and every ABI fragment here was verified against the LIVE testnet
// contracts (chain 46630) on 2026-07-11 with `cast call` — see docs/frontend-integration.md
// for the verification log. Do NOT hand-edit signatures; regenerate from the Foundry
// artifacts in out/ if a contract is redeployed.
import { parseAbi } from 'viem';

// ---- addresses (extend ADDR from config.ts) ----
export const AGTSLA_ADDR = {
  Vault: '0xbE9792D83c799D77644e08cfa86185621f91Bf3d', // AgTSLAVault (agTSLA)
  Pair: '0xa095c31951198afd09539324AECDC37855CdCa61',  // TSLA/mUSDC UniswapV2 pair
  CreditAllocator: '0x13077eE7Bb490103B987B4f64D6761881c35A17a', // multi-pool router (Qiro/Tenka/Maple/Pareto)
} as const;

// ---- the full stock-vault family (all deployed + verified, chain 46630) ----
// Same AgamaStockVault code for each; one isolated Morpho market + oracle + pair per
// stock, all sharing the qPAY credit vault. Every deposit→lever→redeem cycle proven
// with real transactions. Use STOCK_VAULTS to render the whole family; useAgTSLA can
// be pointed at any vault by overriding AGTSLA_ADDR.Vault (or generalize the hook).
export interface StockVault {
  symbol: string;          // agTSLA
  stockSymbol: string;     // TSLA
  stock: `0x${string}`;
  vault: `0x${string}`;
  oracle: `0x${string}`;
  pair: `0x${string}`;
  priceUsd: number;        // seed price at deploy (TSLA relays the real mainnet feed)
}

export const STOCK_VAULTS: StockVault[] = [
  { symbol: 'agTSLA',  stockSymbol: 'TSLA', priceUsd: 407.8,
    stock: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E', vault: '0xbE9792D83c799D77644e08cfa86185621f91Bf3d',
    oracle: '0x77D28482ace00b7760766a7699e6DcdDeAeed82E', pair: '0xa095c31951198afd09539324AECDC37855CdCa61' },
  { symbol: 'agAMD',   stockSymbol: 'AMD', priceUsd: 115,
    stock: '0x71178BAc73cBeb415514eB542a8995b82669778d', vault: '0xfFf1DEA8905aF300205fD282f2930A9e0fbE503e',
    oracle: '0x65cBd62cF76b4B2fE19d0e199A06550f74d5bB4e', pair: '0xEb542E4131E6C2d2513De5aF87786079ea86a668' },
  { symbol: 'agAMZN',  stockSymbol: 'AMZN', priceUsd: 205,
    stock: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02', vault: '0x625d7838b6B86c09200A79e0bcED60C32c28d02A',
    oracle: '0xD51b61fC0c106262e5C520137362a777bcA9aD2f', pair: '0x50d891B04Aa2d4BBf06c9cddfF389b85325e58A5' },
  { symbol: 'agNFLX',  stockSymbol: 'NFLX', priceUsd: 890,
    stock: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93', vault: '0x6923d77BA554b9E3803EfbC70Aa93D1d4d4569C1',
    oracle: '0x0E60263E490e320504033E0B27c1b1a690973B86', pair: '0x5a94536FDE7C514fd9c4029EC34EEefdD527303b' },
  { symbol: 'agPLTR',  stockSymbol: 'PLTR', priceUsd: 75,
    stock: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0', vault: '0xed6005d4e0E8fc341b3BeC00F455829dA0d2EB4B',
    oracle: '0x4492687A829B1da8eb65351cc616ceb90e123BB4', pair: '0x03c86fD68cB98c669075bBfc3D8649C319672e36' },
];

// ---- the 6 credit vaults (verified symbols/curators/APRs on-chain) ----
export interface AgamaCreditVault {
  key: string;
  address: `0x${string}`;
  symbol: string;
  curator: 'Qiro' | 'Tenka' | 'Maple' | 'Pareto';
  aprBps: number; // basis points, matches on-chain aprRay / 1e23
}

export const AGAMA_CREDIT_VAULTS: AgamaCreditVault[] = [
  { key: 'qPAY',      address: '0xBdA73e5e45B6b58f1c04e0dE9999CF1fbB92Ab1E', symbol: 'qPAY',      curator: 'Qiro',  aprBps: 1400 },
  { key: 'qPCV',      address: '0xb9bAda1034094a669d594A9F27c6323fAA7dD1Fd', symbol: 'qPCV',      curator: 'Qiro',  aprBps: 1300 },
  { key: 'qICV',      address: '0xf77De6d2AD0E954AF262bb5798002Dd5582376Cd', symbol: 'qICV',      curator: 'Qiro',  aprBps: 1200 },
  { key: 'tFLAG',     address: '0xF2482eca30cCba59a4bf31b1aB5D19304047F895', symbol: 'tFLAG',     curator: 'Tenka', aprBps: 850 },
  { key: 'tHY',       address: '0xEA88D211cC9290e411E992F22347eFC75DecEA2A', symbol: 'tHY',       curator: 'Tenka', aprBps: 1750 },
  { key: 'tDEAL',     address: '0xF5cA0Cb305f3a725eb509bB75AAc92302e0B0486', symbol: 'tDEAL',     curator: 'Tenka', aprBps: 1100 },
  // Maple's onchain credit engine on Robinhood Chain — syrupUSDG (overcollateralized
  // institutional lending, curated by Steakhouse). Added as an available yield pool.
  { key: 'syrupUSDG', address: '0xb23b0daDa02c86D2A7E76d2060c34Fff14D1E3A6', symbol: 'syrupUSDG', curator: 'Maple', aprBps: 650 },
  // Pareto — Fasanara Digital Basis Trading strategy (delta-neutral basis trade).
  { key: 'fasBASIS',  address: '0x94F3c1D2cB99B0EFa6C07C9d7aCD47f8FBe906E0', symbol: 'fasBASIS',  curator: 'Pareto', aprBps: 881 },
];

// The one agTSLA is hardwired to (matches AgTSLAVault.CREDIT_VAULT() on-chain).
export const AGTSLA_CREDIT_VAULT = AGAMA_CREDIT_VAULTS[0]; // qPAY

// ---- ABIs (fragments verified live; full artifact in out/AgTSLAVault.sol) ----
export const AGTSLA_VAULT_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function pricePerShare() view returns (uint256)',
  'function balanceOf(address who) view returns (uint256)',
  'function principalInCreditVault() view returns (uint256)',
  'function TARGET_LTV_BPS() view returns (uint256)',
  'function CREDIT_VAULT() view returns (address)',
  'function deposit(uint256 tslaIn, address receiver) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver) returns (uint256 tslaOut)',
  'function harvest()',
  'function deleverage()',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

export const CREDIT_VAULT_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function curator() view returns (string)',
  'function poolName() view returns (string)',
  'function aprRay() view returns (uint256)',
  'function pricePerShare() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function balanceOf(address who) view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver) returns (uint256 assets)',
]);

// AdaptiveCurve IRM — for the live Morpho borrow rate the keeper report needs.
export const IRM_ABI = parseAbi([
  'struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }',
  'struct Market { uint128 totalSupplyAssets; uint128 totalSupplyShares; uint128 totalBorrowAssets; uint128 totalBorrowShares; uint128 lastUpdate; uint128 fee; }',
  'function borrowRateView(MarketParams marketParams, Market market) view returns (uint256)',
]);

// UniswapV2 pair — for a swap preview / harvest-yield estimate if you show one.
export const PAIR_ABI = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
]);

export const SECONDS_PER_YEAR = 31_536_000n; // 365 days, matches the vaults' accrual

// Keeper decision thresholds (mirror script/agent/AgamaKeeper.s.sol exactly).
export const DELEVERAGE_WARN_BPS = 8000; // warn band below the 85% LLTV cliff
export const DEFAULT_MIN_HARVEST_SURPLUS = 1_000_000n; // 1 mUSDC economical harvest floor

export type KeeperAction =
  | 'IDLE'
  | 'HEALTHY_HOLD'
  | 'HARVEST_DUE'
  | 'DELEVERAGE_ADVISED'
  | 'LIQUIDATION_IMMINENT';
