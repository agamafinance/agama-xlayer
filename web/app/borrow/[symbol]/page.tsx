'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { encodeAbiParameters, maxUint256 } from 'viem';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';

import { addresses, abis } from '@/lib/contracts';
import {
  tranchesBySymbol,
  aprPercent,
  ltvPercent,
  ltPercent,
  bonusPercent,
  type Tranche,
} from '@/lib/tranches';
import { erc20Abi } from '@/lib/erc20';
import { fmt, fmtRayApr, parseAmount } from '@/lib/format';
import { VaultHeader } from '@/components/VaultHeader';
import { HFGauge } from '@/components/HFGauge';
import { ActionPanel } from '@/components/ActionPanel';
import { TxButton } from '@/components/TxButton';
import { FaucetCard } from '@/components/FaucetCard';

const REFETCH_MS = 12_000;
const ZERO_DATA = encodeAbiParameters([{ type: 'uint256' }], [0n]);
const encodeAmount = (a: bigint) => encodeAbiParameters([{ type: 'uint256' }], [a]);

export default function BorrowDetailPage({
  params: routeParams,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(routeParams);
  const tranche = tranchesBySymbol[symbol];
  if (!tranche) notFound();

  const { address: account, isConnected } = useAccount();

  const poolRead = useReadContracts({
    contracts: [
      { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'getReserveState' } as const,
      { address: addresses.USDr, abi: erc20Abi, functionName: 'balanceOf', args: [addresses.LendingPool] } as const,
      { address: tranche.token, abi: abis.MockTrancheToken, functionName: 'pricePerShare' } as const,
      { address: tranche.oracle, abi: abis.MockOracle, functionName: 'getPrice' } as const,
    ],
    query: { refetchInterval: REFETCH_MS },
  });
  const reserveState = poolRead.data?.[0]?.result as
    | { currentBorrowRate: bigint; currentLiquidityRate: bigint }
    | undefined;
  const cashOnPool = poolRead.data?.[1]?.result as bigint | undefined;
  const pps = poolRead.data?.[2]?.result as bigint | undefined;
  const oraclePrice = poolRead.data?.[3]?.result as bigint | undefined;

  const userRead = useReadContracts({
    contracts: account
      ? [
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'vaultOpened', args: [account] } as const,
          { address: tranche.adapter, abi: abis.AmFiAdapter, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.DebtToken, abi: abis.DebtToken, functionName: 'balanceOf', args: [account, tranche.adapter] } as const,
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'calculateHealthFactor', args: [tranche.adapter, account, ZERO_DATA] } as const,
          { address: tranche.adapter, abi: abis.AmFiAdapter, functionName: 'getAssetValue', args: [account, ZERO_DATA] } as const,
          { address: tranche.token, abi: erc20Abi, functionName: 'balanceOf', args: [account] } as const,
          { address: tranche.token, abi: erc20Abi, functionName: 'allowance', args: [account, tranche.adapter] } as const,
          { address: addresses.USDr, abi: erc20Abi, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.USDr, abi: erc20Abi, functionName: 'allowance', args: [account, addresses.LendingPool] } as const,
        ]
      : [],
    query: { refetchInterval: REFETCH_MS, enabled: !!account },
  });
  const vaultOpened = userRead.data?.[0]?.result as boolean | undefined;
  const collateralAmount = userRead.data?.[1]?.result as bigint | undefined;
  const debtAmount = userRead.data?.[2]?.result as bigint | undefined;
  const hf = userRead.data?.[3]?.result as bigint | undefined;
  const collateralValueUsd = userRead.data?.[4]?.result as bigint | undefined;
  const tokenBalance = userRead.data?.[5]?.result as bigint | undefined;
  const tokenAllowance = userRead.data?.[6]?.result as bigint | undefined;
  const usdrBalance = userRead.data?.[7]?.result as bigint | undefined;
  const usdrAllowance = userRead.data?.[8]?.result as bigint | undefined;

  const refetch = () => {
    poolRead.refetch();
    userRead.refetch();
  };

  return (
    <>
      <VaultHeader
        backHref="/borrow"
        symbol={tranche.symbol}
        title={`${tranche.pool} · ${tranche.symbol}`}
        subtitle={
          tranche.tranche === 'Senior'
            ? `Senior tranche — priority-paid, capped APY. Borrow USDr up to ${ltvPercent(tranche)} LTV.`
            : `Junior tranche — first-loss with overflow yield. Borrow USDr up to ${ltvPercent(tranche)} LTV.`
        }
        stats={[
          { label: 'Tranche APR', value: aprPercent(tranche), sub: `${tranche.tranche.toLowerCase()} target` },
          { label: 'Borrow APR', value: fmtRayApr(reserveState?.currentBorrowRate), sub: 'utilization-driven' },
          { label: 'Max LTV', value: ltvPercent(tranche), sub: `liq @ ${ltPercent(tranche)}` },
          { label: 'Liq. bonus', value: bonusPercent(tranche), sub: 'paid to SP' },
        ]}
      />

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-8 lg:grid-cols-[1fr_minmax(380px,440px)]">
          <div className="space-y-6">
            <HFGauge
              hfRay={(collateralAmount ?? 0n) === 0n && (debtAmount ?? 0n) === 0n ? undefined : hf}
            />
            <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5">
              <h3 className="text-[16px] text-fg">Position on this market</h3>
              <p className="mt-1 text-[12px] text-fg-muted">
                Each market has its own debt counter — borrows here only affect this market&apos;s
                health factor.
              </p>
              <div className="mt-4 space-y-2 text-[13px]">
                <Row label={`Collateral (${tranche.symbol})`} value={fmt(collateralAmount)} />
                <Row label="Collateral value" value={`${fmt(collateralValueUsd)} USDr`} />
                <Row label="Debt outstanding" value={`${fmt(debtAmount)} USDr`} />
                <Row label="Pool liquidity" value={`${fmt(cashOnPool)} USDr`} />
                <Row label="pricePerShare" value={fmt(pps, 18, 4)} />
                <Row label="Oracle price" value={fmt(oraclePrice, 18, 4)} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <ManagePosition
              tranche={tranche}
              isConnected={isConnected}
              account={account}
              vaultOpened={vaultOpened}
              collateralAmount={collateralAmount}
              debtAmount={debtAmount}
              collateralValueUsd={collateralValueUsd}
              tokenBalance={tokenBalance}
              tokenAllowance={tokenAllowance}
              usdrBalance={usdrBalance}
              usdrAllowance={usdrAllowance}
              onSettled={refetch}
            />
            <FaucetCard
              symbol={tranche.symbol}
              description={`Mock ${tranche.tranche.toLowerCase()} tranche — the collateral asset for this market`}
              tokenAddress={tranche.token}
              balance={tokenBalance}
              onSettled={refetch}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function ManagePosition({
  tranche,
  isConnected,
  account,
  vaultOpened,
  collateralAmount,
  debtAmount,
  collateralValueUsd,
  tokenBalance,
  tokenAllowance,
  usdrBalance,
  usdrAllowance,
  onSettled,
}: {
  tranche: Tranche;
  isConnected: boolean;
  account: `0x${string}` | undefined;
  vaultOpened: boolean | undefined;
  collateralAmount: bigint | undefined;
  debtAmount: bigint | undefined;
  collateralValueUsd: bigint | undefined;
  tokenBalance: bigint | undefined;
  tokenAllowance: bigint | undefined;
  usdrBalance: bigint | undefined;
  usdrAllowance: bigint | undefined;
  onSettled: () => void;
}) {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'borrow' | 'repay'>('deposit');
  const [input, setInput] = useState('');
  const amount = parseAmount(input) ?? 0n;

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const clearInput = () => {
    onSettled();
    setInput('');
    reset();
  };

  const onOpenVault = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'openVaultPosition',
    });

  const onApproveToken = () =>
    writeContract({
      address: tranche.token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [tranche.adapter, maxUint256],
    });

  const onDepositCollateral = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'depositAsset',
      args: [tranche.adapter, encodeAmount(amount)],
    });

  const onWithdrawCollateral = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'withdrawAsset',
      args: [tranche.adapter, encodeAmount(amount)],
    });

  const onBorrow = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'borrow',
      args: [tranche.adapter, ZERO_DATA, amount],
    });

  const onApproveUsdr = () =>
    writeContract({
      address: addresses.USDr,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.LendingPool, maxUint256],
    });

  const onRepay = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'repay',
      args: [tranche.adapter, ZERO_DATA, amount],
    });

  const onRepayMax = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'repay',
      args: [tranche.adapter, ZERO_DATA, maxUint256],
    });

  const isActiveAmount = isConnected && vaultOpened && amount > 0n;
  const tokenNeedsApproval = amount > 0n && (tokenAllowance ?? 0n) < amount;
  const usdrNeedsApproval = amount > 0n && (usdrAllowance ?? 0n) < amount;

  if (!isConnected) {
    return (
      <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-6 self-start space-y-4 text-center">
        <h3 className="text-[16px] text-fg">Connect wallet</h3>
        <p className="text-[13px] text-fg-muted">
          You need a connected wallet to open a vault on {tranche.symbol}.
        </p>
        <div className="inline-block">
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                type="button"
                onClick={openConnectModal}
                className="h-11 px-6 rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31]"
              >
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
        </div>
      </div>
    );
  }

  if (!vaultOpened) {
    return (
      <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-6 self-start space-y-4">
        <h3 className="text-[16px] text-fg">Open your vault</h3>
        <p className="text-[13px] text-fg-muted">
          One vault per address. Each market then tracks its own independent debt position — V3
          isolation.
        </p>
        <TxButton
          label="Open vault position"
          pending={isPending}
          hash={hash}
          onClick={onOpenVault}
          onSuccess={clearInput}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 md:p-6 self-start space-y-5">
      <div className="grid grid-cols-4 gap-1 rounded-full bg-[#254839]/[0.06] p-1">
        {(['deposit', 'withdraw', 'borrow', 'repay'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setInput('');
            }}
            className={`h-9 rounded-full text-[12px] capitalize transition-colors ${
              tab === t ? 'bg-[#254839] text-[#fdf8ed]' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'deposit' && (
        <ActionPanel
          label={`Deposit ${tranche.symbol}`}
          input={input}
          onInput={setInput}
          maxValue={tokenBalance}
          unit={`${tranche.symbol} · wallet ${fmt(tokenBalance)}`}
        >
          {tokenNeedsApproval ? (
            <TxButton
              variant="secondary"
              label="Approve"
              pending={isPending}
              hash={hash}
              onClick={onApproveToken}
              onSuccess={() => {
                onSettled();
                reset();
              }}
            />
          ) : (
            <TxButton
              label="Deposit"
              disabled={!isActiveAmount}
              pending={isPending}
              hash={hash}
              onClick={onDepositCollateral}
              onSuccess={clearInput}
            />
          )}
        </ActionPanel>
      )}

      {tab === 'withdraw' && (
        <ActionPanel
          label={`Withdraw ${tranche.symbol}`}
          input={input}
          onInput={setInput}
          maxValue={collateralAmount}
          unit={`${tranche.symbol} · posted ${fmt(collateralAmount)}`}
        >
          <TxButton
            variant="secondary"
            label="Withdraw"
            disabled={!isActiveAmount}
            pending={isPending}
            hash={hash}
            onClick={onWithdrawCollateral}
            onSuccess={clearInput}
          />
        </ActionPanel>
      )}

      {tab === 'borrow' && (
        <ActionPanel
          label="Borrow USDr"
          input={input}
          onInput={setInput}
          maxValue={maxBorrowable(collateralValueUsd, debtAmount, tranche.maxLtv)}
          unit={`USDr · max ${fmt(maxBorrowable(collateralValueUsd, debtAmount, tranche.maxLtv))}`}
          hint="Debt is scoped to this market only. Borrows here don't touch your other positions."
        >
          <TxButton
            label="Borrow"
            disabled={!isActiveAmount}
            pending={isPending}
            hash={hash}
            onClick={onBorrow}
            onSuccess={clearInput}
          />
        </ActionPanel>
      )}

      {tab === 'repay' && (
        <div className="space-y-3">
          <ActionPanel
            label="Repay USDr"
            input={input}
            onInput={setInput}
            maxValue={debtAmount}
            unit={`USDr · debt ${fmt(debtAmount)} · wallet ${fmt(usdrBalance)}`}
          >
            {usdrNeedsApproval ? (
              <TxButton
                variant="secondary"
                label="Approve"
                pending={isPending}
                hash={hash}
                onClick={onApproveUsdr}
                onSuccess={() => {
                  onSettled();
                  reset();
                }}
              />
            ) : (
              <TxButton
                variant="secondary"
                label="Repay"
                disabled={!isActiveAmount}
                pending={isPending}
                hash={hash}
                onClick={onRepay}
                onSuccess={clearInput}
              />
            )}
          </ActionPanel>
          {(debtAmount ?? 0n) > 0n && (usdrAllowance ?? 0n) > 0n && (
            <TxButton
              variant="secondary"
              size="sm"
              label={`Repay full debt (${fmt(debtAmount)} USDr)`}
              pending={isPending}
              hash={hash}
              onClick={onRepayMax}
              onSuccess={clearInput}
            />
          )}
        </div>
      )}
    </div>
  );
}

function maxBorrowable(
  collateralValueUsd: bigint | undefined,
  debt: bigint | undefined,
  maxLtvBps: number,
): bigint {
  if (!collateralValueUsd) return 0n;
  const ceiling = (collateralValueUsd * BigInt(maxLtvBps)) / 10_000n;
  const headroom = ceiling - (debt ?? 0n);
  return headroom > 0n ? headroom : 0n;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
