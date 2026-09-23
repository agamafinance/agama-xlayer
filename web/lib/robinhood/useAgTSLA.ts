'use client';

// agTSLA vault surface: NAV + user position + the position-management agent's live
// risk report (computed client-side, mirroring script/agent/AgamaKeeper.s.sol 1:1),
// plus deposit / redeem / harvest write actions. Reuses pub/send/ensureAllowance and
// the wallet plumbing from ./useRobinhood so it drops into the existing app unchanged.
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import {
  ADDR, MARKET_PARAMS, MARKET_ID, LLTV,
  ORACLE_PRICE_DECIMALS, USDC_DECIMALS, TSLA_DECIMALS,
} from './config';
import { MORPHO_ABI, ORACLE_ABI } from './abis';
import { pub, send, ensureAllowance } from './useRobinhood';
import {
  AGTSLA_ADDR, AGTSLA_VAULT_ABI, CREDIT_VAULT_ABI, IRM_ABI, AGTSLA_CREDIT_VAULT,
  SECONDS_PER_YEAR, DELEVERAGE_WARN_BPS, DEFAULT_MIN_HARVEST_SURPLUS, type KeeperAction,
} from './agtsla';

const n = (v: bigint, d: number) => Number(formatUnits(v, d));

// Morpho SharesMathLib.toAssetsUp — the exact debt the market charges.
const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;
function sharesToAssetsUp(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  if (shares === 0n) return 0n;
  const denom = totalShares + VIRTUAL_SHARES;
  return (shares * (totalAssets + VIRTUAL_ASSETS) + denom - 1n) / denom;
}

export interface AgtslaState {
  pricePerShare: number;   // TSLA per agTSLA share
  totalSupply: number;     // agTSLA in circulation
  navTsla: number;         // total vault NAV in TSLA
  userShares: number;      // connected wallet's agTSLA
  userValueTsla: number;   // userShares · pricePerShare
}

export interface KeeperReport {
  priceUsd: number;
  collateralTsla: number;
  collateralUsd: number;
  debtUsd: number;
  creditUsd: number;
  currentLtvBps: number;       // e.g. 7000 = 70%
  priceDropToLiqBps: number;   // how far TSLA can fall before liquidation
  qpayAprBps: number;
  borrowAprBps: number;
  netCarryBps: number;         // qpay − borrow; > 0 ⇒ productive leverage
  surplusUsd: number;          // unharvested idle yield
  healthy: boolean;
  action: KeeperAction;
  actionDetail: string;
}

