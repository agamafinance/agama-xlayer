// Logging in to a private rollup.
//
// MagicBlock's private endpoints (devnet's TEE rollup, and the local stack's
// query-filtering service) sit behind a service that gates *writes*. Reads are
// open, which is why a half-wired client looks healthy until the first
// transaction and then fails with `401 Missing token query param`, an error that
// says nothing about how to fix it.
//
// The fix is a 30-day JWT, minted by signing a challenge with the same wallet that
// will sign the transactions. It is self-serve: no API key, no allowlist. And it
// proves exactly one thing, which pubkey you are. Whether the rollup then shows
// you an account, or accepts your transaction, is still decided by the on-chain
// EphemeralPermission. Endpoint auth and authorization are two separate layers.
import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';

type Token = { token: string; expiresAt: number };

/// One token per (endpoint, pubkey). Kept in memory: a page reload costs one
/// extra wallet signature, which is cheaper than reasoning about a cached
/// credential in localStorage.
const cache = new Map<string, Token>();

export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export async function getQfsToken(
  rpcUrl: string,
  publicKey: PublicKey,
  signMessage: SignMessage,
): Promise<string> {
  const base = rpcUrl.replace(/\/$/, '');
  const key = `${base}|${publicKey.toBase58()}`;
  const hit = cache.get(key);
  // Refresh a minute early rather than racing the expiry.
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const challengeRes = await fetch(`${base}/auth/challenge?pubkey=${publicKey.toBase58()}`);
  const { challenge, error } = await challengeRes.json();
  if (error) throw new Error(`challenge refused: ${error}`);
  if (typeof challenge !== 'string' || !challenge) throw new Error('no challenge received');

  const signature = await signMessage(new TextEncoder().encode(challenge));

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pubkey: publicKey.toBase58(),
      challenge,
      signature: bs58.encode(signature),
    }),
  });
  const body = await loginRes.json();
  if (loginRes.status !== 200) throw new Error(`login refused: ${body?.error ?? loginRes.status}`);
  if (!body?.token) throw new Error('no token received');

  const token: Token = {
    token: body.token,
    expiresAt: body.expiresAt ?? Date.now() + 30 * 24 * 3600 * 1000,
  };
  cache.set(key, token);
  return token.token;
}

/// Does this endpoint gate writes? Open rollups have no `/auth/challenge`.
export async function isGated(rpcUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${rpcUrl.replace(/\/$/, '')}/auth/challenge?pubkey=11111111111111111111111111111111`);
    return res.ok;
  } catch {
    return false;
  }
}

/// A connection to a rollup, carrying a token when that rollup wants one. The
/// token goes on the websocket URL too, because a websocket cannot send headers.
export async function rollupConnection(
  rpcUrl: string,
  publicKey?: PublicKey,
  signMessage?: SignMessage,
): Promise<Connection> {
  const http = new URL(rpcUrl);
  const ws = new URL(rpcUrl);
  ws.protocol = ws.protocol === 'https:' ? 'wss:' : 'ws:';
  // The hosted rollups serve both on one port; the local stack uses port + 1.
  if (ws.port) ws.port = String(Number(ws.port) + 1);

  if (publicKey && signMessage && (await isGated(rpcUrl))) {
    const token = await getQfsToken(rpcUrl, publicKey, signMessage);
    http.searchParams.set('token', token);
    ws.searchParams.set('token', token);
  }
  return new Connection(http.toString(), {
    commitment: 'confirmed',
    wsEndpoint: ws.toString(),
  });
}
