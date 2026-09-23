import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TokenIcon } from './icons/TokenIcon';

/// Compact header that sits at the top of every vault/market detail page.
/// Backlink + token glyph + title/subtitle, then a row of headline stats.
export function VaultHeader({
  backHref,
  symbol,
  title,
  subtitle,
  stats,
}: {
  backHref: string;
  symbol: string;
  title: string;
  subtitle: string;
  stats: { label: string; value: string; sub?: string }[];
}) {
  return (
    <section className="hero-glow px-6 md:px-24 pt-6 md:pt-12 pb-10 md:pb-14">
      <div className="max-w-[1400px] mx-auto">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <div className="mt-6 flex items-center gap-4">
          <TokenIcon symbol={symbol} size={48} />
          <div>
            <h1 className="text-fg font-light tracking-[-0.02em] text-[36px] md:text-[44px] leading-[1.05]">
              {title}
            </h1>
            <p className="mt-1 text-[14px] text-fg-muted">{subtitle}</p>
          </div>
        </div>

        <div
          className={`mt-10 grid grid-cols-2 gap-3 ${
            stats.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'
          }`}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-[#254839]/[0.04] ring-1 ring-[#254839]/10 px-4 py-3"
            >
              <div className="text-[11px] uppercase tracking-wider text-fg-muted">
                {s.label}
              </div>
              <div className="mt-1 text-[20px] text-fg">{s.value}</div>
              {s.sub && <div className="text-[11px] text-fg-muted">{s.sub}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
