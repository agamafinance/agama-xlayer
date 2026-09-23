'use client';

import { useState } from 'react';
import clsx from 'clsx';

/// Async action button for Stellar/Soroban txs. Runs `action` (build → sign via
/// Freighter → submit → poll), surfacing pending/success/error states. Mirrors
/// the EVM TxButton visual language.
export function StellarTxButton({
  label,
  action,
  onSuccess,
  disabled,
  variant = 'primary',
}: {
  label: string;
  action: () => Promise<string>;
  onSuccess?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await action();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={run}
        className={clsx(
          'h-11 w-full rounded-full text-[14px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          variant === 'primary'
            ? 'bg-[#254839] text-[#fdf8ed] hover:bg-[#1F3D31]'
            : 'bg-[#254839]/[0.08] text-[#254839] hover:bg-[#254839]/[0.16]'
        )}
      >
        {pending ? 'Confirming…' : label}
      </button>
      {error && (
        <span className="mt-1.5 text-[11px] text-[#9b2c2c] break-words" title={error}>
          {error.length > 90 ? error.slice(0, 90) + '…' : error}
        </span>
      )}
    </div>
  );
}
