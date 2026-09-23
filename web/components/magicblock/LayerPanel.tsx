'use client';

import { ExternalLink } from 'lucide-react';
import { amountStr, projectNav, settledNav, type Snapshot } from '@/lib/magicblock/agama';
import { BOOK_PDA, explorerAcc } from '@/lib/magicblock/config';

// The architecture, made legible.
//
// Two reads of the same lending book: one from Solana, which only moves when the
// ER commits, and one from the Ephemeral Rollup, which moves every tick. The gap
// between them is not a bug to hide, it is the whole reason the book is delegated,
// so it gets its own panel.
export default function LayerPanel({
  base,
  er,
  erUrl,
  now,
}: {
  base: Snapshot | null;
  er: Snapshot | null;
  erUrl: string | null;
  now: number;
}) {
  const nowB = BigInt(now || 0);
  const baseNav = base ? settledNav(base) : 0n;
  const erNav = er ? projectNav(er, nowB) : null;
  const drift = erNav !== null && erNav > baseNav ? erNav - baseNav : 0n;
  const ticks = er?.book.ticks ?? base?.book.ticks ?? 0n;
  const lastCommit = base ? Number(base.book.lastTs) : 0;

  return (
    <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[#254839]/[0.06] px-3 py-1.5 text-[13px] font-medium text-fg">
          Where the state lives
        </span>
        <a
          href={explorerAcc(BOOK_PDA.toBase58())}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg"
        >
          Pool book <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Layer
          tag="Solana devnet"
          sub="settled"
          value={`${amountStr(baseNav, 6)} USDC`}
          detail={
            lastCommit > 0
              ? `last commit ${new Date(lastCommit * 1000).toLocaleTimeString()}`
              : 'awaiting first commit'
          }
        />
        <Layer
          tag="Ephemeral Rollup"
          sub="live"
          accent
          value={erNav !== null ? `${amountStr(erNav, 6)} USDC` : '—'}
          detail={erUrl ? `${ticks.toString()} ticks · ${new URL(erUrl).host}` : 'not delegated yet'}
        />
      </div>

      <div className="mt-4 border-t border-[#254839]/10 pt-3 text-[13px] text-fg-muted">
        {erNav === null ? (
          <>
            The lending book has not been delegated yet, so Solana is the only copy and yield accrues
            per block.
          </>
        ) : (
          <>
            <span className="text-fg tabular-nums">+{amountStr(drift, 6)} USDC</span> of yield has
            accrued on the rollup since the last commit. A deposit landing right now prices on the
            settled figure, which already counts dollars sitting in custody that the rollup has not
            marked into a pool yet, so the two layers never disagree about what a share is worth.
          </>
        )}
      </div>
    </div>
  );
}

function Layer({
  tag,
  sub,
  value,
  detail,
  accent,
}: {
  tag: string;
  sub: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? 'rounded-2xl bg-[#254839] p-4 text-[#fdf8ed]'
          : 'rounded-2xl border border-[#254839]/12 bg-white/60 p-4'
      }
    >
      <div className={accent ? 'text-[12px] text-[#fdf8ed]/70' : 'text-[12px] text-fg-muted'}>
        {tag} · {sub}
      </div>
      <div
        className={
          accent
            ? 'mt-1 text-[22px] font-semibold tabular-nums'
            : 'mt-1 text-[22px] font-semibold tabular-nums text-fg'
        }
      >
        {value}
      </div>
      <div className={accent ? 'text-[12px] text-[#fdf8ed]/60' : 'text-[12px] text-fg-muted'}>
        {detail}
      </div>
    </div>
  );
}
