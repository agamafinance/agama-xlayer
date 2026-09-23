'use client';

import { Connection, PublicKey } from '@solana/web3.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOOK_PDA } from './config';
import { erConnection } from './actions';
import {
  baseConnection,
  erEndpoint,
  readBalances,
  readSnapshot,
  type Snapshot,
} from './agama';

/// Reads both layers at once.
///
/// The base connection is polled slowly, because it only changes when the ER
/// commits. The ER connection is polled fast, because that is where the book
/// actually moves. Everything downstream just consumes `er ?? base`.
export function useAgama(owner?: PublicKey) {
  const base = useMemo(() => baseConnection(), []);
  const [baseSnap, setBaseSnap] = useState<Snapshot | null>(null);
  const [erSnap, setErSnap] = useState<Snapshot | null>(null);
  const [erUrl, setErUrl] = useState<string | null>(null);
  const [bal, setBal] = useState({ usdc: 0n, agyld: 0n });
  const erConn = useRef<Connection | null>(null);

  const loadBase = useCallback(async () => {
    try {
      setBaseSnap(await readSnapshot(base, 'base'));
    } catch {
      /* transient RPC noise */
    }
  }, [base]);

  const loadBalances = useCallback(async () => {
    if (!owner) return setBal({ usdc: 0n, agyld: 0n });
    try {
      setBal(await readBalances(base, owner));
    } catch {
      /* ignore */
    }
  }, [base, owner]);

  // Where does the book live right now? Ask the router, never assume.
  useEffect(() => {
    let alive = true;
    const resolve = async () => {
      const url = await erEndpoint(BOOK_PDA);
      if (!alive) return;
      setErUrl(url);
      erConn.current = url ? erConnection(url) : null;
      if (!url) setErSnap(null);
    };
    resolve();
    const t = setInterval(resolve, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    loadBase();
    const t = setInterval(loadBase, 15_000);
    return () => clearInterval(t);
  }, [loadBase]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // The live side. 3s is plenty: the client projects yield forward between reads
  // with the same formula the program uses, so the number ticks every second
  // without hammering the ER.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const c = erConn.current;
      if (!c) return;
      try {
        const s = await readSnapshot(c, 'er');
        if (alive && s) setErSnap(s);
      } catch {
        /* ER can drop a read while committing */
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [erUrl]);

  return {
    base,
    baseSnap,
    erSnap,
    erUrl,
    erConn: erConn.current,
    /// The book as the protocol currently knows it: the rollup when delegated,
    /// Solana otherwise.
    live: erSnap ?? baseSnap,
    bal,
    reload: async () => {
      await Promise.all([loadBase(), loadBalances()]);
    },
  };
}

/// A 1 s clock, seeded only after mount so the server-rendered HTML and the first
/// client render agree.
export function useClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
