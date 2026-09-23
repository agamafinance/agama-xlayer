import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Tabs, FilterBar } from '@/components/SectionHeader';
import { VaultsTable } from '@/components/VaultsTable';

export const metadata: Metadata = { title: 'Earn' };

export default function EarnPage() {
  return (
    <>
      <Hero
        statLabel="Total Deposits"
        statValue="$—"
        statSource="totalDeposits"
        title={
          <>
            Earn yield
            <br />
            backed by RWA
          </>
        }
        connectedCtaLabel="Browse vaults"
        scrollTargetId="vaults-section"
      />

      <section
        id="vaults-section"
        className="vault-panel relative z-10 rounded-t-[20px] -mt-4 md:-mt-6 px-6 md:px-24 pt-10 md:pt-14 pb-24"
      >
        <div className="max-w-[1400px] mx-auto">
          <Tabs tabs={['Your positions', 'Vaults']} initial={1} />
          <FilterBar
            filters={[
              { label: 'Deposit', value: 'All' },
              { label: 'Curator', value: 'All' },
            ]}
            searchPlaceholder="Filter vaults"
          />
          <VaultsTable />
        </div>
      </section>
    </>
  );
}
