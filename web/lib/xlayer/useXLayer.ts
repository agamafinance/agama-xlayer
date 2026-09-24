'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, type Address } from 'viem';

import {
  ADAPTERS, ADDR, AG_PER_USDG, CHAIN_ID_HEX, RAY, STOCKS, TARGET_VAULT_APY_RAY, TOKENS,
  USDG_DECIMALS, xLayerTestnet, type Stock,
} from './config';
import {
  accountAbi, amplifyRouterAbi, earnRouterAbi, lendingPoolAbi, stockOracleAbi,
  vaultShareAdapterAbi, xStockAdapterAbi,
} from './generated/abis';

export const pub = createPublicClient({
  chain: xLayerTestnet,
  transport: http(),
  // Every market read goes out as part of one Multicall3 call instead of on
  // its own. Four markets is about thirty reads a refresh, which a public RPC
  // answers unevenly.
  batch: { multicall: { wait: 16 } },
});

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'convertToAssets', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
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
  /// The collateral counted in the base token, which is the only one the app
  /// names: the pool holds ERC-4626 shares, the user deposited and will get
  /// back the thing OKX sends.
  collateralBase: bigint;
  /// The vault buffer at the rate it would actually be redeemed at, where
  /// `freeSharesValue` is the same shares at the CAPO-capped rate Arrow lends
  /// against. The cap is the right basis for a health factor and the wrong one
  /// for telling someone what they own.
  redeemable: bigint;
}

export interface Protocol {
  vaultApy: bigint; // ray
  vaultApyIsTarget: boolean;
  borrowRate: bigint; // ray
  usdg: bigint; // wallet balance
}

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

/// A counter that advances on its own, and that an action can advance early.
///
/// Every read here is keyed on it. Without the timer a value read from a node
/// that was a block behind would stay wrong until the user did something else:
/// the public RPC is load balanced, and right after a transaction one node in
/// the pool still answers with the old state.
export function useTick(everyMs = 12000): [number, () => void] {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    const id = setInterval(bump, everyMs);
    return () => clearInterval(id);
  }, [bump, everyMs]);
  return [tick, bump];
}

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

export function useXLayerPosition(
  address: Address | undefined,
  adapter: Address | undefined,
  wrapper: Address | undefined,
  tick: number,
) {
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!address || !adapter || !wrapper) { setPosition(null); return; }
    let alive = true;
    (async () => {
      try {
        const p = (await pub.readContract({
          address: ADDR.earnRouter, abi: earnRouterAbi, functionName: 'position', args: [address, adapter],
        })) as RouterPosition;
        const [target, base, redeemable] = await Promise.all([
          p.account === ZERO ? Promise.resolve(0n) : pub.readContract({
            address: p.account, abi: accountAbi, functionName: 'targetLtvBps', args: [adapter],
          }).catch(() => 0n) as Promise<bigint>,
          p.collateral === 0n ? Promise.resolve(0n) : pub.readContract({
            address: wrapper, abi: erc20Abi, functionName: 'convertToAssets', args: [p.collateral],
          }).catch(() => p.collateral) as Promise<bigint>,
          p.account === ZERO ? Promise.resolve(0n) : pub.readContract({
            address: p.account, abi: accountAbi, functionName: 'redeemableUsdg',
          }).catch(() => p.freeSharesValue) as Promise<bigint>,
        ]);
        if (alive) {
          setPosition({
            ...p, targetLtvBps: target, collateralBase: base, redeemable,
            hasPosition: p.collateral > 0n || p.debt > 0n,
          });
        }
      } catch (e) {
        console.error('xlayer position', e);
      }
    })();
    return () => { alive = false; };
  }, [address, adapter, wrapper, tick]);

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

/// What the pledged shares are actually worth.
///
/// `position()` values them at the CAPO-capped rate, because that is the rate
/// Arrow lends against and the ceiling deliberately trails the vault while a
/// settled coupon amortises in. That is the right number for a health factor
/// and the wrong one for "your equity": closing the loop redeems the shares at
/// the live rate, so this is the number that comes back to the wallet. Health
/// and the borrow rate stay on the router's own figures.
export async function atLiveRate(p: AmplifyPosition): Promise<AmplifyPosition> {
  if (p.pledgedShares === 0n) return p;
  const assets = (await pub.readContract({
    address: ADDR.sagUSD, abi: erc20Abi, functionName: 'convertToAssets', args: [p.pledgedShares],
  }).catch(() => 0n)) as bigint;
  const exposure = assets / AG_PER_USDG;
  if (exposure <= p.debt) return p;
  const equity = exposure - p.debt;
  return { ...p, exposure, equity, leverageBps: (exposure * 10_000n) / equity };
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
        const live = await atLiveRate(p as AmplifyPosition);
        if (alive) setPos(live);
      } catch (e) {
        console.error('xlayer amplify', e);
      }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  return pos;
}

// ---- wallet -----------------------------------------------------------------

