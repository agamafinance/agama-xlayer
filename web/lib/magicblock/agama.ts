// Reads and math for Agama on MagicBlock.
//
// The share price model is the same one the Starknet deployment uses (pools accrue
// linearly at their APR, the client projects that forward every second so the number
// ticks smoothly), with one addition that is specific to this architecture.
//
// The lending book lives on an Ephemeral Rollup. Solana only sees it at *commit*
// granularity, so a base-layer read of the book is a snapshot from the last commit.
// Reading the book on the ER instead gives the live, per-tick state. Both are shown:
// the ER number is what the protocol knows, the base number is what Solana has
// settled, and the gap between them is the architecture, made visible.
import { Connection, PublicKey } from '@solana/web3.js';
import {
  AGYLD_MINT,
  BASE_RPC,
  BOOK_PDA,
  POOL_LABELS,
  ROUTER_RPC,
  USDC_MINT,
  VAULT_PDA,
  ata,
  positionPda,
} from './config';
import { Reader } from './anchor-lite';

export const baseConnection = () => new Connection(BASE_RPC, 'confirmed');

// -------------------------------------------------------------------- types

export type Pool = {
  name: string;
  sector: string;
  aprBps: number;
  weightBps: number;
  principal: bigint;
  accrued: bigint;
};

export type BookState = {
  pools: Pool[];
  /// Σ (principal + accrued) as of lastTs, marked by the ER.
  nav: bigint;
  /// How much of the vault's cumulative flow the book has already absorbed.
  markedIn: bigint;
  markedOut: bigint;
  lastTs: bigint;
  /// ER ticks since delegation: the 10 ms heartbeat, counted.
  ticks: bigint;
};

export type VaultState = {
  authority: PublicKey;
  shares: bigint;
  totalIn: bigint;
  totalOut: bigint;
};

export type PositionState = {
  owner: PublicKey;
  shares: bigint;
  entryPrice: bigint;
  valueUsdc: bigint;
  costBasis: bigint;
  yieldUsdc: bigint;
  syncedTs: bigint;
  syncs: number;
  isPrivate: boolean;
  bump: number;
  /// The browser key this position trusts inside the rollup, and until when.
  sessionKey: PublicKey;
  sessionExpiry: bigint;
};

/// A vault + book pair read from the same place, so NAV and supply are never
/// mixed across layers.
export type Snapshot = { vault: VaultState; book: BookState; source: 'base' | 'er' };

// ------------------------------------------------------------------ decoding

export function decodeVault(data: Uint8Array): VaultState {
  const r = new Reader(data);
  const authority = r.pubkey();
  r.pubkey(); // usdc_mint
  r.pubkey(); // agyld_mint
  return { authority, shares: r.u64(), totalIn: r.u64(), totalOut: r.u64() };
}

export function decodeBook(data: Uint8Array): BookState {
  const r = new Reader(data);
  r.pubkey(); // vault
  r.pubkey(); // authority
  const pools: Pool[] = [];
  for (let i = 0; i < 4; i++) {
    const name = r.str(24);
    const sector = r.str(32);
    pools.push({
      name: name || POOL_LABELS[i].label,
      sector: sector || POOL_LABELS[i].sector,
      aprBps: r.u32(),
      weightBps: r.u16(),
      principal: r.u64(),
      accrued: r.u64(),
    });
  }
  return {
    pools,
    nav: r.u64(),
    markedIn: r.u64(),
    markedOut: r.u64(),
    lastTs: r.i64(),
    ticks: r.u64(),
  };
}

export function decodePosition(data: Uint8Array): PositionState {
  const r = new Reader(data);
  const owner = r.pubkey();
  r.pubkey(); // vault
  return {
    owner,
    shares: r.u64(),
    entryPrice: r.u64(),
    valueUsdc: r.u64(),
    costBasis: r.u64(),
    yieldUsdc: r.u64(),
    syncedTs: r.i64(),
    syncs: r.u32(),
    isPrivate: r.bool(),
    bump: r.u8(),
    sessionKey: r.pubkey(),
    sessionExpiry: r.i64(),
  };
}

/// SPL token account: `amount` is a little-endian u64 at offset 64.
export function decodeTokenAmount(data: Uint8Array): bigint {
  if (data.length < 72) return 0n;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}

// --------------------------------------------------------------------- reads

/// One consistent snapshot: vault and book fetched in a single RPC round-trip so
/// NAV and share supply always come from the same state.
export async function readSnapshot(
  connection: Connection,
  source: 'base' | 'er' = 'base',
): Promise<Snapshot | null> {
  const [vaultAcc, bookAcc] = await connection.getMultipleAccountsInfo([VAULT_PDA, BOOK_PDA]);
  if (!vaultAcc || !bookAcc) return null;
  return {
    vault: decodeVault(vaultAcc.data),
    book: decodeBook(bookAcc.data),
    source,
  };
}

export async function readBalances(
  connection: Connection,
  owner: PublicKey,
): Promise<{ usdc: bigint; agyld: bigint }> {
  const [u, a] = await connection.getMultipleAccountsInfo([
    ata(USDC_MINT, owner),
    ata(AGYLD_MINT, owner),
  ]);
  return {
    usdc: u ? decodeTokenAmount(u.data) : 0n,
    agyld: a ? decodeTokenAmount(a.data) : 0n,
  };
}

export async function readPosition(
  connection: Connection,
  owner: PublicKey,
): Promise<PositionState | null> {
  const acc = await connection.getAccountInfo(positionPda(owner));
  return acc ? decodePosition(acc.data) : null;
}

