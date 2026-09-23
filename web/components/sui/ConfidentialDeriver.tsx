'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useCurrentAccount, useSuiClient, useSignPersonalMessage } from '@mysten/dapp-kit';
import { fromBase64, toHex } from '@mysten/sui/utils';
import { sha512 } from '@noble/hashes/sha2.js';
import { contra } from '@/lib/sui/contra/client';
import { DiscreteLogTable } from '@/lib/sui/contra/twisted_elgamal';
import { TokenAccount } from '@/lib/sui/contra/token_account';
import { GROUP_ORDER } from '@/lib/sui/contra/ristretto255';
import { useConfidential } from '@/lib/sui/ConfidentialContext';

// Headless: reveals the confidential balances on pages that don't host the full
// flow (e.g. Portfolio). It reads/derives the viewing key and publishes the
// decrypted cagUSD / csagUSD to the shared context, so clicking a masked "****"
// derives-and-reveals in place instead of navigating away.
const CONTRA_PKG = '0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080';
const ACCOUNT_REGISTRY = '0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3';
const TOKEN_REGISTRY = '0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb';
const AGUSD_PKG = '0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab';
const AGUSD_TYPE = `${AGUSD_PKG}::agusd::AGUSD`;
const SAGUSD_TYPE = `${AGUSD_PKG}::sagusd::SAGUSD`;
const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
const WASM_URL = '/contra/contra_bulletproofs_wasm_bg.wasm';

export function ConfidentialDeriver() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signMsg } = useSignPersonalMessage();
  const owner = account?.address ?? '';
  const conf = useConfidential();
  const busyRef = useRef(false);

  const client = useMemo(
    () => (suiClient as any).$extend(contra({ packageConfig: pkgCfg, table: DiscreteLogTable.create(16), wasmUrl: WASM_URL })),
    [suiClient],
  );

  const read = async (s: bigint) => {
    try {
      const bal = await client.contra.getBalance(new TokenAccount(owner, AGUSD_TYPE, pkgCfg, s));
      conf.setCag((Number(bal.balance.amount) / 1e6).toFixed(2));
    } catch { conf.setCag('0.00'); }
    try {
      const bal = await client.contra.getBalance(new TokenAccount(owner, SAGUSD_TYPE, pkgCfg, s));
      conf.setCsag((Number(bal.balance.amount) / 1e6).toFixed(2));
    } catch { conf.setCsag('0.00'); }
  };

  const derive = async (allowSign: boolean) => {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    try {
      const stored = localStorage.getItem(`agama-vk-${owner}`);
      let s: bigint;
      if (stored) {
        s = BigInt(stored);
      } else if (allowSign) {
        const { signature } = await signMsg({ message: new TextEncoder().encode('Agama — confidential viewing key v1') });
        s = BigInt('0x' + toHex(sha512(fromBase64(signature)))) % GROUP_ORDER;
        if (s === 0n) s = 1n;
        try { localStorage.setItem(`agama-vk-${owner}`, s.toString()); } catch { /* ignore */ }
      } else {
        return; // no key yet and not user-initiated — leave masked
      }
      await read(s);
    } catch { /* leave masked on failure */ }
    finally { busyRef.current = false; }
  };

  // Auto-reveal on load if the viewing key is already persisted (no signature).
  useEffect(() => { derive(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [owner]);
  // A masked value was clicked → derive (sign if needed) and reveal.
  useEffect(() => {
    if (conf.deriveNonce > 0) derive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf.deriveNonce]);

  return null;
}
