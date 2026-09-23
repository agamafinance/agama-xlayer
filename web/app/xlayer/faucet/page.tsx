'use client';

import { useState } from 'react';
import { parseUnits, type Address } from 'viem';

import { OKB_FAUCET, STOCKS, TOKENS, USDG_DECIMALS } from '@/lib/xlayer/config';
import { erc20Abi, faucet, pub } from '@/lib/xlayer/useXLayer';
import { useXLayerWallet } from '@/lib/xlayer/WalletProvider';

const USDG_AMOUNT = parseUnits('5000', USDG_DECIMALS);
const STOCK_AMOUNT = parseUnits('10', 18);

export default function XLayerFaucetPage() {
  const { address, connect } = useXLayerWallet();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function mint() {
    if (!address) return;
    setBusy(true);
    try {
      // Each wrapper is an ERC-4626 over a base xStock, the token an OKX
      // withdrawal delivers. Hand out both so either path is testable.
      const targets: { label: string; token: Address; amount: bigint }[] = [
        { label: 'USDG', token: TOKENS.USDG, amount: USDG_AMOUNT },
      ];
      for (const s of STOCKS) {
        const wrapper = TOKENS[s.wrapper];
        targets.push({ label: s.wrapper, token: wrapper, amount: STOCK_AMOUNT });
        const base = (await pub
          .readContract({ address: wrapper, abi: erc20Abi, functionName: 'asset' })
          .catch(() => undefined)) as Address | undefined;
        if (base) targets.push({ label: s.wrapper.replace(/^w/, ''), token: base, amount: STOCK_AMOUNT });
      }
      for (const [i, t] of targets.entries()) {
        setStatus(`Minting ${t.label} (${i + 1}/${targets.length})`);
        await faucet(address, t.token, t.amount);
      }
      setStatus('Test tokens received');
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message.split('\n')[0].slice(0, 140) : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto">
          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">Test tokens</h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            X Layer Testnet carries no USDG and no xStocks, so these are faucet stand-ins with the same
            decimals and the same ERC-4626 wrapper shape. The Arrow and Agama contracts are the real
            ones. Gas comes from the{' '}
            <a href={OKB_FAUCET} target="_blank" rel="noreferrer" className="underline">
              OKX X Layer faucet
            </a>
            .
          </p>
        </div>
      </section>

      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[720px]">
          <div className="rounded-2xl bg-[#fdfaf1] p-6 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <h2 className="text-[17px] font-semibold text-fg">Get 5,000 USDG and 10 of each stock</h2>
            <p className="mt-2 text-[13px] text-fg-muted">
              One wallet transaction per token, wrapped and base. On testnet this stands in for
              withdrawing a stock from the OKX app.
            </p>
            <button
              onClick={address ? mint : connect}
              disabled={busy}
              className="mt-4 w-full rounded-full bg-[#254839] px-5 py-3.5 text-[15px] font-medium text-[#fdf8ed] transition-colors hover:bg-[#1F3D31] disabled:opacity-45"
            >
              {!address ? 'Connect Wallet' : busy ? status : 'Get test tokens'}
            </button>
            {status && !busy && <p className="mt-2 text-[12px] text-fg-muted">{status}</p>}
          </div>
        </div>
      </section>
    </>
  );
}
