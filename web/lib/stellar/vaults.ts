// Curated credit-vault metadata for the strategies surface.
// The on-chain `staking.allocations` keeps name + target_bps + apy_bps (drives
// the headline APY); the richer fields below (liquidity, lock-up, risk…) are
// presentation metadata keyed by the same name.

export type Curator = {
  name: string;
  logo: string; // square icon mark, used in card slots
  wordmark?: string; // full logo image; when absent the brand renders as mark + styled text
  brandText?: string; // brand text rendered next to the mark (Tenka's site does mark + "tenka")
  url: string;
};

export type CreditVault = {
  name: string; // must match the on-chain allocation name
  slug: string; // key into STELLAR.creditVaults (its own on-chain vault contract)
  symbol: string; // share-token symbol of the vault
  type: string;
  description: string;
  yieldApy: string;
  fields: { label: string; value: string }[];
  curator: Curator;
  badge?: string;
};

export const QIRO: Curator = {
  name: 'Qiro Finance',
  logo: '/qiro-icon.svg', // official icon mark (extracted from qiro-logo.svg)
  wordmark: '/qiro.svg', // official full wordmark
  url: 'https://www.qiro.fi',
};

export const TENKA: Curator = {
  name: 'Tenka',
  logo: '/tenka.svg', // official mark from tenka.fi
  brandText: 'tenka', // their full logo = mark + lowercase "tenka" in Space Grotesk
  url: 'https://tenka.fi',
};

export const CURATORS: Curator[] = [QIRO, TENKA];

export const CREDIT_VAULTS: CreditVault[] = [
  // ---- Tenka — institutional private credit, onchain ----
  {
    name: 'Flagship Vault',
    slug: 'flagship',
    symbol: 'tFLAG',
    type: 'Flagship Vault',
    description: 'ABF Senior',
    yieldApy: '8-9% target APY',
    fields: [
      { label: 'Redemption', value: 'Weekly' },
      { label: 'Maximum Capacity', value: '$500M' },
      { label: 'Lock-Up', value: '1 Month' },
    ],
    curator: TENKA,
    badge: 'Senior secured',
  },
  {
    name: 'High Yield Vault',
    slug: 'high-yield',
    symbol: 'tHY',
    type: 'High Yield Vault',
    description: 'ABF Mezz',
    yieldApy: '15-20% target APY',
    fields: [
      { label: 'Redemption', value: 'Monthly' },
      { label: 'Maximum Capacity', value: '$200M' },
      { label: 'Lock-Up', value: '6 Months' },
    ],
    curator: TENKA,
    badge: 'Mezzanine',
  },
  {
    name: 'DealVaults',
    slug: 'dealvaults',
    symbol: 'tDEAL',
    type: 'Deal-by-Deal',
    description: 'DealVaults',
    yieldApy: '7-15% target APY',
    fields: [
      { label: 'Redemption', value: 'Per deal' },
      { label: 'Maximum Capacity', value: '$300M' },
      { label: 'Lock-Up', value: 'Deal term' },
    ],
    curator: TENKA,
    badge: 'Diversified',
  },
  // ---- Qiro Finance — curated private credit ----
  {
    name: 'Payment Financing Vault',
    slug: 'payment-financing',
    symbol: 'qPAY',
    type: 'Payment Financing Vault',
    description: 'Short Term Payment Receivables',
    yieldApy: '14% APY',
    fields: [
      { label: 'Redemption', value: 'Weekly' },
      { label: 'Maximum Capacity', value: '$25M' },
      { label: 'Lock-Up', value: '1-3 Months' },
    ],
    curator: QIRO,
    badge: 'Senior secured',
  },
  {
    name: 'Private Credit Vault',
    slug: 'private-credit',
    symbol: 'qPCV',
    type: 'Private Credit Vault',
    description: 'Diversified Credit Fund Subscription',
    yieldApy: '13% APY',
    fields: [
      { label: 'Redemption', value: 'Monthly' },
      { label: 'Maximum Capacity', value: '$10M' },
      { label: 'Lock-Up', value: '3 Months' },
    ],
    curator: QIRO,
    badge: 'Diversified',
  },
  {
    name: 'Institutional Credit Vault',
    slug: 'institutional-credit',
    symbol: 'qICV',
    type: 'Institutional Credit Vault',
    description: 'Institutional Lender Financing Deals',
    yieldApy: '12% APY',
    fields: [
      { label: 'Redemption', value: 'Quarterly' },
      { label: 'Maximum Capacity', value: '$15M' },
      { label: 'Lock-Up', value: '6 Months' },
    ],
    curator: QIRO,
    badge: 'Senior secured',
  },
];

export const vaultByName = (name: string) => CREDIT_VAULTS.find((v) => v.name === name);
export const vaultBySlug = (slug: string) => CREDIT_VAULTS.find((v) => v.slug === slug);
