// Thin Soroban RPC layer: read-only view calls via simulation, and signed
// contract invocations via a wallet-provided signer (Freighter).
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { STELLAR, STELLAR_DECIMALS } from './config';

function server() {
  return new rpc.Server(STELLAR.rpcUrl);
}

// ---- amount helpers (7 decimals) ----
export function toBaseUnits(human: string | number): bigint {
  const s = String(human).trim();
  if (!s) return 0n;
  const [whole = '0', frac = ''] = s.replace(/,/g, '').split('.');
  const padded = (frac + '0'.repeat(STELLAR_DECIMALS)).slice(0, STELLAR_DECIMALS);
  return BigInt(whole || '0') * 10n ** BigInt(STELLAR_DECIMALS) + BigInt(padded || '0');
}

export function fromBaseUnits(v: bigint | undefined, precision = 2): string {
  if (v === undefined) return '—';
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(STELLAR_DECIMALS);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(STELLAR_DECIMALS, '0').slice(0, precision);
  const wholeStr = whole.toLocaleString('en-US');
  const out = precision > 0 ? `${wholeStr}.${fracStr}` : wholeStr;
  return neg ? `-${out}` : out;
}

// ---- ScVal helpers ----
export const addr = (a: string): xdr.ScVal => new Address(a).toScVal();
export const i128 = (v: bigint): xdr.ScVal => nativeToScVal(v, { type: 'i128' });

/** Read-only view call: build → simulate → decode return value to a native JS value. */
export async function readContract<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const srv = server();
  // Simulation does not need a real/funded source; any valid account works.
  const source = new Account(STELLAR.admin, '0');
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.passphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await srv.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate ${method} failed: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  if (!retval) throw new Error(`simulate ${method}: no return value`);
  return scValToNative(retval) as T;
}

/** Signed write call. Returns the transaction hash once the tx is applied. */
export async function invokeContract(opts: {
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
  publicKey: string;
  signXDR: (xdr: string, networkPassphrase: string) => Promise<string>;
}): Promise<string> {
  const srv = server();
  const account = await srv.getAccount(opts.publicKey);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.passphrase,
  })
    .addOperation(new Contract(opts.contractId).call(opts.method, ...(opts.args ?? [])))
    .setTimeout(120)
    .build();

  // prepareTransaction simulates + attaches Soroban auth and resource fees.
  const prepared = await srv.prepareTransaction(built);
  const signedXdr = await opts.signXDR(prepared.toXDR(), STELLAR.passphrase);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR.passphrase);

  const sent = await srv.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);
  }

  return waitForTx(srv, sent.hash);
}

async function waitForTx(srv: rpc.Server, hash: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const got = await srv.getTransaction(hash);
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (got.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`tx ${hash} failed`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`tx ${hash} not confirmed in time`);
}

/** Classic ChangeTrust op: open a trustline to the real Circle USDC so the
 *  account can receive it (required before using faucet.circle.com). */
export async function addUsdcTrustline(opts: {
  publicKey: string;
  signXDR: (xdr: string, networkPassphrase: string) => Promise<string>;
}): Promise<string> {
  const srv = server();
  const account = await srv.getAccount(opts.publicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset('USDC', STELLAR.usdcIssuer) }))
    .setTimeout(120)
    .build();
  const signedXdr = await opts.signXDR(tx.toXDR(), STELLAR.passphrase);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR.passphrase);
  const sent = await srv.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);
  }
  return waitForTx(srv, sent.hash);
}
