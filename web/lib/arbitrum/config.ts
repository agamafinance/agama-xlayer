// Agama on Arbitrum Sepolia — deployed Stylus contracts + display metadata.
// Addresses come from smart-arbitrum/stylus/deployments/arbitrum-sepolia.json.
import { defineChain } from 'viem';

export const arbitrumSepolia = defineChain({
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] } },
  blockExplorers: { default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' } },
  testnet: true,
});

// All contracts reproducibly verified with `cargo stylus verify` (cargo-stylus 0.10.7).
export const ADDR = {
  MockUSDC: '0x71084fe670754e590aa9f613e88724beb3f1b489',
  AgUSD: '0x2dc1bad4e0a3af9acf003d65dea54dc568e787d2',
  SagUSD: '0xc61cd1e0c8301e4e883913a9fe236b65688a241c',
  NavOracle: '0xc925d86b2f9c1b1c94f98b1f20c203eed8cad79b',
  LendingPool: '0x221274708afbe3934fa2e3e16dbbb83055f992d0',
} as const;

export type Curator = 'Qiro' | 'Tenka';

export interface Vault {
  key: string;
  name: string;
  curator: Curator;
  address: `0x${string}`;
  apyLabel: string;
  apyBps: number;
  ltv: number;
  threshold: number;
  bonus: number;
  capacityUsd: number;
  redemption: string;
  tranche: string;
}

export const VAULTS: Vault[] = [
  { key: 'qPFV', name: 'Payment Financing Vault', curator: 'Qiro', address: '0x8b5c1f342e1e8189ff636ce1c2bbf32cd987bfee', apyLabel: '14%', apyBps: 1400, ltv: 0.75, threshold: 0.82, bonus: 0.06, capacityUsd: 25_000_000, redemption: 'Weekly', tranche: 'Short-term receivables' },
  { key: 'qPCV', name: 'Private Credit Vault', curator: 'Qiro', address: '0x255abc47c6e2cfcfb376dcefef8ebd5790997bbd', apyLabel: '13%', apyBps: 1300, ltv: 0.70, threshold: 0.78, bonus: 0.07, capacityUsd: 10_000_000, redemption: 'Monthly', tranche: 'Diversified credit fund' },
  { key: 'qICV', name: 'Institutional Credit Vault', curator: 'Qiro', address: '0x9f617bade5db3fbe6391e982a40baf96b0781f88', apyLabel: '12%', apyBps: 1200, ltv: 0.65, threshold: 0.73, bonus: 0.08, capacityUsd: 15_000_000, redemption: 'Quarterly', tranche: 'Institutional lender financing' },
  { key: 'tSNR', name: 'Flagship Vault', curator: 'Tenka', address: '0x6200a2d00d976f358509f869c95096f8d901f7eb', apyLabel: '8–9%', apyBps: 850, ltv: 0.80, threshold: 0.86, bonus: 0.05, capacityUsd: 500_000_000, redemption: 'Weekly', tranche: 'ABF Senior · secured' },
  { key: 'tMEZ', name: 'High Yield Vault', curator: 'Tenka', address: '0x3672f2d8fef0066f53481aed7f4bba9a85216b9d', apyLabel: '15–20%', apyBps: 1750, ltv: 0.50, threshold: 0.60, bonus: 0.10, capacityUsd: 200_000_000, redemption: 'Monthly', tranche: 'ABF Mezzanine' },
  { key: 'tDV', name: 'DealVaults', curator: 'Tenka', address: '0x565f7ece62c71fb3840f27e0d4a5ad6fd76500d6', apyLabel: '7–15%', apyBps: 1100, ltv: 0.55, threshold: 0.65, bonus: 0.09, capacityUsd: 300_000_000, redemption: 'Per deal', tranche: 'Deal-by-deal' },
];

export const WAD = 10n ** 18n;
export const USDC = 10n ** 6n;
export const MAX_UINT = (2n ** 256n - 1n);

export const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  : n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;
