// The private-credit basket that backs agUSD on Sui. Reuses the exact curator
// metadata from the Stellar surface (same Tenka + Qiro vaults) and adds the
// on-app target allocation used by the Allocation Engine when USDC is swapped.
export { CREDIT_VAULTS, CURATORS, QIRO, TENKA, vaultByName, vaultBySlug } from '@/lib/stellar/vaults';
export type { Curator, CreditVault } from '@/lib/stellar/vaults';

// Real on-chain CreditVault objects on Sui testnet (package
// 0x0acefb605b620a1d62fefe4f74291449ba2b2a524b75da062c00f1f635032335) — one per
// vault, each viewable on Suiscan. Keyed by the vault's `name`.
export const VAULT_OBJECTS: Record<string, string> = {
  'Flagship Vault': '0x1ff73da8c10c03a07c634c71db8a16281d5616264b474b28c404f15787264c29',
  'High Yield Vault': '0x3ecebb1212ddbcfb35530305730682c233ee7cfee7fe318fb54d10d2215d7db8',
  DealVaults: '0xe1f1165bb5893e26366eac7d086d79f441999a797bc5b8fdd11faf16c71761a1',
  'Payment Financing Vault': '0x9465ccbb96442b24768046ce7387fa509be1092fab84a4a920b6a9630dd70ea1',
  'Private Credit Vault': '0xbac49a742908192497c95e7d4883ece0928ae348935b7b6e31ddbda8598f3176',
  'Institutional Credit Vault': '0x31a831923476eec71a5612b7a80588b18e909c032be593e49d26c979b263a786',
};

// Target allocation of the swapped USDC across the basket (bps, sum = 10000).
export const ALLOC_BPS: Record<string, number> = {
  'Flagship Vault': 2500,
  'High Yield Vault': 1000,
  DealVaults: 1500,
  'Payment Financing Vault': 2500,
  'Private Credit Vault': 1000,
  'Institutional Credit Vault': 1500,
};

// APY midpoints (bps) per vault, to compute the blended headline APY.
const APY_BPS: Record<string, number> = {
  'Flagship Vault': 850,
  'High Yield Vault': 1750,
  DealVaults: 1100,
  'Payment Financing Vault': 1400,
  'Private Credit Vault': 1300,
  'Institutional Credit Vault': 1200,
};

/** Allocation-weighted blended target APY, e.g. "12.13%". */
export function blendedApy(): string {
  const bps = Object.keys(ALLOC_BPS).reduce(
    (s, name) => s + (APY_BPS[name] * ALLOC_BPS[name]) / 10_000,
    0,
  );
  return `${(bps / 100).toFixed(2)}%`;
}
