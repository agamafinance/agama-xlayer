'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import clsx from 'clsx';

const EXPLORER = 'https://testnet-explorer.rayls.com';

/// Submit button that wraps a `useWriteContract().writeContract` call.
/// Shows pending → mining → confirmed, briefly flashes a check + explorer
/// link on success, then resets to the idle label.
export function TxButton({
  label,
  pending,
  hash,
  disabled,
  onClick,
  onSuccess,
  variant = 'primary',
  size = 'md',
}: {
  label: string;
  pending?: boolean;
  hash?: `0x${string}` | undefined;
  disabled?: boolean;
  onClick: () => void;
  onSuccess?: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm';
}) {
  const { isLoading: isMining, isSuccess, isError } = useWaitForTransactionReceipt({ hash });
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isSuccess) {
      onSuccess?.();
      setShowSuccess(true);
      window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => setShowSuccess(false), 2400);
    }
    return () => window.clearTimeout(successTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const isBusy = !!pending || isMining;
  const showError = isError && !isBusy && !showSuccess;

  let content: ReactNode = label;
  if (isBusy) content = <Spinner label={pending ? 'Confirm in wallet…' : 'Mining…'} />;
  else if (showSuccess) content = (
    <span className="flex items-center justify-center gap-2">
      <Check />
      <span>Confirmed</span>
    </span>
  );
  else if (showError) content = 'Failed — retry';

  const heightCls = size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-[14px]';

  const variantCls = (() => {
    if (showSuccess) return 'bg-emerald-700 text-white';
    if (showError) return 'bg-rose-100 text-rose-800 border border-rose-300';
    if (variant === 'primary')
      return 'bg-[#254839] text-[#fdf8ed] hover:bg-[#1F3D31] disabled:opacity-40';
    return 'bg-[#254839]/[0.06] text-[#254839] hover:bg-[#254839]/[0.12] disabled:opacity-40 ring-1 ring-[#254839]/15';
  })();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || isBusy}
        onClick={onClick}
        className={clsx(
          'relative w-full rounded-full px-5 font-medium transition-colors disabled:cursor-not-allowed',
          heightCls,
          variantCls,
        )}
      >
        {content}
      </button>
      {hash && (isBusy || showSuccess) && (
        <a
          href={`${EXPLORER}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-center text-[11px] text-fg-muted hover:text-fg"
        >
          {hash.slice(0, 10)}…{hash.slice(-6)} ↗
        </a>
      )}
    </div>
  );
}

function Spinner({ label }: { label: string }): ReactNode {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>{label}</span>
    </span>
  );
}

function Check(): ReactNode {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
