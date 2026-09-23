import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Tabs, FilterBar } from '@/components/SectionHeader';
import { MarketsTable } from '@/components/MarketsTable';
import { CoinStack } from '@/components/CoinStack';

export const metadata: Metadata = { title: 'Borrow' };

export default function BorrowPage() {
  return (
    <>
      <Hero
        statLabel="Total Active Loans"
        statValue="$—"
        statSource="totalLoans"
        title={
          <>
            Unlock liquidity
            <br />
            from your RWA
          </>
        }
        illustration={<CoinStack className="w-full h-auto" />}
        connectedCtaLabel="Browse markets"
        scrollTargetId="markets-section"
      />

      <section
        id="markets-section"
        className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24"
      >
        <div className="max-w-[1400px] mx-auto">
          <Tabs tabs={['Your positions', 'Markets']} initial={1} />
          <FilterBar
            filters={[
              { label: 'Collateral', value: 'All' },
              { label: 'Loan', value: 'All' },
            ]}
            searchPlaceholder="Filter markets"
          />
          <MarketsTable />
        </div>
      </section>
    </>
  );
}
