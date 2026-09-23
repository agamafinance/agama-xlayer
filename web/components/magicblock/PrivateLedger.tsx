'use client';

import { useCallback, useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { ChevronDown, ExternalLink, Loader2, Lock } from 'lucide-react';
import clsx from 'clsx';
import {
  erConnection,
  rollupConnection,
  sendWithSession,
  setPermissionIx,
  syncPositionIx,
} from '@/lib/magicblock/actions';
import {
  privateDepositBaseIxs,
  privateDepositRollupIxs,
  readPrivacyPlan,
} from '@/lib/magicblock/private-deposit';
import { amountStr, decodePosition, erEndpoint, shortKey, type PositionState } from '@/lib/magicblock/agama';
import { explorerAcc, positionPda } from '@/lib/magicblock/config';
import { sendIxs } from '@/lib/magicblock/wallet';
import { sessionKeypair, signWithSession } from '@/lib/magicblock/session';
import { useSolanaWallet } from '@/lib/magicblock/WalletProvider';

// The private side of a position, shown next to the deposit card rather than on a
// page of its own. Depositing privately already creates all of this; what is left
// here is what you cannot do in a deposit: read the ledger back, re-mark it, and
// decide who else gets to see it.
/// A user declining a wallet prompt is not an error worth shouting about.
const cancelled = (e: any) => {
  const m = String(e?.message ?? e).toLowerCase();
  return m.includes('cancel') || m.includes('reject') || m.includes('denied') || e?.code === 4001;
};

export default function PrivateLedger({
  base,
  agyld,
  onChange,
}: {
  base: Connection;
  agyld: bigint;
  onChange: () => void;
}) {
  const { address, provider, connect } = useSolanaWallet();
  const [position, setPosition] = useState<PositionState | null>(null);
  const [erUrl, setErUrl] = useState<string | null>(null);
  const [viewer, setViewer] = useState('');
  const [busy, setBusy] = useState<'seal' | 'viewer' | 'sync' | 'unlock' | null>(null);
  const [gated, setGated] = useState(false);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);

  const pda = address ? positionPda(address) : null;

  const refresh = useCallback(async () => {
    if (!address || !pda) return setPosition(null);
    const url = await erEndpoint(pda);
    setErUrl(url);

    // Unauthenticated on purpose. This runs on a timer, and a timer that asks the
    // wallet to sign anything is a timer that harasses the user every tick if they
    // ever decline.
    const conn: Connection = url ? erConnection(url) : base;
    try {
      const acc = await conn.getAccountInfo(pda);
      if (acc) {
        setPosition(decodePosition(acc.data));
        setGated(false);
        return;
      }
      // Delegated but unreadable is exactly what a sealed ledger looks like from
      // outside. Not an error, and not something to prompt about.
      const onBase = await base.getAccountInfo(pda);
      setGated(!!url && !!onBase);
      if (!url && onBase) setPosition(decodePosition(onBase.data));
    } catch {
      setPosition(null);
    }
  }, [address, base, pda]);

  /// Read the sealed ledger as its owner. One signature, cached for the session,
  /// and only ever on an explicit click.
  const unlock = useCallback(async () => {
    if (!address || !provider || !erUrl || !pda) return;
    try {
      setBusy('unlock');
      setStatus('Reading it from the enclave…');
      const kp = sessionKeypair(address);
      const conn = await rollupConnection(erUrl, kp.publicKey, signWithSession(kp));
      const acc = await conn.getAccountInfo(pda);
      if (acc) {
        setPosition(decodePosition(acc.data));
        setGated(false);
        setStatus('');
      } else {
        setStatus('The enclave still will not show this account to you.');
      }
    } catch (e: any) {
      setStatus(cancelled(e) ? 'Sign-in cancelled.' : 'Error: ' + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  }, [address, provider, erUrl, pda]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
  }, [refresh]);

  /// Same flow a private deposit runs, minus the deposit. For a position that was
  /// created publicly and is being sealed after the fact.
  const seal = async () => {
    if (!address || !provider) return connect();
    try {
      setBusy('seal');
      const plan = await readPrivacyPlan(base, address);
      const baseIxs = privateDepositBaseIxs(address, 0n, plan);
      if (baseIxs.length > 0) {
        setStatus('Opening and delegating your ledger…');
        await sendIxs(provider, base, address, baseIxs);
      }
      setStatus('Waiting for the enclave to pick it up…');
      let url = erUrl;
      for (let i = 0; i < 12 && !url; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        url = await erEndpoint(positionPda(address));
      }
      if (!url) throw new Error('the rollup has not taken the ledger yet, try again in a moment');
      // The wallet is done. The session key it just authorised signs the rest.
      const kp = sessionKeypair(address);
      setStatus('Sealing…');
      const conn = await rollupConnection(url, kp.publicKey, signWithSession(kp));
      await sendWithSession(conn, kp, privateDepositRollupIxs(address, plan));
      await new Promise((r) => setTimeout(r, 2500));
      await refresh();
      onChange();
      setStatus('Your position is private.');
    } catch (e: any) {
      setStatus(
        cancelled(e)
          ? 'Cancelled. Your deposit went through; the ledger is not sealed yet.'
          : 'Error: ' + (e?.message || String(e)),
      );
    } finally {
      setBusy(null);
    }
  };

  const onRollup = async (kind: 'viewer' | 'sync', label: string, build: () => any) => {
    if (!address || !provider || !erUrl) return;
    try {
      setBusy(kind);
      setStatus(`${label}…`);
      const kp = sessionKeypair(address);
      const conn = await rollupConnection(erUrl, kp.publicKey, signWithSession(kp));
      await sendWithSession(conn, kp, [build()]);
      await new Promise((r) => setTimeout(r, 2500));
      await refresh();
      setStatus(`${label} confirmed`);
    } catch (e: any) {
      setStatus(cancelled(e) ? 'Cancelled.' : 'Error: ' + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  };

  const viewers = (() => {
    try {
      return viewer.trim() ? [new PublicKey(viewer.trim())] : [];
    } catch {
      return null;
    }
  })();

  const isPrivate = gated || !!position?.isPrivate;

  // Nothing to say to someone who has never deposited: the deposit card above
  // already offers the private path.
  if (!address || (agyld === 0n && !position)) return null;

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#254839]/[0.06] px-3 py-1.5 text-[13px] font-medium text-fg">
            Your position ledger
          </span>
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]',
              isPrivate ? 'bg-[#254839] text-[#fdf8ed]' : 'bg-[#254839]/[0.08] text-fg-muted',
            )}
          >
            {isPrivate && <Lock className="h-3 w-3" />}
            {isPrivate ? 'private' : 'public'}
          </span>
        </div>

        {position ? (
          <div className="mt-5 space-y-2.5">
            <Row label="Marked value" value={`${amountStr(position.valueUsdc, 6)} USDC`} big />
            <Row label="Cost basis" value={`${amountStr(position.costBasis, 6)} USDC`} />
            <Row label="Accrued yield" value={`+${amountStr(position.yieldUsdc, 6)} USDC`} />
            <Row label="Entry price" value={`${amountStr(position.entryPrice, 6)} USDC`} />
            <Row
              label="Last marked"
              value={
                position.syncs > 0
                  ? new Date(Number(position.syncedTs) * 1000).toLocaleTimeString()
                  : 'never'
              }
            />
          </div>
        ) : gated ? (
          <p className="mt-4 text-[14px] text-fg-muted">
            Sealed. The enclave will not hand this ledger to an unauthenticated reader, which is the
            point. Sign in once to read your own.
          </p>
        ) : (
          <p className="mt-4 text-[14px] text-fg-muted">
            Your position is public: anyone can read what you paid and what it has earned. Sealing it
            costs 0.06 SOL of rollup rent, once.
          </p>
        )}

        {gated ? (
          <button
            onClick={unlock}
            disabled={busy === 'unlock'}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#254839] text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] disabled:opacity-45"
          >
            {busy === 'unlock' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Read it from the enclave
          </button>
        ) : !isPrivate ? (
          <button
            onClick={seal}
            disabled={busy === 'seal'}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#254839] text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] disabled:opacity-45"
          >
            {busy === 'seal' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Make this position private
          </button>
        ) : (
          <button
            onClick={() => onRollup('sync', 'Re-mark', () =>
                syncPositionIx(address, sessionKeypair(address).publicKey),
              )}
            disabled={busy === 'sync'}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#254839]/[0.08] text-[14px] font-medium text-fg hover:bg-[#254839]/[0.16] disabled:opacity-45"
          >
            {busy === 'sync' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Re-mark inside the enclave
          </button>
        )}
        {status && <div className="mt-3 text-center text-[13px] text-fg-muted">{status}</div>}

        {pda && (
          <div className="mt-4 border-t border-[#254839]/10 pt-3 text-[12px] text-fg-muted">
            <a
              href={explorerAcc(pda.toBase58())}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-fg"
            >
              {shortKey(pda.toBase58())} <ExternalLink className="h-3 w-3" />
            </a>
            {erUrl && <span> · {new URL(erUrl).host}</span>}
          </div>
        )}
      </div>

      {isPrivate && (
        <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
          <div className="text-[13px] font-medium text-fg">Admit a viewer</div>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            An auditor, a fund administrator, a counterparty doing diligence. The list is absolute:
            whoever is not on it loses access.
          </p>
          <input
            value={viewer}
            onChange={(e) => setViewer(e.target.value)}
            placeholder="Solana address"
            className="mt-3 w-full rounded-xl border border-[#254839]/12 bg-white/60 px-3 py-2.5 text-[14px] text-fg outline-none placeholder:text-fg-muted/50"
          />
          <button
            onClick={() =>
              onRollup('viewer', 'Update permission', () =>
                setPermissionIx(address, sessionKeypair(address).publicKey, true, viewers ?? []),
              )
            }
            disabled={viewers === null || busy === 'viewer'}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#254839] text-[14px] font-medium text-[#fdf8ed] hover:bg-[#1F3D31] disabled:opacity-45"
          >
            {busy === 'viewer' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {viewers === null ? 'Not a valid address' : 'Update permission'}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-2xl bg-[#fdfaf1] px-5 py-3.5 text-left shadow-[0_1px_3px_rgba(20,50,35,0.06)]"
      >
        <span className="text-[13px] font-medium text-fg">What a private position actually hides</span>
        <ChevronDown className={clsx('ml-auto h-4 w-4 text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 rounded-2xl bg-[#fdfaf1] px-6 py-5 text-[13px] text-fg-muted shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
          <p>
            <span className="text-fg">Not your agYLD balance.</span> That is a plain SPL token and
            stays public, which is the point: it keeps composing with the rest of Solana.
          </p>
          <p>
            <span className="text-fg">The shape of the position.</span> What you paid, what it is
            marked at, what it has earned, and who is allowed to look. That ledger is delegated to
            MagicBlock&apos;s TEE validator and gated by an ephemeral permission.
          </p>
          <p>
            Hardware-verified confidentiality (Intel TDX), not zero-knowledge. The trust assumption is
            the enclave and its attestation, not a proof system.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <span className={big ? 'text-[22px] font-semibold tabular-nums text-fg' : 'text-[14px] tabular-nums text-fg'}>
        {value}
      </span>
    </div>
  );
}
