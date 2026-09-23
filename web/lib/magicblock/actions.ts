// Every transaction Agama sends, and which layer it belongs on.
//
// Getting this wrong is the classic MagicBlock bug, so it is stated once, here:
//
//   base layer   faucet, deposit, redeem, init_position, delegate_position
//   ephemeral    init_permission, sync_position, undelegate_position
//
// Delegation itself always runs on base. Anything that writes a delegated account
// always runs on the ER. The router tells us which ER.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  AGYLD_MINT,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  BOOK_PDA,
  DELEGATION_PROGRAM_ID,
  EPHEMERAL_VAULT_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TEE_VALIDATOR,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
  VAULT_PDA,
  VAULT_USDC,
  ata,
  claimPda,
  permissionPda,
  positionPda,
} from './config';
import { concat, instruction, u64, vecPubkey } from './anchor-lite';

const utf8 = (s: string) => new TextEncoder().encode(s);

/// Scratch account the delegation program copies the PDA through. Derived under
/// *our* program, not the delegation program.
const bufferPda = (account: PublicKey) =>
  PublicKey.findProgramAddressSync([utf8('buffer'), account.toBytes()], PROGRAM_ID)[0];

const delegationRecordPda = (account: PublicKey) =>
  PublicKey.findProgramAddressSync([utf8('delegation'), account.toBytes()], DELEGATION_PROGRAM_ID)[0];

const delegationMetadataPda = (account: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [utf8('delegation-metadata'), account.toBytes()],
    DELEGATION_PROGRAM_ID,
  )[0];

// ---------------------------------------------------------------- base layer

export function faucetIx(user: PublicKey): TransactionInstruction {
  return instruction('faucet', {
    user,
    vault: VAULT_PDA,
    claim: claimPda(user),
    usdc_mint: USDC_MINT,
    user_usdc: ata(USDC_MINT, user),
    token_program: TOKEN_PROGRAM_ID,
    associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    system_program: SYSTEM_PROGRAM_ID,
  });
}

export function depositIx(user: PublicKey, amount: bigint): TransactionInstruction {
  return instruction(
    'deposit',
    {
      user,
      vault: VAULT_PDA,
      book: BOOK_PDA,
      usdc_mint: USDC_MINT,
      agyld_mint: AGYLD_MINT,
      user_usdc: ata(USDC_MINT, user),
      user_agyld: ata(AGYLD_MINT, user),
      vault_usdc: VAULT_USDC,
      token_program: TOKEN_PROGRAM_ID,
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SYSTEM_PROGRAM_ID,
    },
    u64(amount),
  );
}

export function redeemIx(user: PublicKey, shares: bigint): TransactionInstruction {
  return instruction(
    'redeem',
    {
      user,
      vault: VAULT_PDA,
      book: BOOK_PDA,
      usdc_mint: USDC_MINT,
      agyld_mint: AGYLD_MINT,
      user_usdc: ata(USDC_MINT, user),
      user_agyld: ata(AGYLD_MINT, user),
      vault_usdc: VAULT_USDC,
      token_program: TOKEN_PROGRAM_ID,
    },
    u64(shares),
  );
}

/// Top the position and the owner's agYLD account up to the rollup's clone floor.
/// Without it, the first enclave transaction dies on
/// `Failed to clone regular account ... InsufficientFundsForRent`.
export function prepareForRollupIx(owner: PublicKey): TransactionInstruction {
  return instruction('prepare_for_rollup', {
    owner,
    position: positionPda(owner),
    owner_agyld: ata(AGYLD_MINT, owner),
    agyld_mint: AGYLD_MINT,
    vault: VAULT_PDA,
    system_program: SYSTEM_PROGRAM_ID,
  });
}

/// Let a browser-held key act on this position inside the rollup. Base layer, so
/// the wallet signs it, and it rides in the same transaction as the deposit.
export function authorizeSessionIx(
  owner: PublicKey,
  sessionKey: PublicKey,
): TransactionInstruction {
  return instruction(
    'authorize_session',
    { owner, position: positionPda(owner) },
    sessionKey.toBytes(),
  );
}

export function initPositionIx(owner: PublicKey): TransactionInstruction {
  return instruction('init_position', {
    owner,
    vault: VAULT_PDA,
    position: positionPda(owner),
    system_program: SYSTEM_PROGRAM_ID,
  });
}

