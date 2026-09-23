// Minimal ABIs for the Morpho Blue core, our oracle, and the two tokens.
import { parseAbi } from 'viem';

export const MORPHO_ABI = parseAbi([
  'struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }',
  'function supplyCollateral(MarketParams marketParams, uint256 assets, address onBehalf, bytes data)',
  'function withdrawCollateral(MarketParams marketParams, uint256 assets, address onBehalf, address receiver)',
  'function borrow(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)',
  'function repay(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)',
  'function supply(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)',
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
]);

export const ORACLE_ABI = parseAbi([
  'function price() view returns (uint256)',
]);

export const ERC20_ABI = parseAbi([
  'function balanceOf(address who) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function mint(address to, uint256 amount)',
]);
