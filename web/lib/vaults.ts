export type Vault = {
  name: string;
  asset: string;
  depositsAmount: string;
  depositsUsd: string;
  liquidityAmount: string;
  liquidityUsd: string;
  curator: string;
  exposure: string[];
  exposureMore?: number;
  apy: string;
  hasBoost?: boolean;
  hasSun?: boolean;
};

export const VAULTS: Vault[] = [
  {
    name: 'Steakhouse USDC',
    asset: 'USDC',
    depositsAmount: '458.93M USDC',
    depositsUsd: '$458.84M',
    liquidityAmount: '80.29M USDC',
    liquidityUsd: '$80.27M',
    curator: 'Steakhouse',
    exposure: ['BTC', 'ETH', 'USDC'],
    apy: '4.55%',
    hasBoost: true,
  },
  {
    name: 'Gauntlet USDT Core',
    asset: 'USDT',
    depositsAmount: '443.66M USDT',
    depositsUsd: '$443.66M',
    liquidityAmount: '65.78M USDT',
    liquidityUsd: '$65.78M',
    curator: 'Gauntlet',
    exposure: ['BTC', 'ETH', 'WBTC', 'USDT'],
    exposureMore: 3,
    apy: '4.15%',
    hasBoost: true,
  },
  {
    name: 'Gauntlet USDT Prime',
    asset: 'USDT',
    depositsAmount: '261.97M USDT',
    depositsUsd: '$261.97M',
    liquidityAmount: '47.68M USDT',
    liquidityUsd: '$47.68M',
    curator: 'Gauntlet',
    exposure: ['USDS', 'ETH', 'WBTC', 'USDT'],
    apy: '3.58%',
    hasBoost: true,
  },
  {
    name: 'Gauntlet USDC Prime',
    asset: 'USDC',
    depositsAmount: '149.35M USDC',
    depositsUsd: '$149.32M',
    liquidityAmount: '40.23M USDC',
    liquidityUsd: '$40.22M',
    curator: 'Gauntlet',
    exposure: ['ETH', 'BTC', 'USDC'],
    apy: '4.62%',
    hasBoost: true,
  },
  {
    name: 'Vault Bridge WBTC',
    asset: 'WBTC',
    depositsAmount: '915.77504649 WBTC',
    depositsUsd: '$94.32M',
    liquidityAmount: '702.75793574 WBTC',
    liquidityUsd: '$72.38M',
    curator: 'Gauntlet',
    exposure: ['cbBTC', 'WBTC'],
    apy: '0.02%',
  },
  {
    name: 'Smokehouse USDC',
    asset: 'USDC',
    depositsAmount: '76.38M USDC',
    depositsUsd: '$76.36M',
    liquidityAmount: '13.55M USDC',
    liquidityUsd: '$13.55M',
    curator: 'Smokehouse',
    exposure: ['USDS', 'wstETH', 'PEPE', 'LINK'],
    exposureMore: 21,
    apy: '10.79%',
    hasBoost: true,
    hasSun: true,
  },
  {
    name: 'Steakhouse USDT',
    asset: 'USDT',
    depositsAmount: '68.96M USDT',
    depositsUsd: '$68.96M',
    liquidityAmount: '42.58M USDT',
    liquidityUsd: '$42.58M',
    curator: 'Steakhouse',
    exposure: ['USDC', 'USDS', 'WBTC', 'USDT'],
    exposureMore: 1,
    apy: '3.86%',
    hasBoost: true,
  },
  {
    name: 'Vault Bridge WETH',
    asset: 'WETH',
    depositsAmount: '16.74k WETH',
    depositsUsd: '$57.45M',
    liquidityAmount: '4279.68 WETH',
    liquidityUsd: '$14.68M',
    curator: 'Gauntlet',
    exposure: ['ETH', 'WETH', 'BTC'],
    apy: '2.41%',
    hasBoost: true,
  },
  {
    name: 'MEV Capital USDC',
    asset: 'USDC',
    depositsAmount: '54.54M USDC',
    depositsUsd: '$54.53M',
    liquidityAmount: '23.85M USDC',
    liquidityUsd: '$23.84M',
    curator: 'MEV',
    exposure: ['PEPE', 'USDC', 'LINK', 'SHIB'],
    exposureMore: 22,
    apy: '19.50%',
    hasBoost: true,
    hasSun: true,
  },
];
