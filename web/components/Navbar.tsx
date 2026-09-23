'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';
import { ConnectPill } from './ConnectPill';
import { StellarConnectPill } from './StellarConnectPill';
import { ArbitrumConnectPill } from './ArbitrumConnectPill';
import { SuiConnectPill } from './SuiConnectPill';
import { RobinhoodConnectPill } from './RobinhoodConnectPill';
import { StarknetConnectPill } from './StarknetConnectPill';
import { MagicBlockConnectPill } from './MagicBlockConnectPill';
import { XLayerConnectPill } from './XLayerConnectPill';
import { useNetwork, type Platform } from '@/lib/network/NetworkContext';

const NAV: Record<Platform, { href: string; label: string }[]> = {
  evm: [
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/earn', label: 'Earn' },
    { href: '/borrow', label: 'Borrow' },
  ],
  stellar: [
    { href: '/stellar/portfolio', label: 'Portfolio' },
    { href: '/stellar', label: 'Earn' },
    { href: '/stellar/faucet', label: 'Faucet' },
  ],
  arbitrum: [
    { href: '/arbitrum/portfolio', label: 'Portfolio' },
    { href: '/arbitrum', label: 'Earn' },
    { href: '/arbitrum/borrow', label: 'Borrow' },
    { href: '/arbitrum/faucet', label: 'Faucet' },
  ],
  sui: [
    { href: '/sui/portfolio', label: 'Portfolio' },
    { href: '/sui', label: 'Earn' },
    { href: '/sui/faucet', label: 'Faucet' },
  ],
  starknet: [
    { href: '/starknet/portfolio', label: 'Portfolio' },
    { href: '/starknet', label: 'Earn' },
    { href: '/starknet/faucet', label: 'Faucet' },
  ],
  magicblock: [
    { href: '/magicblock/portfolio', label: 'Portfolio' },
    { href: '/magicblock', label: 'Earn' },
    { href: '/magicblock/faucet', label: 'Faucet' },
  ],
  robinhood: [],
  xlayer: [
    { href: '/xlayer/portfolio', label: 'Portfolio' },
    { href: '/xlayer', label: 'Earn' },
    { href: '/xlayer/amplify', label: 'Amplify' },
    { href: '/xlayer/lend', label: 'Lend' },
    { href: '/xlayer/faucet', label: 'Faucet' },
  ],
};

const NETWORKS: { id: Platform; label: string; logo: string; home: string }[] = [
  { id: 'xlayer', label: 'X Layer', logo: '/xlayer.svg', home: '/xlayer' },
  { id: 'magicblock', label: 'MagicBlock', logo: '/magicblock.png', home: '/magicblock' },
  { id: 'starknet', label: 'Starknet', logo: '/starknet.svg', home: '/starknet' },
  { id: 'sui', label: 'Sui', logo: '/sui.svg', home: '/sui' },
  { id: 'stellar', label: 'Stellar', logo: '/stellar.svg', home: '/stellar' },
];

export function Navbar() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { platform, setPlatform } = useNetwork();
  const [menuOpen, setMenuOpen] = useState(false);

  const current = NETWORKS.find((n) => n.id === platform) ?? NETWORKS[0];

  const selectNetwork = (n: (typeof NETWORKS)[number]) => {
    setPlatform(n.id);
    setMenuOpen(false);
    router.push(n.home);
  };

  const navItems = (mobile: boolean) =>
    NAV[platform].map((item) => {
      // "Earn" (/stellar) owns every stellar page that isn't claimed by a
      // more specific tab (portfolio, faucet) — so /stellar/swap and
      // /stellar/vaults/* keep the Earn pill active.
      const siblings = NAV[platform].filter((n) => n.href !== item.href).map((n) => n.href);
      const active =
        pathname === item.href ||
        (item.href !== '/' &&
          pathname.startsWith(item.href) &&
          !siblings.some((s) => s.length > item.href.length && pathname.startsWith(s)));
      return (
        <Link
          key={item.href}
          href={item.href}
          className={clsx(
            'flex items-center rounded-full text-white transition-colors',
            mobile ? 'h-7 flex-1 justify-center text-[13px]' : 'h-10 px-4 md:px-5 text-[14px]',
            active ? 'pill-active' : 'hover:bg-white/10'
          )}
        >
          {item.label}
        </Link>
      );
    });

  return (
    <>
      <header className="relative z-50 bg-[#1F3D31] md:bg-transparent px-4 md:pl-6 md:pr-[24px] py-3 md:py-[11px]">
        <div className="flex items-center justify-between gap-3">
          <Link href={current.home} className="flex items-center group shrink-0">
            <img src="/agama-logo-beige.svg" alt="Agama" className="h-[32.8px] w-auto" />
          </Link>

          {/* Desktop nav (inline) */}
          <nav className="hidden md:flex pill-bar items-center gap-1 rounded-full h-[47px] -mb-[3px] px-[3.5px] mr-auto ml-10">
            {navItems(false)}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="pill-outline flex items-center gap-0.5 rounded-full h-10 pl-[6px] pr-[7px] text-white"
                aria-label="Select network"
              >
                <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <img src={current.logo} alt={current.label} className="h-[20px] w-[20px] object-cover" />
                </span>
                <ChevronDown className="h-3 w-3 text-white" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-12 z-40 w-52 rounded-2xl bg-[#fdfaf1] p-1.5 shadow-[0_1px_3px_rgba(20,50,35,0.08),0_12px_34px_rgba(20,50,35,0.16)]">
                    {NETWORKS.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => selectNetwork(n)}
                        className={clsx(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] transition-colors',
                          n.id === platform
                            ? 'bg-[#254839] text-[#fdf8ed]'
                            : 'text-[#254839] hover:bg-[#254839]/[0.06]'
                        )}
                      >
                        {/* shrink-0 matters: without it a long label squeezes the
                            icon to zero width and the row silently loses its logo. */}
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-full">
                          <img src={n.logo} alt={n.label} className="h-[22px] w-[22px] object-cover" />
                        </span>
                        <span className="truncate">{n.label}</span>
                        {(n.id === 'stellar' || n.id === 'sui' || n.id === 'robinhood' || n.id === 'starknet' || n.id === 'magicblock' || n.id === 'xlayer') && (
                          <span className="ml-auto text-[10px] uppercase tracking-wide opacity-70">
                            testnet
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {platform === 'stellar' ? (
              <StellarConnectPill />
            ) : platform === 'arbitrum' ? (
              <ArbitrumConnectPill />
            ) : platform === 'sui' ? (
              <SuiConnectPill />
            ) : platform === 'robinhood' ? (
              <RobinhoodConnectPill />
            ) : platform === 'starknet' ? (
              <StarknetConnectPill />
            ) : platform === 'magicblock' ? (
              <MagicBlockConnectPill />
            ) : platform === 'xlayer' ? (
              <XLayerConnectPill />
            ) : (
              <ConnectPill />
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden bg-[#fdf8ed] px-2 pt-3 pb-3 border-b border-[#254839]/20">
        <nav className="pill-bar flex items-center gap-1 rounded-full h-[32px] px-[3.5px]">
          {navItems(true)}
        </nav>
      </div>
    </>
  );
}