export function useAgTSLA(address?: `0x${string}`, minHarvestSurplus: bigint = DEFAULT_MIN_HARVEST_SURPLUS) {
  const [state, setState] = useState<AgtslaState | null>(null);
  const [report, setReport] = useState<KeeperReport | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const V = AGTSLA_ADDR.Vault as `0x${string}`;
        const QP = AGTSLA_CREDIT_VAULT.address;
        const [pps, supply, nav, price, pos, mkt, pcvBal, qpps, qapr, userBal] = await Promise.all([
          pub.readContract({ address: V, abi: AGTSLA_VAULT_ABI, functionName: 'pricePerShare' }),
          pub.readContract({ address: V, abi: AGTSLA_VAULT_ABI, functionName: 'totalSupply' }),
          pub.readContract({ address: V, abi: AGTSLA_VAULT_ABI, functionName: 'totalAssets' }),
          pub.readContract({ address: ADDR.Oracle, abi: ORACLE_ABI, functionName: 'price' }),
          pub.readContract({ address: ADDR.Morpho, abi: MORPHO_ABI, functionName: 'position', args: [MARKET_ID, V] }),
          pub.readContract({ address: ADDR.Morpho, abi: MORPHO_ABI, functionName: 'market', args: [MARKET_ID] }),
          pub.readContract({ address: QP, abi: CREDIT_VAULT_ABI, functionName: 'balanceOf', args: [V] }),
          pub.readContract({ address: QP, abi: CREDIT_VAULT_ABI, functionName: 'pricePerShare' }),
          pub.readContract({ address: QP, abi: CREDIT_VAULT_ABI, functionName: 'aprRay' }),
          address
            ? pub.readContract({ address: V, abi: AGTSLA_VAULT_ABI, functionName: 'balanceOf', args: [address] })
            : Promise.resolve(0n),
        ]);
        if (!alive) return;

        const [, borrowShares, collateral] = pos as readonly [bigint, bigint, bigint];
        const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] =
          mkt as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

        const debt = sharesToAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);
        const collateralUsd = (collateral * (price as bigint)) / 10n ** 36n;
        const maxBorrow = (collateralUsd * LLTV) / 10n ** 18n;
        const healthy = debt <= maxBorrow;
        const currentLtvBps = collateralUsd === 0n ? 0n : (debt * 10_000n) / collateralUsd;

        let priceDropToLiqBps: bigint;
        if (collateral > 0n && debt > 0n) {
          const priceLiq = (debt * 10n ** 36n * 10n ** 18n) / (collateral * LLTV);
          priceDropToLiqBps = priceLiq >= (price as bigint) ? 0n : (((price as bigint) - priceLiq) * 10_000n) / (price as bigint);
        } else {
          priceDropToLiqBps = 10_000n;
        }

        const creditUsd = ((pcvBal as bigint) * (qpps as bigint)) / 10n ** 18n;
        const surplus = creditUsd > debt ? creditUsd - debt : 0n;

        // live Morpho borrow rate (per-second WAD) → bps/yr
        const ratePerSec = await pub.readContract({
          address: ADDR.Irm, abi: IRM_ABI, functionName: 'borrowRateView',
          args: [MARKET_PARAMS, { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee }],
        });
        const borrowAprBps = ((ratePerSec as bigint) * SECONDS_PER_YEAR) / 10n ** 14n;
        const qpayAprBps = (qapr as bigint) / 10n ** 23n;

        // decide (mirror AgamaKeeper.s.sol)
        let action: KeeperAction;
        let detail: string;
        if ((supply as bigint) === 0n) {
          action = 'IDLE'; detail = 'vault empty, nothing to manage';
        } else if (!healthy) {
          action = 'LIQUIDATION_IMMINENT'; detail = 'position is liquidatable now';
        } else if (currentLtvBps >= BigInt(DELEVERAGE_WARN_BPS)) {
          action = 'DELEVERAGE_ADVISED'; detail = 'LTV in the warn band under the 85% cliff';
        } else if (surplus > minHarvestSurplus) {
          action = 'HARVEST_DUE'; detail = 'surplus clears the economical floor, compound it';
        } else if (surplus > 0n) {
          action = 'HEALTHY_HOLD'; detail = 'surplus below the economical harvest floor, let it accrue';
        } else {
          action = 'HEALTHY_HOLD'; detail = 'within targets, no idle yield yet';
        }

        setState({
          pricePerShare: n(pps as bigint, 18),
          totalSupply: n(supply as bigint, 18),
          navTsla: n(nav as bigint, TSLA_DECIMALS),
          userShares: n(userBal as bigint, 18),
          userValueTsla: n(((userBal as bigint) * (pps as bigint)) / 10n ** 18n, TSLA_DECIMALS),
        });
        setReport({
          priceUsd: n(price as bigint, ORACLE_PRICE_DECIMALS),
          collateralTsla: n(collateral, TSLA_DECIMALS),
          collateralUsd: n(collateralUsd, USDC_DECIMALS),
          debtUsd: n(debt, USDC_DECIMALS),
          creditUsd: n(creditUsd, USDC_DECIMALS),
          currentLtvBps: Number(currentLtvBps),
          priceDropToLiqBps: Number(priceDropToLiqBps),
          qpayAprBps: Number(qpayAprBps),
          borrowAprBps: Number(borrowAprBps),
          netCarryBps: Number(qpayAprBps) - Number(borrowAprBps),
          surplusUsd: n(surplus, USDC_DECIMALS),
          healthy,
          action,
          actionDetail: detail,
        });
      } catch (e) { console.error('agTSLA read', e); }
    })();
    return () => { alive = false; };
  }, [address, tick, minHarvestSurplus]);

  return { state, report, refresh };
}

// ---- write actions ----
export function useAgTSLAActions(address: `0x${string}` | undefined, refresh: () => void) {
  const req = (a?: `0x${string}`): `0x${string}` => { if (!a) throw new Error('connect wallet'); return a; };
  return {
    // deposit TSLA -> mint agTSLA (vault pulls TSLA, so approve the VAULT first)
    async deposit(tslaIn: bigint) {
      const a = req(address);
      await ensureAllowance(a, ADDR.TSLA, AGTSLA_ADDR.Vault as `0x${string}`, tslaIn);
      await send(a, AGTSLA_ADDR.Vault as `0x${string}`, AGTSLA_VAULT_ABI, 'deposit', [tslaIn, a]);
      refresh();
    },
    // burn agTSLA -> get TSLA back (no approval; burns caller's own shares)
    async redeem(shares: bigint) {
      const a = req(address);
      await send(a, AGTSLA_ADDR.Vault as `0x${string}`, AGTSLA_VAULT_ABI, 'redeem', [shares, a]);
      refresh();
    },
    // permissionless compound — anyone (incl. this UI's "keeper" button) can call it
    async harvest() {
      const a = req(address);
      await send(a, AGTSLA_ADDR.Vault as `0x${string}`, AGTSLA_VAULT_ABI, 'harvest', []);
      refresh();
    },
    // permissionless de-risk — repays Morpho debt from the vault's own qPAY to bring
    // LTV back to target. Show this button when report.action is DELEVERAGE_ADVISED
    // or LIQUIDATION_IMMINENT; it's what unlocks redemptions after an adverse
    // liquidation leaves the shared position above the LLTV.
    async deleverage() {
      const a = req(address);
      await send(a, AGTSLA_ADDR.Vault as `0x${string}`, AGTSLA_VAULT_ABI, 'deleverage', []);
      refresh();
    },
  };
}
