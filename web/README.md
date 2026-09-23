# Agama — front-end

The web app for **Agama Finance**, an RWA-collateralized lending protocol on Rayls testnet. Live at [app.agama.finance](https://app.agama.finance).

Three surfaces:

- **Earn** — deposit USDr to mint `agYLD` (yield-bearing share). Stake `agYLD` into the Stability Pool to mint `sagYLD` and capture liquidation premiums (7-day cooldown on unstake).
- **Borrow** — deposit one of 6 RWA tranche tokens as collateral, borrow USDr. Each market has its own isolated debt counter (V3).
- **Portfolio** — aggregated view across the lending pool, the stability pool, and every borrow market.

## Stack

- Next.js 16 (App Router, Turbopack)
- wagmi v2 + viem + RainbowKit
- Tailwind CSS — cream `#fdf8ed` background, dark green `#254839` foreground
- TanStack Query for the on-chain read cache (12s refetch interval)

## Local dev

```bash
pnpm install
pnpm dev          # → http://localhost:3004
```

The front-end proxies all JSON-RPC calls through `app/api/rpc/route.ts` (same-origin, with retry on Cloudflare 5xx) so the browser never talks to the upstream Rayls RPC directly. `lib/wagmi.ts` enables viem's deployless multicall because Multicall3 isn't deployed at the canonical address on Rayls.

## Deployed contracts

All addresses live on Rayls testnet, chain id `7295799`. Click any address to open Blockscout.

### Core protocol

| Contract | Role | Address |
|---|---|---|
| **AgamaLendingPool** | ERC-4626 wrap around USDr → mints `agYLD` to depositors. Handles lender deposit/withdraw, borrower borrow/repay, computes `currentBorrowRate` / `currentLiquidityRate` via the IRM (kink at 80%, base 2%, slope1 8%, slope2 60%). Maintains a vault per user (`openVaultPosition`) and delegates collateral / HF to the right adapter. | [`0x2d62…9be0`](https://testnet-explorer.rayls.com/address/0x2d621d442B4B652001448a7D5Ce7891bE54b9be0) |
| **DebtToken** | Non-transferable RAY-indexed ERC-20. **V3 API**: `balanceOf(user, adapter)` returns the user's debt isolated to that one market; `balanceOf(user)` aggregates across all markets. Minted on borrow, burned on repay or liquidation. | [`0x9F91…8E96`](https://testnet-explorer.rayls.com/address/0x9F918bB67E503999d20F0d0641c76A0Ca76E8E96) |
| **AgamaStabilityPool** | ERC-4626 wrap around `agYLD` → mints `sagYLD`. On liquidation, absorbs the bad debt by burning `agYLD` and receives the seized collateral at a discount, so the `sagYLD` share price climbs. Unstake is a 7-day cooldown (`requestUnstake` → wait → `claim`); pending shares stay earmarked and continue to backstop liquidations. | [`0x4A56…BeAd`](https://testnet-explorer.rayls.com/address/0x4A56BB11bbfEDf92ae45f2473fb35AAD1949BeAd) |

### Liquidation & settlement

| Contract | Role | Address |
|---|---|---|
| **LiquidationProxy** | Single entry point for liquidations. Verifies HF < 1.0 on the targeted market, seizes debt + discounted collateral, routes to the SP. Wrapped by keeper bots. | [`0xdf90…25B5`](https://testnet-explorer.rayls.com/address/0xdf90B5d51f879dc3b8075ca0ed4b9306bDE225B5) |
| **AgamaSettlementVault** | When the SP needs to redeem its accumulated tranche positions back into USDr (peg-gap path), the SettlementVault batches the redemptions and routes them to MockAMFI. Surfaces `pegGapPendingForSP` for the portfolio view. | [`0x9a49…7c6d`](https://testnet-explorer.rayls.com/address/0x9a4997632272177E0d6fF161F5c631235F887c6d) |

### Treasury & fees

| Contract | Role | Address |
|---|---|---|
| **AgamaTreasury** | Receives protocol fees and bad-debt recoveries. Admin-controlled. | [`0x6af9…D7aE`](https://testnet-explorer.rayls.com/address/0x6af9fe9A7a75aEc304bDbd79Cb7056285691D7aE) |
| **AgamaReserveFund** | Capital safety buffer — absorbs bad debt before it reaches the SP in a catastrophic-default scenario. | [`0xbd6E…594a`](https://testnet-explorer.rayls.com/address/0xbd6E5BDa073Fc88ddc0091C34e963657a37E594a) |
| **AgamaFeeCollector** | Splits and routes fees (origination, interest spread) between the Treasury and the ReserveFund per the configured ratio. | [`0x0C76…D2cF`](https://testnet-explorer.rayls.com/address/0x0C76ffb6eD0b41AC38C2a7c2db1F3837D4a9D2cF) |

### Base asset & faucets

| Contract | Role | Address |
|---|---|---|
| **MockUSDr** | Mock ERC-20 (18 dec) — the base asset for deposit / borrow / repay. Public `mint(to, amount)`. Not to be confused with native USDr (Rayls gas token). | [`0x74eF…f9D6`](https://testnet-explorer.rayls.com/address/0x74eF358563dcBa0FdDEE6FE7c944e859C001f9D6) |
| **MockAMFI** | Mock of the AMFI protocol — issues and manages the tranche tokens, computes a `pricePerShare()` that grows with the underlying trad-fi yield. | [`0x9db8…CC30`](https://testnet-explorer.rayls.com/address/0x9db8E13BEb90c2FAdB051Bf1d3d03D449F63CC30) |
| **DemoFaucet** | One-shot faucet — mints a bundle of test tokens in a single tx. The in-app `FaucetCard` button wraps this. | [`0xFe70…26f9`](https://testnet-explorer.rayls.com/address/0xFe70Fdf0070265F0e6B9fDd9801eE98A15De26f9) |
| **SplitFaucet** | Variant of the faucet that splits amounts differently — admin tool for seeding stress-test wallets. | [`0x287e…F963`](https://testnet-explorer.rayls.com/address/0x287e12D2C73b0eaA257b653b11B1a06C928fF963) |

### Tranches (6 RWA markets)

Each tranche = **three contracts**: a *token* (the RWA share), an *oracle* (USD price), and an *adapter* (collateral custody, HF, `getAssetValue` on the pool side).

#### Resolvi

| Symbol | Token | Oracle | Adapter |
|---|---|---|---|
| **sRESOLV** (Senior) | [`0x1852…EAd6`](https://testnet-explorer.rayls.com/address/0x18524b97ba62fa0Acb28f36A08766dF52B25EAd6) | [`0xf436…b015`](https://testnet-explorer.rayls.com/address/0xf4360870d36f8bA4abC152421EfEAfb147c4b015) | [`0xE0c7…4552`](https://testnet-explorer.rayls.com/address/0xE0c7861736B78F431B938f3481ef6a838FC64552) |
| **jRESOLV** (Junior) | [`0x821e…97f6`](https://testnet-explorer.rayls.com/address/0x821e0915AF3504382D591BA6a45a930d1e8897f6) | [`0xf1fa…4a61`](https://testnet-explorer.rayls.com/address/0xf1fa2229d4AB3C31f7B0781f84383f22aDE24a61) | [`0x58a5…c66f`](https://testnet-explorer.rayls.com/address/0x58a515D553Ca6C841e84eEfeae845723f345c66f) |

#### Digcap

| Symbol | Token | Oracle | Adapter |
|---|---|---|---|
| **sDIGCAP** (Senior) | [`0x10c4…3931`](https://testnet-explorer.rayls.com/address/0x10c4c65CBdA4DEE8a1dee8F31B005437FB193931) | [`0x4467…d79C`](https://testnet-explorer.rayls.com/address/0x446709CAFBeA671C4E0E9deeefc319966B3Cd79C) | [`0x65a6…8937`](https://testnet-explorer.rayls.com/address/0x65a693F0D0C51f41C86bd40EC46CF652ea778937) |
| **jDIGCAP** (Junior) | [`0x6bF6…C980`](https://testnet-explorer.rayls.com/address/0x6bF68516f21FC26Dc5dA95D1DCC95FfEfA94C980) | [`0xC377…8737`](https://testnet-explorer.rayls.com/address/0xC37744397F0fEf5a907224Fa524b8a0826388737) | [`0x0334…4797`](https://testnet-explorer.rayls.com/address/0x0334F025B2D82A3d5E00009CD2Bb2f0158164797) |

#### Sector Condo

| Symbol | Token | Oracle | Adapter |
|---|---|---|---|
| **sCONDO** (Senior) | [`0x2cac…3FaA`](https://testnet-explorer.rayls.com/address/0x2cac9B27469FF3a0966649d8bA90604F22d83FaA) | [`0x7796…bB6b`](https://testnet-explorer.rayls.com/address/0x7796F8e61Cfe374ea5a6183D723C9f7AddAdbB6b) | [`0x99b8…fBA9`](https://testnet-explorer.rayls.com/address/0x99b8271cC04771E80e2950D942e9dE4f08F8fBA9) |
| **jCONDO** (Junior) | [`0x9406…DFfF`](https://testnet-explorer.rayls.com/address/0x94067D5aE45C50b60dcbDB6145900D68E880DFfF) | [`0x492A…47F1`](https://testnet-explorer.rayls.com/address/0x492ABaC455d4c93cf502aDAABeEC7eA696ea47F1) | [`0xACef…7126`](https://testnet-explorer.rayls.com/address/0xACef606Eae71b7946f24ce61E4CE1b6Ed2C17126) |

## End-to-end flows

**Lender** — `USDr` → `LendingPool.deposit` → `agYLD` → optional `StabilityPool.deposit` → `sagYLD`.

**Borrower** — tranche token → `LendingPool.openVaultPosition` → `LendingPool.depositAsset(adapter, data)` (the adapter custodies the collateral) → `LendingPool.borrow(adapter, data, amount)` (mints debt scoped to this market on `DebtToken`) → repay = `LendingPool.repay(adapter, data, amount)` (burns debt + returns USDr).

**Liquidation** — keeper detects HF < 1.0 on a market → `LiquidationProxy.liquidate(adapter, user)` → seizes collateral with discount (3% Senior / 8% Junior) → SP absorbs the debt by burning `agYLD` → SP receives the collateral → `SettlementVault` redeems it back into USDr in batches.

**Oracle freshness** — every adapter checks `block.timestamp - oracle.lastUpdate() ≤ ORACLE_STALENESS_MAX` (currently 7 days). Past that window, all writes and HF reads on that adapter revert with `OracleStale()`.

## Tranche risk parameters

| Tranche | Max LTV | Liq. Threshold | Liq. Bonus | Tranche APR |
|---|---|---|---|---|
| Senior | 75% | 85% | 3% | 12% |
| Junior | 50% | 65% | 8% | 24% |
