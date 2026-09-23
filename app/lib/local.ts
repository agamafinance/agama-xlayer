"use client";

import {useCallback, useEffect, useState} from "react";

/// Small localStorage-backed state. Used for the two things the chain does not
/// keep and the public RPC cannot be scanned for (it caps `eth_getLogs` at a
/// 100-block range): the stock amount a user deposited, so the position can
/// show how much stock the agents added since, and the last agent action seen
/// while the app was open.
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setValue(raw === null ? initial : (JSON.parse(raw) as T));
    } catch {
      setValue(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const write = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* private mode, ignore */
      }
    },
    [key],
  );

  return [value, write];
}

export type AgentAction = {kind: "rebalance" | "compound"; amount: string; at: number};
