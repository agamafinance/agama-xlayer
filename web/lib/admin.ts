import {type Address} from "viem";
import {useAccount} from "wagmi";

// Wallet that deployed the protocol on Rayls — the admin / governor /
// settlement manager. The /admin page is only mounted in the nav and
// only renders its panels when the connected wallet matches.
export const DEPLOYER_ADDRESS: Address = "0xf6d3C9Ed2115A5197F96f6189F6D63B51022Fe16";

export function useIsDeployer(): boolean {
  const {address} = useAccount();
  if (!address) return false;
  return address.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase();
}
