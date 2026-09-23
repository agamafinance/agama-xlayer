// Minimal ABIs for the Agama Stylus contracts (Solidity-compatible ABI export).
import { parseAbi } from 'viem';

export const POOL_ABI = parseAbi([
  'function cash() view returns (uint256)',
  'function totalBorrows() view returns (uint256)',
  'function utilization() view returns (uint256)',
  'function borrowRateView() view returns (uint256)',
  'function supplyRateView() view returns (uint256)',
  'function healthFactor(address user) view returns (uint256)',
  'function debtOf(address user) view returns (uint256)',
  'function collateralValue(address user) view returns (uint256)',
  'function collateralShares(address user, address vault) view returns (uint256)',
  'function vaultsCount() view returns (uint256)',
  'function lend(uint256 assets)',
  'function withdraw(uint256 assets)',
  'function depositCollateral(address vault, uint256 shares)',
  'function withdrawCollateral(address vault, uint256 shares)',
  'function borrow(uint256 assets)',
  'function repay(uint256 assets)',
  'function liquidate(address user, address vault, uint256 repayAssets)',
  'event Liquidated(address indexed user, address indexed liquidator, address indexed vault, uint256 repaid, uint256 seizedShares)',
  'event Borrowed(address indexed user, uint256 assets)',
]);

export const ORACLE_ABI = parseAbi([
  'function navOf(address vault) view returns (uint256)',
]);

export const VAULT_ABI = parseAbi([
  'function navPerShare() view returns (uint256)',
  'function sharesOf(address who) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function deposit(uint256 assets) returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

export const ERC20_ABI = parseAbi([
  'function balanceOf(address who) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function faucet(uint256 amount)',
  'function totalSupply() view returns (uint256)',
]);

export const SAGUSD_ABI = parseAbi([
  'function pricePerShare() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function balanceOf(address who) view returns (uint256)',
  'function stake(uint256 assets) returns (uint256)',
  'function unstake(uint256 shares) returns (uint256)',
]);
