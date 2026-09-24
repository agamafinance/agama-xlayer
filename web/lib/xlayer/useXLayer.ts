'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, type Address } from 'viem';

import {
  ADAPTERS, ADDR, CHAIN_ID_HEX, RAY, STOCKS, TARGET_VAULT_APY_RAY, TOKENS,
  USDG_DECIMALS, xLayerTestnet, type Stock,
} from './config';
import {
  accountAbi, amplifyRouterAbi, earnRouterAbi, lendingPoolAbi, stockOracleAbi,
  vaultShareAdapterAbi, xStockAdapterAbi,
} from './generated/abis';

export const pub = createPublicClient({ chain: xLayerTestnet, transport: http() });

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
] as const;

/// One market as the Earn page needs it: the oracle price, the risk knobs, and
/// what this wallet holds and owes on it.
export interface Market {
  stock: Stock;
  adapter: Address;
  wrapper: Address;
  price: bigint; // 18 decimals, USD
  observedAt: number;
  marketOpen: boolean;
  borrowAllowed: boolean;
  maxLtv: bigint; // bps
  liqThreshold: bigint; // bps, already lowered by the weekend buffer when closed
  baseLiqThreshold: bigint; // bps, market open
  wrapperPrice: bigint; // USDG (6 decimals) for one wrapped share
  balance: bigint; // wrapped, in the wallet
  baseBalance: bigint; // the token an OKX withdrawal delivers
  base?: Address;
}

export interface RouterPosition {
  account: Address;
  collateral: bigint;
  collateralValue: bigint;
  debt: bigint;
  healthFactorRay: bigint;
  freeShares: bigint;
  freeSharesValue: bigint;
  borrowAllowed: boolean;
  liquidationThresholdBps: bigint;
}

export interface Position extends RouterPosition {
  /// Not on chain: the router answers for every wallet, open or not.
  hasPosition: boolean;
  targetLtvBps: bigint;
}

export interface Protocol {
  vaultApy: bigint; // ray
  vaultApyIsTarget: boolean;
  borrowRate: bigint; // ray
  usdg: bigint; // wallet balance
}

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

export function useXLayerMarkets(address?: Address) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const out = await Promise.all(
          STOCKS.map(async (stock): Promise<Market> => {
            const adapter = ADAPTERS[stock.key];
            const wrapper = TOKENS[stock.wrapper];
            const [feed, maxLtv, lt, baseLt, borrowAllowed, wrapperPrice, base] = await Promise.all([
              pub.readContract({ address: ADDR.oracle, abi: stockOracleAbi, functionName: 'feed', args: [stock.ticker] }),
              pub.readContract({ address: adapter, abi: xStockAdapterAbi, functionName: 'MAX_LTV' }),
              pub.readContract({ address: adapter, abi: xStockAdapterAbi, functionName: 'LIQUIDATION_THRESHOLD' }),
              pub.readContract({ address: adapter, abi: xStockAdapterAbi, functionName: 'BASE_LIQUIDATION_THRESHOLD' }),
              pub.readContract({ address: adapter, abi: xStockAdapterAbi, functionName: 'borrowAllowed' }).catch(() => false),
              pub.readContract({ address: adapter, abi: xStockAdapterAbi, functionName: 'wrapperPrice' }).catch(() => 0n),
              pub.readContract({ address: wrapper, abi: erc20Abi, functionName: 'asset' }).catch(() => undefined),
            ]);
            const f = feed as { price: bigint; observedAt: bigint; marketOpen: boolean };
            const [balance, baseBalance] = address
              ? await Promise.all([
                  pub.readContract({ address: wrapper, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
                  base
                    ? pub.readContract({ address: base as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
                    : Promise.resolve(0n),
                ])
              : [0n, 0n];
            return {
              stock, adapter, wrapper,
              price: f.price, observedAt: Number(f.observedAt), marketOpen: f.marketOpen,
              borrowAllowed: borrowAllowed as boolean,
              maxLtv: maxLtv as bigint,
              liqThreshold: lt as bigint,
              baseLiqThreshold: baseLt as bigint,
              wrapperPrice: wrapperPrice as bigint,
              balance: balance as bigint, baseBalance: baseBalance as bigint,
              base: base as Address | undefined,
            };
          }),
        );
        if (alive) setMarkets(out);
      } catch (e) {
        console.error('xlayer markets', e);
      }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  return { markets, refresh };
}

export function useXLayerPosition(address: Address | undefined, adapter: Address | undefined, tick: number) {
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!address || !adapter) { setPosition(null); return; }
    let alive = true;
    (async () => {
      try {
        const p = (await pub.readContract({
          address: ADDR.earnRouter, abi: earnRouterAbi, functionName: 'position', args: [address, adapter],
        })) as RouterPosition;
        const target = p.account === ZERO ? 0n : ((await pub.readContract({
          address: p.account, abi: accountAbi, functionName: 'targetLtvBps', args: [adapter],
        }).catch(() => 0n)) as bigint);
        if (alive) {
          setPosition({ ...p, targetLtvBps: target, hasPosition: p.collateral > 0n || p.debt > 0n });
        }
      } catch (e) {
        console.error('xlayer position', e);
      }
    })();
    return () => { alive = false; };
  }, [address, adapter, tick]);

  return position;
}

