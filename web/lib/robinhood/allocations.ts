// Target allocation of the credit engine that sits behind every agStock vault.
// Same shape as the Stellar staking contract's on-chain `allocations`
// ({ name, target_bps, apy_bps }) so the Robinhood page can reuse Stellar's
// `netApy()` / per-card "% alloc" logic verbatim. Names MUST match the
// CREDIT_VAULTS entries re-exported from '@/lib/stellar/vaults'.
//
// Weights mirror the diversified split enforced by our on-chain CreditAllocator
// (0x13077eE7Bb490103B987B4f64D6761881c35A17a) — spread across the 3 Qiro and
// 3 Tenka vaults rather than concentrated in one, capped per pool.
export type Allocation = { name: string; target_bps: number; apy_bps: number };

export const ALLOCATIONS: Allocation[] = [
  { name: 'Payment Financing Vault',    target_bps: 1800, apy_bps: 1400 }, // qPAY
  { name: 'Private Credit Vault',       target_bps: 1700, apy_bps: 1300 }, // qPCV
  { name: 'Institutional Credit Vault', target_bps: 1600, apy_bps: 1200 }, // qICV
  { name: 'Flagship Vault',             target_bps: 1500, apy_bps:  850 }, // tFLAG
  { name: 'High Yield Vault',           target_bps: 1600, apy_bps: 1750 }, // tHY
  { name: 'DealVaults',                 target_bps: 1800, apy_bps: 1100 }, // tDEAL
];

// On-chain address of each credit vault (Robinhood Chain testnet, chain 46630),
// keyed by the Stellar vault `slug`. Powers the "open on explorer" card links.
export const CREDIT_VAULT_ADDR: Record<string, string> = {
  'payment-financing':   '0xBdA73e5e45B6b58f1c04e0dE9999CF1fbB92Ab1E', // qPAY
  'private-credit':      '0xb9bAda1034094a669d594A9F27c6323fAA7dD1Fd', // qPCV
  'institutional-credit':'0xf77De6d2AD0E954AF262bb5798002Dd5582376Cd', // qICV
  'flagship':            '0xF2482eca30cCba59a4bf31b1aB5D19304047F895', // tFLAG
  'high-yield':          '0xEA88D211cC9290e411E992F22347eFC75DecEA2A', // tHY
  'dealvaults':          '0xF5cA0Cb305f3a725eb509bB75AAc92302e0B0486', // tDEAL
};

// Blended target APY of the credit engine, TVL-weighted (same maths as Stellar's
// headline "Net APY"). ~12.7% across the six curated vaults.
export function netApy(allocs: { target_bps: number; apy_bps: number }[]): string {
  if (!allocs.length) return '—';
  const totalW = allocs.reduce((s, a) => s + a.target_bps, 0) || 1;
  const w = allocs.reduce((s, a) => s + a.apy_bps * a.target_bps, 0) / totalW;
  return `${(w / 100).toFixed(2)}%`;
}
