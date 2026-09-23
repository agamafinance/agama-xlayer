// The browser's session key.
//
// A wallet will not sign an Ephemeral Rollup transaction. Phantom inspects the
// blockhash, cannot place it on any cluster it knows, decides the transaction is
// for mainnet and shows a "Network mismatch" panel with no approve button. That is
// not a warning to click through; there is nothing to click.
//
// So the owner authorises a throwaway keypair once, on Solana, inside the same
// transaction as their deposit. That key then signs everything that happens on the
// rollup: the enclave login, the permission, the position marks. The wallet is
// asked exactly once, for the one transaction that actually moves money.
//
// What the key can do: read and re-mark a position. What it cannot do: move a
// single token. Custody, minting and redemption all live on Solana, where only the
// wallet signs. Losing it costs a click to make a new one.
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

/// Mirrors SESSION_TTL in the program. Kept slightly shorter so the client rotates
/// before the chain starts rejecting it.
const TTL_MS = 7 * 24 * 3600 * 1000;
const SKEW_MS = 6 * 3600 * 1000;

const storageKey = (owner: PublicKey) => `agama.magicblock.session.${owner.toBase58()}`;

type Stored = { secret: string; createdAt: number };

function read(owner: PublicKey): Keypair | null {
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return null;
    const { secret, createdAt } = JSON.parse(raw) as Stored;
    if (Date.now() - createdAt > TTL_MS - SKEW_MS) return null;
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    return null;
  }
}

/// The session key for this owner, creating one if there is none or the old one is
/// close enough to expiry that the chain would soon refuse it.
export function sessionKeypair(owner: PublicKey): Keypair {
  const existing = read(owner);
  if (existing) return existing;
  const fresh = Keypair.generate();
  try {
    window.localStorage.setItem(
      storageKey(owner),
      JSON.stringify({ secret: bs58.encode(fresh.secretKey), createdAt: Date.now() } as Stored),
    );
  } catch {
    /* private browsing: the key still works for this page's lifetime */
  }
  return fresh;
}

/// True when the on-chain position already trusts the key this browser holds.
export function sessionMatches(owner: PublicKey, onChain?: PublicKey, expiry?: bigint): boolean {
  if (!onChain || onChain.equals(PublicKey.default)) return false;
  if (expiry !== undefined && Number(expiry) * 1000 < Date.now()) return false;
  return sessionKeypair(owner).publicKey.equals(onChain);
}

export const signWithSession = (kp: Keypair) => async (message: Uint8Array) =>
  nacl.sign.detached(message, kp.secretKey);