export function useXLayerProtocol(address: Address | undefined, tick: number) {
  const [proto, setProto] = useState<Protocol | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [apy, reserve, usdg] = await Promise.all([
          pub.readContract({ address: ADAPTERS.VAULT, abi: vaultShareAdapterAbi, functionName: 'realizedApyRay' }).catch(() => 0n),
          pub.readContract({ address: ADDR.pool, abi: lendingPoolAbi, functionName: 'getReserveState' }),
          address
            ? pub.readContract({ address: TOKENS.USDG, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
            : Promise.resolve(0n),
        ]);
        const measured = apy as bigint;
        if (alive) {
          setProto({
            vaultApy: measured > 0n ? measured : TARGET_VAULT_APY_RAY,
            vaultApyIsTarget: measured === 0n,
            borrowRate: (reserve as { currentBorrowRate: bigint }).currentBorrowRate,
            usdg: usdg as bigint,
          });
        }
      } catch (e) {
        console.error('xlayer protocol', e);
      }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  return proto;
}

export interface AmplifyPosition {
  account: Address;
  pledgedShares: bigint;
  exposure: bigint;
  debt: bigint;
  equity: bigint;
  leverageBps: bigint;
  healthFactorRay: bigint;
  borrowRateRay: bigint;
  vaultApyRay: bigint;
}

export function useAmplifyPosition(address: Address | undefined, tick: number) {
  const [pos, setPos] = useState<AmplifyPosition | null>(null);

  useEffect(() => {
    if (!address) { setPos(null); return; }
    let alive = true;
    (async () => {
      try {
        const p = await pub.readContract({
          address: ADDR.amplifyRouter, abi: amplifyRouterAbi, functionName: 'position', args: [address],
        });
        if (alive) setPos(p as AmplifyPosition);
      } catch (e) {
        console.error('xlayer amplify', e);
      }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  return pos;
}

// ---- wallet -----------------------------------------------------------------

export function useWallet() {
  const [address, setAddress] = useState<Address | undefined>();

  const connect = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: any }).ethereum;
    if (!eth) {
      window.open('https://web3.okx.com/download', '_blank');
      return;
    }
    const [acc] = await eth.request({ method: 'eth_requestAccounts' });
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_ID_HEX,
            chainName: 'X Layer Testnet',
            nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
            rpcUrls: xLayerTestnet.rpcUrls.default.http,
            blockExplorerUrls: [xLayerTestnet.blockExplorers.default.url],
          }],
        });
      }
    }
    setAddress(acc as Address);
  }, []);

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: any }).ethereum;
    if (!eth) return;
    eth.request({ method: 'eth_accounts' }).then((a: string[]) => {
      if (a[0]) setAddress(a[0] as Address);
    }).catch(() => {});
  }, []);

  return { address, connect };
}

/// Send one transaction and wait for it, the way every other network page here
/// does: the wallet client is built on demand so no provider has to be mounted.
export async function send(
  from: Address, to: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[],
): Promise<`0x${string}`> {
  const eth = (window as unknown as { ethereum?: any }).ethereum;
  const wallet = createWalletClient({ account: from, chain: xLayerTestnet, transport: custom(eth) });
  const hash = await wallet.writeContract({ address: to, abi: abi as never, functionName, args: args as never });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function ensureAllowance(owner: Address, token: Address, spender: Address, need: bigint) {
  const current = (await pub.readContract({
    address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender],
  })) as bigint;
  if (current >= need) return;
  await send(owner, token, erc20Abi, 'approve', [spender, need]);
}

export async function faucet(owner: Address, token: Address, amount: bigint) {
  await send(owner, token, erc20Abi, 'faucet', [owner, amount]);
}

export { erc20Abi };
export const usdgDecimals = USDG_DECIMALS;
export const rayOne = RAY;
