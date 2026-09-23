import {type Abi, type Address} from "viem";
import deployments from "@/deployments/7295799.json";

import MockUSDrArtifact from "@/abi/MockUSDr.json";
import MockAMFIArtifact from "@/abi/MockAMFI.json";
import MockOracleArtifact from "@/abi/MockOracle.json";
import DemoFaucetArtifact from "@/abi/DemoFaucet.json";
import SplitFaucetArtifact from "@/abi/SplitFaucet.json";
import LendingPoolArtifact from "@/abi/AgamaLendingPool.json";
import DebtTokenArtifact from "@/abi/DebtToken.json";
import AmFiAdapterArtifact from "@/abi/AmFiAdapter.json";
import StabilityPoolArtifact from "@/abi/AgamaStabilityPool.json";
import LiquidationProxyArtifact from "@/abi/LiquidationProxy.json";
import SettlementVaultArtifact from "@/abi/AgamaSettlementVault.json";
import TreasuryArtifact from "@/abi/AgamaTreasury.json";
import ReserveFundArtifact from "@/abi/AgamaReserveFund.json";
import FeeCollectorArtifact from "@/abi/AgamaFeeCollector.json";
import MockTrancheTokenArtifact from "@/abi/MockTrancheToken.json";

// ---- Addresses (from smart/deployments/7295799.json) -------------------

export const addresses = {
  USDr: deployments.contracts.USDr as Address,
  MockAMFI: deployments.contracts.MockAMFI as Address,
  Faucet: deployments.contracts.Faucet as Address,
  SplitFaucet: (deployments.contracts as Record<string, string>).SplitFaucet as Address,
  LendingPool: deployments.contracts.LendingPool as Address,
  DebtToken: deployments.contracts.DebtToken as Address,
  StabilityPool: deployments.contracts.StabilityPool as Address,
  LiquidationProxy: deployments.contracts.LiquidationProxy as Address,
  SettlementVault: deployments.contracts.SettlementVault as Address,
  Treasury: deployments.contracts.Treasury as Address,
  ReserveFund: deployments.contracts.ReserveFund as Address,
  FeeCollector: deployments.contracts.FeeCollector as Address,
} as const;

export const params = deployments.params;

// ---- ABIs ---------------------------------------------------------------

export const abis = {
  USDr: MockUSDrArtifact.abi as Abi,
  MockAMFI: MockAMFIArtifact.abi as Abi,
  MockOracle: MockOracleArtifact.abi as Abi,
  Faucet: DemoFaucetArtifact.abi as Abi,
  SplitFaucet: SplitFaucetArtifact.abi as Abi,
  LendingPool: LendingPoolArtifact.abi as Abi,
  DebtToken: DebtTokenArtifact.abi as Abi,
  AmFiAdapter: AmFiAdapterArtifact.abi as Abi,
  StabilityPool: StabilityPoolArtifact.abi as Abi,
  LiquidationProxy: LiquidationProxyArtifact.abi as Abi,
  SettlementVault: SettlementVaultArtifact.abi as Abi,
  Treasury: TreasuryArtifact.abi as Abi,
  ReserveFund: ReserveFundArtifact.abi as Abi,
  FeeCollector: FeeCollectorArtifact.abi as Abi,
  MockTrancheToken: MockTrancheTokenArtifact.abi as Abi,
} as const;

// ---- Pre-bundled (address + abi) entries for direct destructuring -----

export const contracts = {
  USDr: {address: addresses.USDr, abi: abis.USDr},
  MockAMFI: {address: addresses.MockAMFI, abi: abis.MockAMFI},
  Faucet: {address: addresses.Faucet, abi: abis.Faucet},
  SplitFaucet: {address: addresses.SplitFaucet, abi: abis.SplitFaucet},
  LendingPool: {address: addresses.LendingPool, abi: abis.LendingPool},
  DebtToken: {address: addresses.DebtToken, abi: abis.DebtToken},
  StabilityPool: {address: addresses.StabilityPool, abi: abis.StabilityPool},
  LiquidationProxy: {address: addresses.LiquidationProxy, abi: abis.LiquidationProxy},
  SettlementVault: {address: addresses.SettlementVault, abi: abis.SettlementVault},
  Treasury: {address: addresses.Treasury, abi: abis.Treasury},
  ReserveFund: {address: addresses.ReserveFund, abi: abis.ReserveFund},
  FeeCollector: {address: addresses.FeeCollector, abi: abis.FeeCollector},
} as const;
