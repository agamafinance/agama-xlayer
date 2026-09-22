"use client";

import {useChainId} from "wagmi";

import type {AppChainId} from "./chains";
import {deployments} from "./generated/deployments";
import type {Deployment} from "./deployment-types";

export function getDeployment(chainId: number | undefined): Deployment | undefined {
  if (chainId === undefined) return undefined;
  return deployments[chainId];
}

/// Deployment for the chain the app is reading from (the wallet chain when
/// it is supported, the default chain otherwise).
export function useDeployment(): {chainId: AppChainId; d: Deployment | undefined} {
  const chainId = useChainId();
  return {chainId, d: getDeployment(chainId)};
}