/// Router `getDelegationStatus`: the only reliable answer to "where does this
/// account live right now". Returns null when the router does not know it.
export async function delegationStatus(account: PublicKey): Promise<any | null> {
  try {
    const res = await fetch(ROUTER_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getDelegationStatus',
        params: [account.toBase58()],
      }),
    });
    const json = await res.json();
    return json?.result ?? null;
  } catch {
    return null;
  }
}

/// The live ER endpoint for a delegated account, from the router.
export async function erEndpoint(account: PublicKey): Promise<string | null> {
  const status = await delegationStatus(account);
  const fqdn = status?.fqdn ?? status?.delegationRecord?.fqdn;
  if (!fqdn) return null;
  return fqdn.startsWith('http') ? fqdn : `https://${fqdn}`;
}

// ---------------------------------------------------------------------- math

const YEAR = 31_536_000n;
const BPS = 10_000n;
export const ONE = 1_000_000n;

/// A pool's marked value, projected to `nowSec` with the exact on-chain formula:
/// principal + accrued + principal * apr * dt / (bps * year).
export function projectPoolValue(p: Pool, nowSec: bigint, lastTs: bigint): bigint {
  const dt = nowSec > lastTs ? nowSec - lastTs : 0n;
  const pending = (p.principal * BigInt(p.aprBps) * dt) / (BPS * YEAR);
  return p.principal + p.accrued + pending;
}

/// Total NAV in USDC.
///
/// `book.nav` only counts capital the ER has marked into a pool. Dollars that
/// landed on base after the last tick sit in custody at par and are added here;
/// dollars already paid out but not yet unmarked are subtracted. This is the same
/// expression the program uses to price a deposit, so the UI and the chain agree.
export function projectNav(s: Snapshot, nowSec: bigint): bigint {
  let nav = 0n;
  for (const p of s.book.pools) nav += projectPoolValue(p, nowSec, s.book.lastTs);
  const unmarked = s.vault.totalIn > s.book.markedIn ? s.vault.totalIn - s.book.markedIn : 0n;
  const unreturned = s.vault.totalOut > s.book.markedOut ? s.vault.totalOut - s.book.markedOut : 0n;
  const total = nav + unmarked;
  return total > unreturned ? total - unreturned : 0n;
}

/// NAV as of a snapshot's own clock, with no forward projection.
///
/// This is what the program computes when it prices a deposit, so reading it off
/// the base layer and off the rollup and comparing the two isolates exactly one
/// thing: yield accrued since the last commit. Comparing raw `book.nav` instead
/// would fold in capital the rollup has not absorbed yet, which is not drift.
export function settledNav(s: Snapshot): bigint {
  const unmarked = s.vault.totalIn > s.book.markedIn ? s.vault.totalIn - s.book.markedIn : 0n;
  const unreturned = s.vault.totalOut > s.book.markedOut ? s.vault.totalOut - s.book.markedOut : 0n;
  const total = s.book.nav + unmarked;
  return total > unreturned ? total - unreturned : 0n;
}

/// Share price with sub-atomic resolution, so the number ticks every second while
/// staying exactly consistent with the integer NAV at commit granularity.
export function sharePriceStr(s: Snapshot, nowSec: bigint, dp = 8): string {
  if (s.vault.shares === 0n) return '1.' + '0'.repeat(dp);
  const K = 1_000_000n;
  let navK = 0n;
  for (const p of s.book.pools) {
    const dt = nowSec > s.book.lastTs ? nowSec - s.book.lastTs : 0n;
    navK += K * (p.principal + p.accrued) + (p.principal * BigInt(p.aprBps) * dt * K) / (BPS * YEAR);
  }
  const unmarked = s.vault.totalIn > s.book.markedIn ? s.vault.totalIn - s.book.markedIn : 0n;
  const unreturned = s.vault.totalOut > s.book.markedOut ? s.vault.totalOut - s.book.markedOut : 0n;
  navK += K * unmarked;
  navK = navK > K * unreturned ? navK - K * unreturned : 0n;

  const scale = 10n ** BigInt(dp);
  const scaled = (navK * scale) / (s.vault.shares * K);
  const int = scaled / scale;
  const frac = (scaled % scale).toString().padStart(dp, '0');
  return int.toString() + '.' + frac;
}

/// The rate agYLD actually grows at: Σ(principal * apr) / NAV. Idle custody drags
/// it down, which is correct: unallocated dollars earn nothing.
export function blendedAprPct(s: Snapshot, nav: bigint): string {
  let num = 0n;
  for (const p of s.book.pools) num += p.principal * BigInt(p.aprBps);
  if (nav === 0n) return '0.00';
  return (Number(num) / Number(nav) / 100).toFixed(2);
}

export function sharesToUsdc(shares: bigint, nav: bigint, supply: bigint): bigint {
  if (supply === 0n) return 0n;
  return (shares * nav) / supply;
}

// ------------------------------------------------------------------ display

export const toUnits = (v: string): bigint => {
  const n = parseFloat(v || '0');
  if (!isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1e6));
};

/// Exact fixed-precision formatting of a 6-decimal amount, never rounding away the
/// yield: 1_000_231 -> "1.000231".
export function amountStr(v: bigint, dp = 6): string {
  const neg = v < 0n;
  const x = neg ? -v : v;
  const int = x / ONE;
  const frac = (x % ONE).toString().padStart(6, '0').slice(0, dp);
  return (neg ? '-' : '') + int.toString() + (dp > 0 ? '.' + frac : '');
}

export const fromUnits = (v: bigint): string => amountStr(v, 2);

export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
