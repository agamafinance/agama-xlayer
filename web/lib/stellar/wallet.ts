// Agnostic Stellar wallet layer — wraps @creit.tech/stellar-wallets-kit so the
// rest of the app never has to care which wallet the user chose.
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks } from '@creit.tech/stellar-wallets-kit/types';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { STELLAR } from './config';
import type { ISupportedWallet } from '@creit.tech/stellar-wallets-kit/types';

export type WalletEntry = Pick<ISupportedWallet, 'id' | 'name' | 'icon' | 'isAvailable'>;

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  StellarWalletsKit.init({
    network: STELLAR.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
    modules: defaultModules(),
  });
}

/** Returns all supported wallets with their availability status. */
export async function getSupportedWallets(): Promise<WalletEntry[]> {
  init();
  const wallets = await StellarWalletsKit.refreshSupportedWallets();
  return wallets.map(({ id, name, icon, isAvailable }) => ({ id, name, icon, isAvailable }));
}

/** Sets the active wallet module and fetches the user's public key. */
export async function connectWallet(id: string): Promise<string> {
  init();
  StellarWalletsKit.setWallet(id);
  const { address } = await StellarWalletsKit.fetchAddress();
  if (!address) throw new Error('No address returned');
  return address;
}

/** Signs a transaction XDR with the active wallet; returns the signed XDR. */
export async function signWithKit(
  xdr: string,
  networkPassphrase: string,
  address: string,
): Promise<string> {
  init();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase,
  });
  return signedTxXdr;
}

export async function disconnectKit(): Promise<void> {
  if (!initialized) return;
  await StellarWalletsKit.disconnect();
}
