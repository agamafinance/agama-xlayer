'use client';

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { maxUint256 } from 'viem';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';

import { addresses, abis } from '@/lib/contracts';
import { erc20Abi } from '@/lib/erc20';
import { fmt, fmtRayApr, parseAmount, AGYLD_DECIMALS } from '@/lib/format';
import { VaultHeader } from '@/components/VaultHeader';
import { ActionPanel } from '@/components/ActionPanel';
import { TxButton } from '@/components/TxButton';
import { FaucetCard } from '@/components/FaucetCard';

const REFETCH_MS = 12_000;

export default function AgYldDetailPage() {
  const { address: account, isConnected } = useAccount();

  const poolRead = useReadContracts({
    contracts: [
      { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'totalAssets' } as const,
      { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'totalSupply' } as const,
      { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'getReserveState' } as const,
      { address: addresses.USDr, abi: erc20Abi, functionName: 'balanceOf', args: [addresses.LendingPool] } as const,
    ],
    query: { refetchInterval: REFETCH_MS },
  });
  const lpTotalAssets = poolRead.data?.[0]?.result as bigint | undefined;
  const lpTotalSupply = poolRead.data?.[1]?.result as bigint | undefined;
  const reserveState = poolRead.data?.[2]?.result as
    | { currentLiquidityRate: bigint; currentBorrowRate: bigint }
    | undefined;
  const lpCash = poolRead.data?.[3]?.result as bigint | undefined;

  const userRead = useReadContracts({
    contracts: account
      ? [
          { address: addresses.USDr, abi: erc20Abi, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.USDr, abi: erc20Abi, functionName: 'allowance', args: [account, addresses.LendingPool] } as const,
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'balanceOf', args: [account] } as const,
        ]
      : [],
    query: { refetchInterval: REFETCH_MS, enabled: !!account },
  });
  const usdrBalance = userRead.data?.[0]?.result as bigint | undefined;
  const usdrAllowance = userRead.data?.[1]?.result as bigint | undefined;
  const agYLDBalance = userRead.data?.[2]?.result as bigint | undefined;

  const lenderApy = reserveState?.currentLiquidityRate;

  // USDr-equivalent of the user's agYLD shares.
  const agYLDAsUsdr =
    agYLDBalance && lpTotalSupply && lpTotalSupply > 0n && lpTotalAssets
      ? (agYLDBalance * lpTotalAssets) / lpTotalSupply
      : 0n;

  const refetch = () => {
    poolRead.refetch();
    userRead.refetch();
  };

  return (
    <>
      <VaultHeader
        backHref="/earn"
        symbol="agYLD"
        title="agYLD — Lending Pool"
        subtitle="Deposit USDr, earn yield. Withdraw any time."
        stats={[
          { label: 'APY', value: fmtRayApr(lenderApy) },
          { label: 'Pool TVL', value: lpTotalAssets ? `$${fmt(lpTotalAssets)}` : '—' },
          { label: 'Available', value: lpCash ? `${fmt(lpCash)} USDr` : '—' },
        ]}
      />

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-8 lg:grid-cols-[1fr_minmax(380px,440px)]">
          <div className="space-y-6">
            <div className="space-y-4 text-[14px] text-fg-muted">
              <p>
                Deposit USDr to mint <span className="text-fg">agYLD</span> — a yield-bearing share
                that grows with the pool.
              </p>
              <p>
                Want extra yield? Stake your agYLD into the{' '}
                <span className="text-fg">Stability Pool</span> for{' '}
                <span className="text-fg">sagYLD</span> and capture liquidation premiums.
              </p>
            </div>
            <FaucetCard
              symbol="USDr"
              description="Mock stablecoin · the deposit asset"
              tokenAddress={addresses.USDr}
              abi={abis.USDr}
              balance={usdrBalance}
              onSettled={refetch}
            />
          </div>

          <ActionsCard
            isConnected={isConnected}
            account={account}
            usdrBalance={usdrBalance}
            usdrAllowance={usdrAllowance}
            agYLDBalance={agYLDBalance}
            agYLDAsUsdr={agYLDAsUsdr}
            onSettled={refetch}
          />
        </div>
      </section>
    </>
  );
}

function ActionsCard({
  isConnected,
  account,
  usdrBalance,
  usdrAllowance,
  agYLDBalance,
  agYLDAsUsdr,
  onSettled,
}: {
  isConnected: boolean;
  account: `0x${string}` | undefined;
  usdrBalance: bigint | undefined;
  usdrAllowance: bigint | undefined;
  agYLDBalance: bigint | undefined;
  agYLDAsUsdr: bigint;
  onSettled: () => void;
}) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [depositInput, setDepositInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');

  const depositAmount = parseAmount(depositInput) ?? 0n;
  const withdrawAmount = parseAmount(withdrawInput) ?? 0n;
  const needsApproval = depositAmount > 0n && (usdrAllowance ?? 0n) < depositAmount;

  const { writeContract, data: hash, isPending, reset } = useWriteContract();

  const onApprove = () =>
    writeContract({
      address: addresses.USDr,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.LendingPool, maxUint256],
    });

  const onDeposit = () => {
    if (!account) return;
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'deposit',
      args: [depositAmount, account],
    });
  };

  const onWithdraw = () => {
    if (!account) return;
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'withdraw',
      args: [withdrawAmount, account, account],
    });
  };

  return (
    <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 md:p-6 space-y-5 self-start">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-[#254839]/[0.06] p-1">
        {(['deposit', 'withdraw'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-9 rounded-full text-[13px] capitalize transition-colors ${
              tab === t ? 'bg-[#254839] text-[#fdf8ed]' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-2 text-[13px]">
        <Row label="Your USDr" value={`${fmt(usdrBalance)} USDr`} />
        <Row label="Your agYLD" value={`${fmt(agYLDBalance, AGYLD_DECIMALS)} agYLD`} />
        <Row label="Redeemable" value={`${fmt(agYLDAsUsdr)} USDr`} />
      </div>

      {tab === 'deposit' ? (
        <ActionPanel
          label="Deposit"
          input={depositInput}
          onInput={setDepositInput}
          maxValue={usdrBalance}
          unit="USDr"
        >
          {!isConnected ? (
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  type="button"
                  onClick={openConnectModal}
                  className="h-11 w-full rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31]"
                >
                  Connect wallet
                </button>
              )}
            </ConnectButton.Custom>
          ) : needsApproval ? (
            <TxButton
              variant="secondary"
              label="Approve USDr"
              pending={isPending}
              hash={hash}
              onClick={onApprove}
              onSuccess={() => {
                onSettled();
                reset();
              }}
            />
          ) : (
            <TxButton
              label="Deposit"
              disabled={depositAmount === 0n}
              pending={isPending}
              hash={hash}
              onClick={onDeposit}
              onSuccess={() => {
                onSettled();
                setDepositInput('');
                reset();
              }}
            />
          )}
        </ActionPanel>
      ) : (
        <ActionPanel
          label="Withdraw"
          input={withdrawInput}
          onInput={setWithdrawInput}
          maxValue={agYLDAsUsdr}
          unit="USDr"
          hint="Burns the matching agYLD shares. Subject to pool liquidity."
        >
          <TxButton
            variant="secondary"
            label="Withdraw"
            disabled={!isConnected || withdrawAmount === 0n}
            pending={isPending}
            hash={hash}
            onClick={onWithdraw}
            onSuccess={() => {
              onSettled();
              setWithdrawInput('');
              reset();
            }}
          />
        </ActionPanel>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