/// Hands the position to the TEE validator. After this it is no longer writable on
/// Solana, which is exactly the point.
export function delegatePositionIx(owner: PublicKey): TransactionInstruction {
  const position = positionPda(owner);
  return instruction('delegate_position', {
    owner,
    buffer_position: bufferPda(position),
    delegation_record_position: delegationRecordPda(position),
    delegation_metadata_position: delegationMetadataPda(position),
    position,
    validator: TEE_VALIDATOR,
    owner_program: PROGRAM_ID,
    delegation_program: DELEGATION_PROGRAM_ID,
    system_program: SYSTEM_PROGRAM_ID,
  });
}

// ------------------------------------------------------------ ephemeral rollup

/// Gate the position behind an EphemeralPermission. `viewers` are admitted
/// alongside the owner: an auditor, a fund administrator. Empty means owner-only.
export function initPermissionIx(
  owner: PublicKey,
  signer: PublicKey,
  viewers: PublicKey[],
): TransactionInstruction {
  const position = positionPda(owner);
  return instruction(
    'init_permission',
    {
      signer,
      position,
      permission: permissionPda(position),
      permission_program: PERMISSION_PROGRAM_ID,
      ephemeral_vault: EPHEMERAL_VAULT_ID,
      magic_program: MAGIC_PROGRAM_ID,
    },
    vecPubkey(viewers),
  );
}

export function setPermissionIx(
  owner: PublicKey,
  signer: PublicKey,
  isPrivate: boolean,
  viewers: PublicKey[],
): TransactionInstruction {
  const position = positionPda(owner);
  return instruction(
    'set_permission',
    {
      signer,
      position,
      permission: permissionPda(position),
      permission_program: PERMISSION_PROGRAM_ID,
      ephemeral_vault: EPHEMERAL_VAULT_ID,
      magic_program: MAGIC_PROGRAM_ID,
    },
    concat(Uint8Array.from([isPrivate ? 1 : 0]), vecPubkey(viewers)),
  );
}

/// Recompute the position inside the enclave from on-chain inputs only.
/// Drop the gate and refund its rent to the position. Do this before undelegating:
/// the rent is held by the ephemeral vault, and a position that leaves the rollup
/// with its permission still open cannot fund a new one when it comes back.
export function closePermissionIx(owner: PublicKey, signer: PublicKey): TransactionInstruction {
  const position = positionPda(owner);
  return instruction('close_permission', {
    signer,
    position,
    permission: permissionPda(position),
    permission_program: PERMISSION_PROGRAM_ID,
    ephemeral_vault: EPHEMERAL_VAULT_ID,
    magic_program: MAGIC_PROGRAM_ID,
  });
}

export function syncPositionIx(owner: PublicKey, signer: PublicKey): TransactionInstruction {
  return instruction('sync_position', {
    signer,
    position: positionPda(owner),
    owner,
    vault: VAULT_PDA,
    book: BOOK_PDA,
    owner_agyld: ata(AGYLD_MINT, owner),
  });
}

export function undelegatePositionIx(owner: PublicKey): TransactionInstruction {
  return instruction('undelegate_position', {
    payer: owner,
    position: positionPda(owner),
    owner,
    magic_program: MAGIC_PROGRAM_ID,
    magic_context: MAGIC_CONTEXT_ID,
  });
}

/// Send a rollup transaction signed by the session key. No wallet, no popup, and
/// no chance of the wallet picking the wrong endpoint.
export async function sendWithSession(
  connection: Connection,
  session: Keypair,
  ixs: TransactionInstruction[],
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = session.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(session);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  // The query-filtering service does not proxy the websocket methods
  // `confirmTransaction` needs, so poll instead of subscribing.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const st = (await connection.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error(`rollup transaction failed: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') return sig;
  }
  throw new Error('rollup transaction was not confirmed in time');
}

/// Poll until an on-chain value changes, so the UI can settle itself after a tx
/// without asking the user to reload. Returns false on timeout.
export async function waitFor(
  probe: () => Promise<boolean>,
  { tries = 20, delayMs = 1500 } = {},
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      if (await probe()) return true;
    } catch {
      /* keep polling */
    }
  }
  return false;
}

/// Connection to the rollup an account currently lives on, authenticated when that
/// rollup gates writes. Built per call because a re-delegation can move an account
/// to a different validator.
export { rollupConnection } from './auth';

/// Read-only connection to a rollup. Enough for public state; a private position
/// needs `rollupConnection` with the owner's signature.
export function erConnection(url: string): Connection {
  const ws = new URL(url);
  ws.protocol = ws.protocol === 'https:' ? 'wss:' : 'ws:';
  if (ws.port) ws.port = String(Number(ws.port) + 1);
  return new Connection(url, { commitment: 'confirmed', wsEndpoint: ws.toString() });
}
