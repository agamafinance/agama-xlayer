// Sui testnet deployment config for the Agama POC (audit-hardened, confidential-enabled).
// Package + object IDs are the live testnet deployment used by the agama-sphere app.

const AGUSD_PKG = '0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab';

export const SUI = {
  network: 'testnet',
  rpcUrl: 'https://sui-testnet-rpc.publicnode.com',
  decimals: 6,
  pkg: AGUSD_PKG,
  objects: {
    pool: '0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67',
    usdcTreasury: '0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d',
    vault: '0x29b9146405de04894f1a9e932ed7544965dd934e1460fb63bc524fb699344bc8',
    whitelist: '0x6b2b8a3e2b85d5e5b7fb6ce557e31e1adf4d9e1c3b1d7b301c125cd3466cd9ae',
  },
  types: {
    usdc: `${AGUSD_PKG}::usdc::USDC`,
    agusd: `${AGUSD_PKG}::agusd::AGUSD`,
    sagusd: `${AGUSD_PKG}::sagusd::SAGUSD`,
  },
  targets: {
    faucet: `${AGUSD_PKG}::usdc::faucet`,
    mint: `${AGUSD_PKG}::agusd::mint`,
    redeem: `${AGUSD_PKG}::agusd::redeem`,
    stake: `${AGUSD_PKG}::sagusd::stake`,
    unstake: `${AGUSD_PKG}::sagusd::unstake`,
  },
  // Open KYC whitelister (Vercel serverless on the confidential app). CORS: *.
  whitelistApi: 'https://agama-sphere.vercel.app/api/whitelist',
  // The full confidential/privacy flow (Confidential Transfers + Seal + Sphere).
  confidentialApp: 'https://agama-sphere.vercel.app',
} as const;

export const SUI_DECIMALS = SUI.decimals; // 6

export const explorerTx = (digest: string) =>
  `https://suiscan.xyz/testnet/tx/${digest}`;
export const explorerObject = (id: string) =>
  `https://suiscan.xyz/testnet/object/${id}`;
export const explorerAccount = (addr: string) =>
  `https://suiscan.xyz/testnet/account/${addr}`;

// ---- amount helpers (6 decimals) ----
export function toBaseUnits(human: string | number): bigint {
  const s = String(human).trim();
  if (!s) return 0n;
  const [whole = '0', frac = ''] = s.replace(/,/g, '').split('.');
  const padded = (frac + '0'.repeat(SUI_DECIMALS)).slice(0, SUI_DECIMALS);
  return BigInt(whole || '0') * 10n ** BigInt(SUI_DECIMALS) + BigInt(padded || '0');
}

export function fromBaseUnits(v: bigint | undefined, precision = 2): string {
  if (v === undefined) return '—';
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(SUI_DECIMALS);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(SUI_DECIMALS, '0').slice(0, precision);
  const wholeStr = whole.toLocaleString('en-US');
  const out = precision > 0 ? `${wholeStr}.${fracStr}` : wholeStr;
  return neg ? `-${out}` : out;
}
