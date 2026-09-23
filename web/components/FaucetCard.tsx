'use client';

import { useAccount, useWriteContract } from 'wagmi';
import type { Abi, Address } from 'viem';

import { abis } from '@/lib/contracts';
import { fmt } from '@/lib/format';
import { TxButton } from './TxButton';

const MINT_AMOUNT = 1_000_000n * 10n ** 18n;

/// Inline faucet — mints 1M of a single token (USDr on Earn, the tranche
/// collateral on Borrow) directly to the connected wallet. The mock tokens
/// expose a public `mint(address, uint256)` so there's no role gate.
export function FaucetCard({
  symbol,
  description,
  tokenAddress,
  balance,
  abi,
  onSettled,
}: {
  symbol: string;
  description: string;
  tokenAddress: Address;
  balance: bigint | undefined;
  /// Pass abis.USDr for USDr; abis.MockTrancheToken for tranche tokens.
  abi?: Abi;
  onSettled: () => void;
}) {
  const { address: account, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, reset } = useWriteContract();

  const onMint = () => {
    if (!account) return;
    writeContract({
      address: tokenAddress,
      abi: abi ?? abis.MockTrancheToken,
      functionName: 'mint',
      args: [account, MINT_AMOUNT],
    });
  };

  return (
    <div className="rounded-2xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-muted">Faucet</div>
          <div className="text-[15px] text-fg mt-0.5">Mint 1M {symbol}</div>
          <div className="text-[12px] text-fg-muted mt-0.5">{description}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-fg-muted">In wallet</div>
          <div className="text-[14px] text-fg">{fmt(balance)}</div>
        </div>
      </div>
      <div className="mt-4">
        <TxButton
          variant="secondary"
          size="sm"
          label={isConnected ? `Mint 1M ${symbol}` : 'Connect to mint'}
          disabled={!isConnected}
          pending={isPending}
          hash={hash}
          onClick={onMint}
          onSuccess={() => {
            onSettled();
            reset();
          }}
        />
      </div>
    </div>
  );
}
