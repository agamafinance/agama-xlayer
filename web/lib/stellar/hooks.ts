'use client';

import { useQuery } from '@tanstack/react-query';
import { STELLAR } from './config';
import { addr, addUsdcTrustline, i128, invokeContract, readContract, toBaseUnits } from './client';
import { useStellar } from './StellarContext';

const C = STELLAR.contracts;

export type Allocation = { name: string; target_bps: number; apy_bps: number };
export type Pending = { assets: bigint; claimable_at: bigint };

export type StellarState = {
  sharePrice: bigint; // scaled to 7 decimals (1.0 = 10_000_000)
  nav: bigint;
  totalShares: bigint;
  reserve: bigint; // agUSD buffer = instant redemption capacity
  deployed: bigint; // value of the reserve working in the credit vaults
  agusdSupply: bigint;
  bufferBps: number;
  allocations: Allocation[];
  user: {
    usdc: bigint;
    agusd: bigint;
    sagusd: bigint;
    pending: Pending;
  } | null;
};

/** Live protocol + user state, refetched on an interval and after each tx. */
export function useStellarState() {
  const { address, refreshKey } = useStellar();

  return useQuery<StellarState>({
    queryKey: ['stellar-state', address, refreshKey],
    refetchInterval: 8000,
    queryFn: async () => {
      const [sharePrice, nav, totalShares, reserve, deployed, agusdSupply, bufferBps, allocations] =
        await Promise.all([
          readContract<bigint>(C.staking, 'share_price'),
          readContract<bigint>(C.staking, 'nav'),
          readContract<bigint>(C.staking, 'total_shares'),
          readContract<bigint>(C.agusd, 'reserve'),
          readContract<bigint>(C.agusd, 'deployed'),
          readContract<bigint>(C.agusd, 'total_supply'),
          readContract<number>(C.agusd, 'buffer_bps'),
          readContract<Allocation[]>(C.staking, 'allocations'),
        ]);

      let user: StellarState['user'] = null;
      if (address) {
        const [usdc, agusd, sagusd, pending] = await Promise.all([
          readContract<bigint>(C.usdc, 'balance', [addr(address)]).catch(() => 0n),
          readContract<bigint>(C.agusd, 'balance', [addr(address)]),
          readContract<bigint>(C.staking, 'balance', [addr(address)]),
          readContract<Pending>(C.staking, 'pending', [addr(address)]),
        ]);
        user = { usdc, agusd, sagusd, pending };
      }

      return { sharePrice, nav, totalShares, reserve, deployed, agusdSupply, bufferBps, allocations, user };
    },
  });
}

export type VaultState = {
  sharePrice: bigint;
  nav: bigint;
  totalShares: bigint;
  user: { usdc: bigint; shares: bigint; pending: Pending } | null;
};

/** Live state of one curated credit vault (its own on-chain contract). */
export function useCreditVault(slug: string) {
  const { address, refreshKey } = useStellar();
  const vaultId = STELLAR.creditVaults[slug];

  return useQuery<VaultState>({
    queryKey: ['stellar-vault', slug, address, refreshKey],
    refetchInterval: 8000,
    enabled: !!vaultId,
    queryFn: async () => {
      const [sharePrice, nav, totalShares] = await Promise.all([
        readContract<bigint>(vaultId, 'share_price'),
        readContract<bigint>(vaultId, 'nav'),
        readContract<bigint>(vaultId, 'total_shares'),
      ]);
      let user: VaultState['user'] = null;
      if (address) {
        const [usdc, shares, pending] = await Promise.all([
          readContract<bigint>(C.usdc, 'balance', [addr(address)]).catch(() => 0n),
          readContract<bigint>(vaultId, 'balance', [addr(address)]),
          readContract<Pending>(vaultId, 'pending', [addr(address)]),
        ]);
        user = { usdc, shares, pending };
      }
      return { sharePrice, nav, totalShares, user };
    },
  });
}

/** Signed deposit/withdraw actions on one credit vault (USDC in/out). */
export function useCreditVaultActions(slug: string) {
  const { address, signXDR, refresh } = useStellar();
  const vaultId = STELLAR.creditVaults[slug];

  const run = async (method: string, args = [] as any[]) => {
    if (!address) throw new Error('Connect your wallet first');
    const hash = await invokeContract({ contractId: vaultId, method, args, publicKey: address, signXDR });
    refresh();
    return hash;
  };

  return {
    deposit: (human: string) => run('stake', [addr(address!), i128(toBaseUnits(human))]),
    requestWithdraw: (humanShares: string) =>
      run('request_unstake', [addr(address!), i128(toBaseUnits(humanShares))]),
    claim: () => run('claim', [addr(address!)]),
  };
}

/** Bound, signed write actions for the connected wallet. */
export function useStellarActions() {
  const { address, signXDR, refresh } = useStellar();

  const run = async (contractId: string, method: string, args = [] as any[]) => {
    if (!address) throw new Error('Connect your wallet first');
    const hash = await invokeContract({ contractId, method, args, publicKey: address, signXDR });
    refresh();
    return hash;
  };

  return {
    /** Open the USDC trustline (required once before receiving real Circle USDC). */
    addTrustline: async () => {
      if (!address) throw new Error('Connect your wallet first');
      const hash = await addUsdcTrustline({ publicKey: address, signXDR });
      refresh();
      return hash;
    },
    depositAgusd: (human: string) =>
      run(C.agusd, 'deposit', [addr(address!), i128(toBaseUnits(human))]),
    redeemAgusd: (human: string) =>
      run(C.agusd, 'redeem', [addr(address!), i128(toBaseUnits(human))]),
    stake: (human: string) =>
      run(C.staking, 'stake', [addr(address!), i128(toBaseUnits(human))]),
    requestUnstake: (humanShares: string) =>
      run(C.staking, 'request_unstake', [addr(address!), i128(toBaseUnits(humanShares))]),
    claim: () => run(C.staking, 'claim', [addr(address!)]),
  };
}
