// Depositing privately, as one action.
//
// Underneath there are five on-chain steps and they cannot be collapsed into one
// transaction, because three of them belong on Solana and two belong inside the
// enclave, and the enclave will not accept the account until Solana has handed it
// over. What *can* be collapsed is the asking: the user says "private" once, and
// the client does the sequencing.
//
//   base tx    deposit, open the ledger, pay its clone rent, delegate it
//   sign       a login challenge for the enclave (a message, not a transaction)
//   rollup tx  gate the ledger, then mark it
//
// So: two signatures and one signed message, instead of five buttons. Every step
// is skipped when it has already been done, which is what makes a second deposit
// a single transaction.
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { AGYLD_MINT, ROLLUP_CLONE_FLOOR, ata, positionPda } from './config';
import {
  authorizeSessionIx,
  delegatePositionIx,
  depositIx,
  initPermissionIx,
  initPositionIx,
  prepareForRollupIx,
  syncPositionIx,
} from './actions';
import { sessionKeypair, sessionMatches } from './session';
import { decodePosition, delegationStatus } from './agama';

export type PrivacyPlan = {
  /// Already open, funded, delegated, gated? Each one we can skip.
  hasLedger: boolean;
  funded: boolean;
  delegated: boolean;
  gated: boolean;
  /// Does the position already trust the key this browser holds?
  sessionAuthorized: boolean;
  /// True when a deposit alone is enough because the ledger is already set up.
  ready: boolean;
};

/// What is already done, so the flow only asks for what is missing.
export async function readPrivacyPlan(
  connection: Connection,
  owner: PublicKey,
): Promise<PrivacyPlan> {
  const pda = positionPda(owner);
  const [acc, status] = await Promise.all([
    connection.getAccountInfo(pda),
    delegationStatus(pda),
  ]);
  const hasLedger = !!acc;
  const delegated = !!(status?.isDelegated ?? status?.delegationRecord);
  // A delegated account reports its base-layer lamports, which is what the rollup
  // charges against, so this stays meaningful after delegation.
  const funded = (acc?.lamports ?? 0) >= ROLLUP_CLONE_FLOOR;
  // `is_private` is the program's own mirror of the permission existing.
  const decoded = hasLedger ? decodePosition(acc!.data) : null;
  const gated = decoded?.isPrivate ?? false;
  const sessionAuthorized = decoded
    ? sessionMatches(owner, decoded.sessionKey, decoded.sessionExpiry)
    : false;
  return {
    hasLedger,
    funded,
    delegated,
    gated,
    sessionAuthorized,
    ready: hasLedger && funded && delegated && gated && sessionAuthorized,
  };
}

/// The Solana leg. One transaction: the deposit plus whatever setup is missing.
export function privateDepositBaseIxs(
  owner: PublicKey,
  amount: bigint,
  plan: PrivacyPlan,
): TransactionInstruction[] {
  const ixs: TransactionInstruction[] = [];
  if (amount > 0n) ixs.push(depositIx(owner, amount));
  if (!plan.hasLedger) ixs.push(initPositionIx(owner));
  // Funding has to precede delegation: once the account belongs to the delegation
  // program, `prepare_for_rollup` can no longer be the one to top it up.
  if (!plan.funded) ixs.push(prepareForRollupIx(owner));
  // Authorising the session key also has to happen before delegation, and it is
  // what buys the whole flow down to a single wallet approval.
  if (!plan.sessionAuthorized) {
    ixs.push(authorizeSessionIx(owner, sessionKeypair(owner).publicKey));
  }
  if (!plan.delegated) ixs.push(delegatePositionIx(owner));
  return ixs;
}

/// The enclave leg, sent after the base transaction has settled.
export function privateDepositRollupIxs(
  owner: PublicKey,
  plan: PrivacyPlan,
): TransactionInstruction[] {
  const signer = sessionKeypair(owner).publicKey;
  const ixs: TransactionInstruction[] = [];
  if (!plan.gated) ixs.push(initPermissionIx(owner, signer, []));
  ixs.push(syncPositionIx(owner, signer));
  return ixs;
}

/// Does the owner hold any agYLD? `sync_position` reads that account, so it has to
/// exist, which it will not for someone who has never deposited.
export const agyldAta = (owner: PublicKey) => ata(AGYLD_MINT, owner);
