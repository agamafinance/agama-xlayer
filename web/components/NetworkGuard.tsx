'use client';

import { useEffect, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

import { raylsTestnet } from '@/lib/chain';
import { useNetwork } from '@/lib/network/NetworkContext';

/// Auto-switches a connected wallet to Rayls Testnet (chainId 7295799).
/// If the chain is unknown to the wallet (e.g. MetaMask without Rayls
/// added), wagmi triggers the standard "Add network?" prompt — that one
/// prompt is unavoidable because EVM wallets require user consent. After
/// the chain is added once, future connections switch silently.
export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { platform } = useNetwork();

  const lastAttempt = useRef<number>(0);

  useEffect(() => {
    if (platform === 'stellar') return; // Stellar uses Freighter, not an EVM wallet
    if (platform === 'robinhood') return; // Robinhood uses its own injected wallet on chain 46630
    if (platform === 'starknet') return; // Starknet uses an injected Starknet wallet, not EVM
    if (platform === 'magicblock') return; // MagicBlock runs on Solana devnet, not an EVM chain
    if (platform === 'sui') return; // Sui uses dapp-kit, not an EVM wallet
    if (!isConnected) return;
    if (chainId === raylsTestnet.id) return;

    const now = Date.now();
    if (now - lastAttempt.current < 5_000) return;
    lastAttempt.current = now;

    switchChain({ chainId: raylsTestnet.id });
  }, [isConnected, chainId, switchChain, platform]);

  return null;
}