/// The OKX wallet, or nothing.
///
/// This is an OKX chain and the deposit path starts with a withdrawal from the
/// OKX app, so OKX Wallet is the wallet this page talks to. Falling back to
/// `window.ethereum` would connect whichever extension won the injection race:
/// on a machine with Rabby installed, Rabby answered and offered its own
/// chooser, which has no OKX in it.
///
/// It announces itself three ways depending on where it runs, so all three are
/// checked: its own `window.okxwallet` (extension and the app's in-app
/// browser), an EIP-6963 announcement, and the flag it sets on a provider when
/// it is the only one installed.
const OKX_RDNS = ['com.okex.wallet', 'com.okx.wallet'];
const OKX_DOWNLOAD = 'https://web3.okx.com/download';

/// EIP-6963 announcements, collected as they arrive.
const discovered: { info: { rdns: string; name: string }; provider: any }[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = (e as CustomEvent).detail as { info: { rdns: string; name: string }; provider: any };
    if (d?.info?.rdns && !discovered.some((p) => p.info.rdns === d.info.rdns)) discovered.push(d);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/// Set once the user has disconnected, so the next page load does not put them
/// straight back. Without it `eth_accounts` would answer with the account the
/// wallet still has approved and the disconnect would last until the click.
const LEFT = 'agama.xlayer.disconnected';

function isOkx(p: any): boolean {
  return !!p && (p.isOkxWallet === true || p.isOKExWallet === true);
}

function okxProvider(): any {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { okxwallet?: any; ethereum?: any };
  if (w.okxwallet) return w.okxwallet;

  const announced = discovered.find(
    (p) => OKX_RDNS.includes(p.info.rdns) || /okx/i.test(p.info.name ?? ''),
  );
  if (announced) return announced.provider;

  // Some extensions expose every injected provider here when they share the
  // page; OKX may be one of them without owning `window.ethereum`.
  const many: any[] = (w.ethereum as any)?.providers ?? [];
  const inList = many.find(isOkx);
  if (inList) return inList;

  return isOkx(w.ethereum) ? w.ethereum : undefined;
}

/// Kept for the call sites that only ever want the one wallet.
const injectedProvider = okxProvider;

export function useWallet() {
  const [address, setAddress] = useState<Address | undefined>();

  const disconnect = useCallback(() => {
    setAddress(undefined);
    try {
      window.sessionStorage.setItem(LEFT, '1');
    } catch {
      /* private mode: the disconnect lasts the session anyway */
    }
    // Not every wallet implements this, and none of them have to. Where it
    // exists it makes the wallet forget the site too, which is what the user
    // meant; where it does not, clearing our side is the whole of it.
    injectedProvider()?.request?.({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
      .catch(() => {});
  }, []);

  const toXLayer = useCallback(async (eth: any) => {
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
      return true;
    } catch (e: any) {
      if (e?.code === 4902) {
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
        return true;
      }
      // A locked wallet refuses to switch before it is unlocked. Connecting
      // first and switching after is the fallback, not the happy path.
      return false;
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = injectedProvider();
    if (!eth) {
      window.open(OKX_DOWNLOAD, '_blank');
      return;
    }

    // Switch first, then ask for the account. The other way round shows the
    // connect dialog on whatever chain the wallet happens to be sitting on,
    // which is how someone approves a connection to X Layer while the wallet
    // says Coston2.
    await toXLayer(eth);
    const [acc] = await eth.request({ method: 'eth_requestAccounts' });

    // And if the wallet was locked a moment ago, it can switch now.
    const on = await eth.request({ method: 'eth_chainId' }).catch(() => undefined);
    if (on !== CHAIN_ID_HEX) await toXLayer(eth);

    try {
      window.sessionStorage.removeItem(LEFT);
    } catch {
      /* ignore */
    }
    setAddress(acc as Address);
  }, [toXLayer]);

  useEffect(() => {
    const eth = injectedProvider();
    if (!eth) return;
    let left = false;
    try {
      left = !!window.sessionStorage.getItem(LEFT);
    } catch {
      /* ignore */
    }
    if (!left) {
      eth.request({ method: 'eth_accounts' }).then((a: string[]) => {
        if (a[0]) setAddress(a[0] as Address);
      }).catch(() => {});
    }

    // The wallet can change the account or the chain without asking us.
    const onAccounts = (a: string[]) => setAddress(a[0] as Address | undefined);
    const onChain = () => setAddress((prev) => prev); // re-render; the guard in send() does the rest
    eth.on?.('accountsChanged', onAccounts);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, []);

  return { address, connect, disconnect };
}

/// Send one transaction and wait for it, the way every other network page here
/// does: the wallet client is built on demand so no provider has to be mounted.
export async function send(
  from: Address, to: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[],
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  // The wallet may have wandered off to another chain since connecting. Ask it
  // back before signing, rather than letting viem refuse with a mismatch the
  // user cannot act on.
  const on = await eth.request({ method: 'eth_chainId' }).catch(() => undefined);
  if (on !== CHAIN_ID_HEX) {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
  }
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
