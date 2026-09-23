'use client';

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { maxUint256 } from 'viem';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';

import { addresses, abis } from '@/lib/contracts';
import { fmt, parseAmount, AGYLD_DECIMALS, SAGYLD_DECIMALS } from '@/lib/format';
import { VaultHeader } from '@/components/VaultHeader';
import { ActionPanel } from '@/components/ActionPanel';
import { TxButton } from '@/components/TxButton';

const REFETCH_MS = 12_000;

export default function SagYldDetailPage() {
  const { address: account, isConnected } = useAccount();

  const poolRead = useReadContracts({
    contracts: [
      { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'totalAssets' } as const,
      { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'totalSupply' } as const,
      { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'cooldownDuration' } as const,
    ],
    query: { refetchInterval: REFETCH_MS },
  });
  const spTotalAssets = poolRead.data?.[0]?.result as bigint | undefined;
  const spTotalSupply = poolRead.data?.[1]?.result as bigint | undefined;
  const cooldownDuration = poolRead.data?.[2]?.result as bigint | undefined;

  const userRead = useReadContracts({
    contracts: account
      ? [
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.LendingPool, abi: abis.LendingPool, functionName: 'allowance', args: [account, addresses.StabilityPool] } as const,
          { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'balanceOf', args: [account] } as const,
          { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'earmarkedShares', args: [account] } as const,
          { address: addresses.StabilityPool, abi: abis.StabilityPool, functionName: 'pendingCount', args: [account] } as const,
        ]
      : [],
    query: { refetchInterval: REFETCH_MS, enabled: !!account },
  });
  const agYLDBalance = userRead.data?.[0]?.result as bigint | undefined;
  const agYLDAllowance = userRead.data?.[1]?.result as bigint | undefined;
  const sagYLDBalance = userRead.data?.[2]?.result as bigint | undefined;
  const earmarkedShares = userRead.data?.[3]?.result as bigint | undefined;
  const pendingCount = Number(userRead.data?.[4]?.result ?? 0n);

  const reqIds = Array.from({ length: pendingCount }, (_, i) => i);
  const reqsRead = useReadContracts({
    contracts:
      account && pendingCount > 0
        ? reqIds.map(
            (i) =>
              ({
                address: addresses.StabilityPool,
                abi: abis.StabilityPool,
                functionName: 'getRequest',
                args: [account, BigInt(i)],
              }) as const,
          )
        : [],
    query: { refetchInterval: REFETCH_MS, enabled: !!account && pendingCount > 0 },
  });

  type Req = {
    amount: bigint;
    requestedAt: bigint;
    settlementExtensionUntil: bigint;
    claimed: boolean;
  };
  const requests: Array<Req & { id: number }> = reqIds
    .map((i) => {
      const r = reqsRead.data?.[i]?.result as Req | undefined;
      return r ? { ...r, id: i } : undefined;
    })
    .filter((x): x is Req & { id: number } => !!x)
    .filter((r) => !r.claimed);

  const myValueAgYLD =
    sagYLDBalance && spTotalSupply && spTotalSupply > 0n && spTotalAssets
      ? (sagYLDBalance * spTotalAssets) / spTotalSupply
      : 0n;

  const refetch = () => {
    poolRead.refetch();
    userRead.refetch();
    reqsRead.refetch();
  };

  return (
    <>
      <VaultHeader
        backHref="/earn"
        symbol="sagYLD"
        title="sagYLD — Stability Pool"
        subtitle="Stake agYLD → capture liquidation premiums. 7-day cooldown to unstake."
        stats={[
          { label: 'SP TVL', value: spTotalAssets ? `${fmt(spTotalAssets, AGYLD_DECIMALS)}` : '—', sub: 'agYLD staked' },
          { label: 'Total sagYLD', value: spTotalSupply ? fmt(spTotalSupply, SAGYLD_DECIMALS) : '—', sub: 'across stakers' },
          { label: 'Cooldown', value: cooldownDuration ? `${Number(cooldownDuration) / 86400}d` : '—', sub: 'to unstake' },
          { label: 'Your stake', value: sagYLDBalance ? `${fmt(myValueAgYLD, AGYLD_DECIMALS)}` : '—', sub: '≈ agYLD value' },
        ]}
      />

      <section className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto grid gap-8 lg:grid-cols-[1fr_minmax(380px,440px)]">
          <div>
            <h2 className="text-[20px] text-fg">How it works</h2>
            <ol className="mt-4 space-y-3 text-[14px] text-fg-muted">
              <li>
                <span className="text-fg">1.</span> Stake your <span className="text-fg">agYLD</span>{' '}
                into the Stability Pool to mint <span className="text-fg">sagYLD</span>.
              </li>
              <li>
                <span className="text-fg">2.</span> When borrowers get liquidated, the SP absorbs
                their debt and the matching collateral lands in the pool — at a discount.
              </li>
              <li>
                <span className="text-fg">3.</span> sagYLD&apos;s share price grows as those premiums
                settle in. Net yield {'>'}  pure lender APY.
              </li>
              <li>
                <span className="text-fg">4.</span> Unstake is{' '}
                <span className="text-fg">7-day cooldown</span>: request now, claim later. While
                pending, your shares still backstop liquidations.
              </li>
            </ol>

            {requests.length > 0 && (
              <div className="mt-8">
                <div className="text-[12px] uppercase tracking-wider text-fg-muted">
                  Pending unstakes
                </div>
                <div className="mt-3 space-y-2">
                  {requests.map((r) => (
                    <PendingRow
                      key={r.id}
                      req={r}
                      cooldownDuration={cooldownDuration}
                      onSettled={refetch}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <ActionsCard
            isConnected={isConnected}
            account={account}
            agYLDBalance={agYLDBalance}
            agYLDAllowance={agYLDAllowance}
            sagYLDBalance={sagYLDBalance}
            earmarkedShares={earmarkedShares}
            myValueAgYLD={myValueAgYLD}
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
  agYLDBalance,
  agYLDAllowance,
  sagYLDBalance,
  earmarkedShares,
  myValueAgYLD,
  onSettled,
}: {
  isConnected: boolean;
  account: `0x${string}` | undefined;
  agYLDBalance: bigint | undefined;
  agYLDAllowance: bigint | undefined;
  sagYLDBalance: bigint | undefined;
  earmarkedShares: bigint | undefined;
  myValueAgYLD: bigint;
  onSettled: () => void;
}) {
  const [tab, setTab] = useState<'stake' | 'unstake'>('stake');
  const [stakeInput, setStakeInput] = useState('');
  const [unstakeInput, setUnstakeInput] = useState('');

  const stakeAmount = parseAmount(stakeInput, AGYLD_DECIMALS) ?? 0n;
  const unstakeAmount = parseAmount(unstakeInput, SAGYLD_DECIMALS) ?? 0n;
  const needsApproval = stakeAmount > 0n && (agYLDAllowance ?? 0n) < stakeAmount;

  const pendingTotal = earmarkedShares ?? 0n;
  const stakeable = sagYLDBalance && pendingTotal < sagYLDBalance ? sagYLDBalance - pendingTotal : 0n;

  const { writeContract, data: hash, isPending, reset } = useWriteContract();

  const onApprove = () =>
    writeContract({
      address: addresses.LendingPool,
      abi: abis.LendingPool,
      functionName: 'approve',
      args: [addresses.StabilityPool, maxUint256],
    });

  const onStake = () => {
    if (!account) return;
    writeContract({
      address: addresses.StabilityPool,
      abi: abis.StabilityPool,
      functionName: 'deposit',
      args: [stakeAmount, account],
    });
  };

  const onRequestUnstake = () => {
    if (!account) return;
    writeContract({
      address: addresses.StabilityPool,
      abi: abis.StabilityPool,
      functionName: 'requestUnstake',
      args: [unstakeAmount],
    });
  };

  return (
    <div className="rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] p-5 md:p-6 space-y-5 self-start">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-[#254839]/[0.06] p-1">
        {(['stake', 'unstake'] as const).map((t) => (
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
        <Row label="Your agYLD" value={`${fmt(agYLDBalance, AGYLD_DECIMALS)}`} />
        <Row label="Your sagYLD" value={`${fmt(sagYLDBalance, SAGYLD_DECIMALS)}`} />
        <Row label="≈ agYLD value" value={`${fmt(myValueAgYLD, AGYLD_DECIMALS)}`} />
      </div>

      {tab === 'stake' ? (
        <ActionPanel
          label="Stake"
          input={stakeInput}
          onInput={setStakeInput}
          maxValue={agYLDBalance}
          unit="agYLD"
          decimals={AGYLD_DECIMALS}
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
              label="Approve agYLD"
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
              label="Stake"
              disabled={stakeAmount === 0n}
              pending={isPending}
              hash={hash}
              onClick={onStake}
              onSuccess={() => {
                onSettled();
                setStakeInput('');
                reset();
              }}
            />
          )}
        </ActionPanel>
      ) : (
        <ActionPanel
          label="Request unstake"
          input={unstakeInput}
          onInput={setUnstakeInput}
          maxValue={stakeable}
          unit="sagYLD"
          decimals={SAGYLD_DECIMALS}
          hint="Starts the 7-day cooldown. Pending shares still earn premiums and absorb liquidations."
        >
          <TxButton
            variant="secondary"
            label="Request"
            disabled={!isConnected || unstakeAmount === 0n}
            pending={isPending}
            hash={hash}
            onClick={onRequestUnstake}
            onSuccess={() => {
              onSettled();
              setUnstakeInput('');
              reset();
            }}
          />
        </ActionPanel>
      )}
    </div>
  );
}

function PendingRow({
  req,
  cooldownDuration,
  onSettled,
}: {
  req: { id: number; amount: bigint; requestedAt: bigint; settlementExtensionUntil: bigint };
  cooldownDuration: bigint | undefined;
  onSettled: () => void;
}) {
  const baseUnlock = req.requestedAt + (cooldownDuration ?? 0n);
  const unlockAt =
    req.settlementExtensionUntil > baseUnlock ? req.settlementExtensionUntil : baseUnlock;
  const extended = req.settlementExtensionUntil > baseUnlock;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const claimable = now >= unlockAt;
  const remaining = claimable ? 0n : unlockAt - now;

  const { writeContract, data: hash, isPending, reset } = useWriteContract();

  const onClaim = () =>
    writeContract({
      address: addresses.StabilityPool,
      abi: abis.StabilityPool,
      functionName: 'claim',
      args: [BigInt(req.id)],
    });

  return (
    <div className="rounded-xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <div className="text-[14px] text-fg font-medium">
          {fmt(req.amount, SAGYLD_DECIMALS)} sagYLD
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
          <span>
            {claimable
              ? 'Ready to claim'
              : `Unlock in ${formatRemaining(remaining)} (${new Date(
                  Number(unlockAt) * 1000,
                ).toLocaleString()})`}
          </span>
          {extended && (
            <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
              Extended
            </span>
          )}
        </div>
      </div>
      <div className="w-[120px]">
        <TxButton
          size="sm"
          variant={claimable ? 'primary' : 'secondary'}
          label="Claim"
          disabled={!claimable}
          pending={isPending}
          hash={hash}
          onClick={onClaim}
          onSuccess={() => {
            onSettled();
            reset();
          }}
        />
      </div>
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

function formatRemaining(seconds: bigint): string {
  const s = Number(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
