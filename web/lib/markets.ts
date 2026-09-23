export type Market = {
  collateral: string;
  collateralExtra?: boolean;
  loan: string;
  lltv: string;
  marketSize: string;
  marketSizeUsd: string;
  liquidity: string;
  liquidityUsd: string;
  rate: string;
  rateBoost?: boolean;
  trusted: string[];
  trustedMore?: number;
};

export const MARKETS: Market[] = [
  {
    collateral: 'cbBTC',
    loan: 'USDC',
    lltv: '86.00%',
    marketSize: '538.48M USDC',
    marketSizeUsd: '$538.32M',
    liquidity: '106.48M USDC',
    liquidityUsd: '$106.45M',
    rate: '4.53%',
    trusted: ['Steakhouse', 'MEV'],
    trustedMore: 8,
  },
  {
    collateral: 'sUSDS',
    loan: 'USDT',
    lltv: '96.50%',
    marketSize: '315.94M USDT',
    marketSizeUsd: '$315.93M',
    liquidity: '34.23M USDT',
    liquidityUsd: '$34.23M',
    rate: '3.86%',
    trusted: ['Gauntlet', 'Steakhouse'],
  },
  {
    collateral: 'cbBTC',
    loan: 'USDT',
    lltv: '86.00%',
    marketSize: '272.06M USDT',
    marketSizeUsd: '$272.05M',
    liquidity: '65.97M USDT',
    liquidityUsd: '$65.97M',
    rate: '5.72%',
    trusted: ['Gauntlet'],
  },
  {
    collateral: 'WBTC',
    loan: 'USDC',
    lltv: '86.00%',
    marketSize: '277.84M USDC',
    marketSizeUsd: '$277.76M',
    liquidity: '106.13M USDC',
    liquidityUsd: '$106.10M',
    rate: '4.58%',
    trusted: ['Gauntlet', 'Steakhouse'],
    trustedMore: 4,
  },
  {
    collateral: 'wstETH',
    collateralExtra: true,
    loan: 'USDT',
    lltv: '86.00%',
    marketSize: '207.48M USDT',
    marketSizeUsd: '$207.47M',
    liquidity: '66.38M USDT',
    liquidityUsd: '$66.38M',
    rate: '3.95%',
    trusted: ['Gauntlet', 'Steakhouse'],
    trustedMore: 3,
  },
  {
    collateral: 'ETH+',
    loan: 'WETH',
    lltv: '94.50%',
    marketSize: '40.46k WETH',
    marketSizeUsd: '$141.14M',
    liquidity: '3981.39 WETH',
    liquidityUsd: '$13.88M',
    rate: '10.46%',
    trusted: ['MEV', 'Gauntlet'],
    trustedMore: 5,
  },
  {
    collateral: 'WBTC',
    loan: 'USDT',
    lltv: '86.00%',
    marketSize: '181.74M USDT',
    marketSizeUsd: '$181.73M',
    liquidity: '66.34M USDT',
    liquidityUsd: '$66.34M',
    rate: '4.14%',
    trusted: ['Gauntlet', 'Steakhouse'],
    trustedMore: 2,
  },
  {
    collateral: 'weETH',
    loan: 'WETH',
    lltv: '94.50%',
    marketSize: '27.80k WETH',
    marketSizeUsd: '$96.96M',
    liquidity: '7953.35 WETH',
    liquidityUsd: '$27.73M',
    rate: '2.59%',
    rateBoost: true,
    trusted: ['Gauntlet', 'MEV'],
    trustedMore: 1,
  },
  {
    collateral: 'wstETH',
    collateralExtra: true,
    loan: 'USDC',
    lltv: '86.00%',
    marketSize: '160.79M USDC',
    marketSizeUsd: '$160.75M',
    liquidity: '96.44M USDC',
    liquidityUsd: '$96.41M',
    rate: '4.60%',
    trusted: ['Gauntlet', 'Steakhouse'],
    trustedMore: 5,
  },
  {
    collateral: 'PT-cUSDO-20NOV2025',
    loan: 'USDC',
    lltv: '91.50%',
    marketSize: '66.14M USDC',
    marketSizeUsd: '$66.12M',
    liquidity: '8.79M USDC',
    liquidityUsd: '$8.78M',
    rate: '13.41%',
    trusted: ['Gauntlet', 'Steakhouse'],
    trustedMore: 3,
  },
];
