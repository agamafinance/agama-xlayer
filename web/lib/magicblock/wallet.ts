// Dependency-free Solana wallet connector.
//
// Talks straight to the injected provider (Phantom, Solflare, Backpack), which is
// what @solana/wallet-adapter does under the hood anyway, minus its bundle and its
// React context tree. Same call the Starknet connector makes.
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

export type SolanaProvider = any;

export type WalletKind = {
  key: string;
  label: string;
  icon?: string;
  install: string;
};

/// The wallets we know how to name and where to send someone who lacks one.
/// `solana` is the catch-all for anything that injects the legacy provider.
export const KNOWN_WALLETS: (WalletKind & { path: (w: any) => any })[] = [
  {
    key: 'phantom',
    label: 'Phantom',
    icon: '/wallets/phantom.png',
    install: 'https://phantom.com/download',
    path: (w) => w.phantom?.solana,
  },
  {
    key: 'solflare',
    label: 'Solflare',
    icon: '/wallets/solflare.png',
    install: 'https://solflare.com/download',
    path: (w) => w.solflare,
  },
  {
    key: 'backpack',
    label: 'Backpack',
    icon: '/wallets/backpack.png',
    install: 'https://backpack.app/download',
    path: (w) => w.backpack,
  },
  {
    key: 'solana',
    label: 'Injected wallet',
    install: 'https://solana.com/ecosystem/explore?categories=wallet',
    path: (w) => w.solana,
  },
];

const CANDIDATES = KNOWN_WALLETS;

function looksLikeWallet(o: any): boolean {
  return !!o && typeof o === 'object' && typeof o.connect === 'function';
}

export type DetectedWallet = WalletKind & { provider: SolanaProvider };

export function detectWallets(): DetectedWallet[] {
  if (typeof window === 'undefined') return [];
  const w = window as any;
  const seen = new Set<any>();
  const out: DetectedWallet[] = [];
  for (const c of CANDIDATES) {
    let p: any;
    try {
      p = c.path(w);
    } catch {
      continue;
    }
    // Wallets often alias themselves onto window.solana as well, so dedupe by
    // provider object rather than by key.
    if (!looksLikeWallet(p) || seen.has(p)) continue;
    seen.add(p);
    out.push({ key: c.key, label: c.label, icon: c.icon, install: c.install, provider: p });
  }
  return out;
}

/// Injection can lag page load by a beat, so retry briefly before giving up.
export async function detectWalletsWithRetry(tries = 4, delayMs = 300) {
  for (let i = 0; i < tries; i++) {
    const found = detectWallets();
    if (found.length > 0) return found;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return [];
}

export async function connectProvider(p: SolanaProvider): Promise<PublicKey | null> {
  const res = await p.connect();
  const key = res?.publicKey ?? p.publicKey;
  return key ? new PublicKey(key.toString()) : null;
}

/// Ask the wallet to sign an arbitrary message. Used to log in to a private
/// rollup; wallets return either a raw Uint8Array or `{ signature }`.
export async function signMessageWith(
  provider: SolanaProvider,
  message: Uint8Array,
): Promise<Uint8Array> {
  if (typeof provider.signMessage !== 'function') {
    throw new Error('this wallet cannot sign messages, which private positions require');
  }
  const res = await provider.signMessage(message, 'utf8');
  return res?.signature ?? res;
}

/// Build, sign, and submit ourselves.
///
/// Deliberately never `signAndSendTransaction`. That call looks like it submits to
/// the connection you hand the wallet, and it does not: the connection object never
/// reaches the wallet at all, and Phantom submits to its own RPC for whichever
/// cluster the user has selected. For a rollup transaction that means it goes to
/// Solana instead of the rollup, where the accounts are delegated and it cannot
/// land, while the wallet still hands back a signature as if it had worked.
///
/// `signTransaction` keeps the approval popup and leaves the endpoint to us, which
/// is the only way an ER transaction reaches the ER.
export async function sendIxs(
  provider: SolanaProvider,
  connection: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  opts: { skipPreflight?: boolean } = {},
): Promise<string> {
  if (typeof provider.signTransaction !== 'function') {
    throw new Error('this wallet cannot sign a transaction without also submitting it');
  }
  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

  const signed = await provider.signTransaction(tx);
  return connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: opts.skipPreflight ?? false,
  });
}
