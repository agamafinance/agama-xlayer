// A 100-line Anchor client, instead of the 400 kB one.
//
// The full @coral-xyz/anchor runtime exists to do two things in a browser: encode
// an instruction from an IDL, and decode an account. Both are mechanical for this
// program's types, and the IDL already ships the 8-byte discriminators, so we do
// them by hand and keep the bundle honest. Same reasoning as lib/starknet/wallet.ts.
import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import idl from './idl.json';
import { PROGRAM_ID } from './config';

type IdlAccount = { name: string; writable?: boolean; signer?: boolean; optional?: boolean };
type IdlIx = { name: string; discriminator: number[]; accounts: IdlAccount[]; args: any[] };

const IXS = new Map<string, IdlIx>((idl.instructions as IdlIx[]).map((i) => [i.name, i]));

/// Anchor's snake_case instruction names, addressed the way the IDL spells them.
export function instruction(
  name: string,
  accounts: Record<string, PublicKey | null>,
  args: Uint8Array = new Uint8Array(),
): TransactionInstruction {
  const ix = IXS.get(name);
  if (!ix) throw new Error(`unknown instruction "${name}"`);

  const keys = ix.accounts.map((a) => {
    const pubkey = accounts[a.name];
    if (!pubkey) {
      // An omitted optional account is expressed as the program id itself, which
      // is how Anchor encodes `Option<Account>` on the wire.
      if (a.optional) return { pubkey: PROGRAM_ID, isSigner: false, isWritable: false };
      throw new Error(`instruction "${name}" is missing account "${a.name}"`);
    }
    return { pubkey, isSigner: !!a.signer, isWritable: !!a.writable };
  });

  const data = new Uint8Array(8 + args.length);
  data.set(Uint8Array.from(ix.discriminator), 0);
  data.set(args, 8);
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: Buffer.from(data) });
}

/// Which accounts an instruction wants, in order. Handy when wiring a new call.
export function accountsOf(name: string): string[] {
  return (IXS.get(name)?.accounts ?? []).map((a) => a.name);
}

// ----------------------------------------------------------------- encoding

export function u64(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

export function bool(v: boolean): Uint8Array {
  return Uint8Array.from([v ? 1 : 0]);
}

/// Borsh `Vec<Pubkey>`: a u32 length followed by the raw 32-byte keys.
export function vecPubkey(keys: PublicKey[]): Uint8Array {
  const out = new Uint8Array(4 + keys.length * 32);
  new DataView(out.buffer).setUint32(0, keys.length, true);
  keys.forEach((k, i) => out.set(k.toBytes(), 4 + i * 32));
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ----------------------------------------------------------------- decoding

/// Sequential little-endian reader over an account's data, positioned past the
/// 8-byte Anchor discriminator.
export class Reader {
  private view: DataView;
  private offset = 8;

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  pubkey(): PublicKey {
    const k = new PublicKey(this.bytes.subarray(this.offset, this.offset + 32));
    this.offset += 32;
    return k;
  }
  u64(): bigint {
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }
  i64(): bigint {
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  u16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  u8(): number {
    return this.view.getUint8(this.offset++);
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  /// Fixed-width UTF-8, right-padded with NULs on chain.
  str(len: number): string {
    const raw = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    return new TextDecoder().decode(raw).replace(/\0+$/, '');
  }
}
