'use client';

import dynamic from 'next/dynamic';
import { Space_Grotesk } from 'next/font/google';
import { SUI, explorerObject } from '@/lib/sui/config';
import { useConfidential } from '@/lib/sui/ConfidentialContext';
import { CREDIT_VAULTS, CURATORS, ALLOC_BPS, VAULT_OBJECTS, blendedApy, type CreditVault, type Curator } from '@/lib/sui/vaults';

// The full confidential flow (contra SDK + wasm + Seal) is client-only.
const ConfidentialFlow = dynamic(
  () => import('@/components/sui/ConfidentialFlow').then((m) => m.ConfidentialFlow),
  { ssr: false, loading: () => <div className="mt-4 text-[13px] text-fg-muted">Loading confidential flow…</div> },
);

// Tenka's brand font (their full logo is the mark + lowercase "tenka" in Space Grotesk).
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'] });

export default function SuiEarnPage() {
  const conf = useConfidential();
  const apy = blendedApy();

  return (
    <>
      {/* Header */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          <div aria-hidden className="pointer-events-none absolute right-0 -top-2 z-20 hidden lg:block">
            <img src="/logos/coin-pair.svg" alt="" className="h-[300px] w-auto" />
          </div>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            A synthetic dollar that earns
            <br />
            settled on Sui
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Mint cagUSD 1:1 from USDC, stake it for csagUSD and earn real yield from curated
            private credit vaults. Amounts are confidential (Confidential Transfers), and
            positions stay anonymous inside the Sphere.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Net APY" value={apy} />
            <Stat label="Your cagUSD" value={conf.cag ?? '—'} hidden={conf.cag === null} onReveal={conf.requestDerive} />
            <Stat label="Your csagUSD" value={conf.csag ?? '—'} hidden={conf.csag === null} onReveal={conf.requestDerive} />
          </div>
        </div>
      </section>

      {/* Confidential flow + curated vaults */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          {/* Confidential flow ①-⑥, inline */}
          <ConfidentialFlow />

          {/* Curated credit vaults */}
          <div className="flex flex-wrap items-center gap-3 pt-8 pb-2">
            <h2 className="text-[13px] uppercase tracking-wider text-fg-muted">Curated credit vaults</h2>
            <span className="flex items-center gap-3 text-[12px] text-fg-muted">
              curated by
              {CURATORS.map((c) => (
                <CuratorBrand key={c.name} curator={c} size="sm" />
              ))}
            </span>
          </div>
          <p className="text-[13px] text-fg-muted max-w-[680px] mb-4">
            When you swap USDC → cagUSD, the capital is allocated across these vaults by Agama&apos;s{' '}
            <span className="text-fg">Allocation Engine</span> per target weight. Realized yield is
            delivered back and lifts the csagUSD price.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CREDIT_VAULTS.map((v) => (
              <CreditVaultCard key={v.name} v={v} allocPct={(ALLOC_BPS[v.name] ?? 0) / 100} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, hidden, onReveal }: { label: string; value: string; hidden?: boolean; onReveal?: () => void }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      {hidden ? (
        <button
          type="button"
          onClick={onReveal}
          title="Confidential — click to derive your viewing key and reveal"
          className="text-[26px] font-semibold leading-tight tracking-[0.32em] text-[#254839]/45 hover:text-[#254839] cursor-pointer"
        >
          ****
        </button>
      ) : (
        <div className="text-[26px] text-fg font-semibold tabular-nums">{value}</div>
      )}
    </div>
  );
}

function CreditVaultCard({ v, allocPct }: { v: CreditVault; allocPct?: number }) {
  return (
    <a
      href={explorerObject(VAULT_OBJECTS[v.name] ?? SUI.pkg)}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] hover:ring-1 hover:ring-[#254839]/20 transition">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-[#254839]/10">
          <img src={v.curator.logo} alt={v.curator.name} className="h-[22px] w-[22px] object-contain" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] text-fg font-medium leading-tight">{v.type}</div>
          <div className="text-[13px] text-fg-muted">{v.description}</div>
        </div>
        {allocPct !== undefined && (
          <span className="ml-auto shrink-0 rounded-full bg-[#254839]/[0.08] px-2.5 py-1 text-[11px] text-fg-muted">
            {allocPct.toFixed(0)}% alloc
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Field label="Yield Range" value={v.yieldApy} strong />
        {v.fields.map((f) => (
          <Field key={f.label} label={f.label} value={f.value} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#254839]/10 pt-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-muted">Curator</div>
          <div className="mt-1.5">
            <CuratorBrand curator={v.curator} />
          </div>
        </div>
        {v.badge && (
          <span className="rounded-full bg-[#C97A40]/15 px-2.5 py-1 text-[11px] font-medium text-[#A85A2C]">{v.badge}</span>
        )}
      </div>
    </a>
  );
}

function CuratorBrand({ curator, size = 'md' }: { curator: Curator; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className="inline-flex items-center gap-1.5">
      <img src={curator.logo} alt="" className={`${h} object-contain`} />
      <span className={`${spaceGrotesk.className} ${size === 'sm' ? 'text-[13px]' : 'text-[15px]'} font-medium leading-none text-[#111318]`}>
        {curator.name.split(' ')[0]}
      </span>
    </span>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={strong ? 'text-[15px] text-fg font-semibold' : 'text-[14px] text-fg'}>{value}</div>
    </div>
  );
}
