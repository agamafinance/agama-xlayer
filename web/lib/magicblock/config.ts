import { PublicKey } from '@solana/web3.js';
import idl from './idl.json';

/// Solana devnet, reached through MagicBlock's RPC. Everything public lives here:
/// the agYLD mint, USDC custody, deposits and redemptions.
export const BASE_RPC = 'https://rpc.magicblock.app/devnet';

/// The router answers one question: which Ephemeral Rollup is a delegated account
/// currently running on. Never hardcode an ER endpoint, ask this instead.
export const ROUTER_RPC = 'https://devnet-router.magicblock.app/';

/// Two validators, because the two halves of the protocol want different things.
///
/// The lending book is public state (pool marks, APRs and NAV are things Agama
/// publishes) so it runs on an open devnet rollup. Per-depositor positions are
/// not public, so they are delegated to the TEE validator instead.
///
/// Writing to the devnet TEE is token-gated by MagicBlock; reads are open. Until a
/// token is issued, the privacy flow runs against the local stack.
export const ER_VALIDATOR = new PublicKey('MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e');
export const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');

export const PROGRAM_ID = new PublicKey(idl.address);
export const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
export const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111');
export const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111');
export const PERMISSION_PROGRAM_ID = new PublicKey('ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1');
export const EPHEMERAL_VAULT_ID = new PublicKey('MagicVau1t999999999999999999999999999999999');

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

const seed = (s: string) => new TextEncoder().encode(s);

export const [VAULT_PDA] = PublicKey.findProgramAddressSync([seed('agama-vault')], PROGRAM_ID);
export const [BOOK_PDA] = PublicKey.findProgramAddressSync(
  [seed('lending-book'), VAULT_PDA.toBytes()],
  PROGRAM_ID,
);
export const [USDC_MINT] = PublicKey.findProgramAddressSync([seed('usdc-mint')], PROGRAM_ID);
export const [AGYLD_MINT] = PublicKey.findProgramAddressSync([seed('agyld-mint')], PROGRAM_ID);

/// Bumped with the layout when positions gained a session key. Old positions on
/// devnet are delegated and cannot be resized from the base layer, so they stay
/// where they are and new ones are created here.
export const positionPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([seed('position-v2'), owner.toBytes()], PROGRAM_ID)[0];

export const claimPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([seed('faucet-claim'), owner.toBytes()], PROGRAM_ID)[0];

/// Note the colon: the SDK's `PERMISSION_SEED` is literally `b"permission:"`.
/// Dropping it derives a valid-looking PDA that the program rejects with a seeds
/// constraint violation (Anchor error 2006).
export const permissionPda = (account: PublicKey) =>
  PublicKey.findProgramAddressSync([seed('permission:'), account.toBytes()], PERMISSION_PROGRAM_ID)[0];

/// Associated token account, derived the standard way so we never need spl-token
/// in the browser bundle.
export const ata = (mint: PublicKey, owner: PublicKey, allowOffCurve = false) =>
  PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

export const VAULT_USDC = ata(USDC_MINT, VAULT_PDA, true);

/// Product framing for the four pools. APR and principal are read live on-chain;
/// only the labels live here.
export const POOL_LABELS = [
  { label: 'Pool A', sector: 'Private credit' },
  { label: 'Pool B', sector: 'Tokenized treasuries' },
  { label: 'Pool C', sector: 'Bonds' },
  { label: 'Pool D', sector: 'Onchain RWA yield' },
];

/// Lamports an account must hold before a rollup will clone it. Empirical, and
/// mirrored from ROLLUP_CLONE_FLOOR in the program.
export const ROLLUP_CLONE_FLOOR = 30_000_000;

export const EXPLORER = 'https://explorer.solana.com';
export const explorerTx = (sig: string) => `${EXPLORER}/tx/${sig}?cluster=devnet`;
export const explorerAcc = (a: string) => `${EXPLORER}/address/${a}?cluster=devnet`;
