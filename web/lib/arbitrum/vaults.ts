// Curated credit-vault presentation metadata for the Arbitrum Earn surface.
// Reuses the exact same Qiro/Tenka metadata + curator branding as the Stellar
// surface, mapped by name to the verified Arbitrum vault addresses.
import { CREDIT_VAULTS, CURATORS, QIRO, TENKA, type CreditVault, type Curator } from '@/lib/stellar/vaults';
import { VAULTS } from './config';

export { CREDIT_VAULTS, CURATORS, QIRO, TENKA };
export type { CreditVault, Curator };

// name -> { key, address } from the on-chain config
const byName: Record<string, { key: string; address: `0x${string}` }> = Object.fromEntries(
  VAULTS.map((v) => [v.name, { key: v.key, address: v.address }])
);

export function arbVault(name: string) {
  return byName[name];
}

export const arbiscan = (addr: string) => `https://sepolia.arbiscan.io/address/${addr}`;
