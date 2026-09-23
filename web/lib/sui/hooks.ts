'use client';

import { useQuery } from '@tanstack/react-query';
import { useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useSui } from './SuiContext';
import { SUI, toBaseUnits } from './config';

type SuiRpcClient = ReturnType<typeof useSuiClient>;

/** Live sagUSD NAV per share (1.0 = par) = vault total_assets / total_shares.
 *  Grows as the vault books yield, so the USD value of cagUSD / csagUSD tracks
 *  it. Falls back to 1.0 on any read error. */
export function useNav() {
  const client = useSuiClient();
  return useQuery<number>({
    queryKey: ['sui-nav'],
    refetchInterval: 15000,
    queryFn: async () => {
      try {
        const o: any = await client.getObject({ id: SUI.objects.vault, options: { showContent: true } });
        const f = o?.data?.content?.fields;
        const assets = Number(f?.assets ?? 0);
        const shares = Number(f?.treasury?.fields?.total_supply?.fields?.value ?? 0);
        return shares > 0 ? assets / shares : 1;
      } catch {
        return 1;
      }
    },
  });
}

export type SuiUser = { usdc: bigint; agusd: bigint; sagusd: bigint };
export type SuiState = { user: SuiUser | null };

/** Live wallet balances (USDC / agUSD / sagUSD), refetched on an interval and after each tx. */
export function useSuiState() {
  const client = useSuiClient();
  const { address, refreshKey } = useSui();

  return useQuery<SuiState>({
    queryKey: ['sui-state', address, refreshKey],
    refetchInterval: 8000,
    queryFn: async () => {
      if (!address) return { user: null };
      const [usdc, agusd, sagusd] = await Promise.all([
        client.getBalance({ owner: address, coinType: SUI.types.usdc }).catch(() => ({ totalBalance: '0' })),
        client.getBalance({ owner: address, coinType: SUI.types.agusd }).catch(() => ({ totalBalance: '0' })),
        client.getBalance({ owner: address, coinType: SUI.types.sagusd }).catch(() => ({ totalBalance: '0' })),
      ]);
      return {
        user: {
          usdc: BigInt(usdc.totalBalance),
          agusd: BigInt(agusd.totalBalance),
          sagusd: BigInt(sagusd.totalBalance),
        },
      };
    },
  });
}

// Pick a coin of `coinType` owned by `owner`, merge fragments, and return a
// coin argument of exactly `amount` base units (throws if the balance is short).
async function coinOf(
  client: SuiRpcClient,
  tx: Transaction,
  owner: string,
  coinType: string,
  amount: bigint,
) {
  const { data } = await client.getCoins({ owner, coinType });
  if (!data.length) throw new Error(`No ${coinType.split('::').pop()} in wallet`);
  const primary = tx.object(data[0].coinObjectId);
  if (data.length > 1) tx.mergeCoins(primary, data.slice(1).map((c) => tx.object(c.coinObjectId)));
  const total = data.reduce((s, c) => s + BigInt(c.balance), 0n);
  if (total < amount) throw new Error('Insufficient balance');
  const [coin] = tx.splitCoins(primary, [tx.pure.u64(amount)]);
  return coin;
}

/** Bound, signed write actions for the connected Sui wallet. Each returns the tx digest. */
export function useSuiActions() {
  const client = useSuiClient();
  const { address, refresh } = useSui();
  const { mutateAsync: signExec } = useSignAndExecuteTransaction();

  const exec = async (build: (tx: Transaction) => void | Promise<void>) => {
    if (!address) throw new Error('Connect your wallet first');
    const tx = new Transaction();
    await build(tx);
    const r = await signExec({ transaction: tx });
    await client.waitForTransaction({ digest: r.digest });
    refresh();
    return r.digest;
  };

  return {
    /** Mint 100 test USDC from the faucet into the wallet. */
    faucet: () =>
      exec((tx) => {
        const usdc = tx.moveCall({
          target: SUI.targets.faucet,
          arguments: [tx.object(SUI.objects.usdcTreasury), tx.pure.u64(100_000_000n)],
        });
        tx.transferObjects([usdc], address!);
      }),

    /** KYC: open-whitelist this address (enables the confidential flow). */
    kyc: async () => {
      if (!address) throw new Error('Connect your wallet first');
      const res = await fetch(SUI.whitelistApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || 'KYC whitelist failed');
      refresh();
      return j.digest || 'whitelisted';
    },

    /** USDC → agUSD (1:1 mint). */
    mint: (human: string) =>
      exec(async (tx) => {
        const usdc = await coinOf(client, tx, address!, SUI.types.usdc, toBaseUnits(human));
        const ag = tx.moveCall({ target: SUI.targets.mint, arguments: [tx.object(SUI.objects.pool), usdc] });
        tx.transferObjects([ag], address!);
      }),

    /** agUSD → USDC (1:1 redeem). */
    redeem: (human: string) =>
      exec(async (tx) => {
        const ag = await coinOf(client, tx, address!, SUI.types.agusd, toBaseUnits(human));
        const usdc = tx.moveCall({ target: SUI.targets.redeem, arguments: [tx.object(SUI.objects.pool), ag] });
        tx.transferObjects([usdc], address!);
      }),

    /** agUSD → sagUSD (stake at NAV). */
    stake: (human: string) =>
      exec(async (tx) => {
        const ag = await coinOf(client, tx, address!, SUI.types.agusd, toBaseUnits(human));
        const sag = tx.moveCall({ target: SUI.targets.stake, arguments: [tx.object(SUI.objects.vault), ag] });
        tx.transferObjects([sag], address!);
      }),

    /** sagUSD → agUSD (unstake at NAV). */
    unstake: (human: string) =>
      exec(async (tx) => {
        const sag = await coinOf(client, tx, address!, SUI.types.sagusd, toBaseUnits(human));
        const ag = tx.moveCall({ target: SUI.targets.unstake, arguments: [tx.object(SUI.objects.vault), sag] });
        tx.transferObjects([ag], address!);
      }),
  };
}
