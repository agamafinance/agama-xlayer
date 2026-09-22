# Agama x Arrow on X Layer

**Earn on your stocks** and **Amplify**: two one-click products on top of an Arrow Finance lending pool on X Layer, deployed by Agama as part of the Arrow x Agama partnership (Arrow runs the same model on Robinhood Chain).

- **Earn on your stocks.** Deposit a tokenized stock (xStocks by Backed: wTSLAx, wNVDAx, wSPYx, wAAPLx), borrow USDG at the LTV you choose, and the USDG goes into the Agama RWA vault. You keep the stock exposure and earn the vault yield minus the borrow rate on the borrowed amount. The vault shares stay in your account as a buffer: if the stock falls, anyone can trigger a soft deleverage that repays debt from those shares. **Your stock is never the first thing sold.**
- **Amplify.** Loop the Agama vault on Arrow up to 3x in one transaction. `net APY = vaultAPY + (L - 1) x (vaultAPY - borrowAPR)`. If the carry turns negative, anyone can unwind the loop back to 1x.

Built for OKX Dev Day 2026, track **Build a Market** (tokenized stocks and RWA on X Layer).

**Live app (X Layer testnet):** https://agama-xlayer.vercel.app (the "Get test tokens" button mints test USDG and xStocks; test OKB for gas at https://web3.okx.com/xlayer/faucet).

## Why X Layer

- **xStocks are native on X Layer**: 928 tokenized equities, about 173M$ of market cap. No lending market accepts them as collateral today (Aave on X Layer lists none, and there is no Morpho or Euler).
- **USDG is X Layer's dollar**: 1.51B$ of supply, almost none of it in DeFi. Arrow lenders earn a borrow rate backed by overcollateralized stock loans instead of leaving it idle.
- **Chainlink Data Streams publishes US equities on X Layer**: verification is free on-chain (no FeeManager on the X Layer VerifierProxy), so the oracle accepts signed reports from anyone.

## Architecture

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','primaryColor':'#ffffff','primaryBorderColor':'#254839','lineColor':'#254839','fontFamily':'Helvetica Neue'}}}%%
flowchart LR
    subgraph U[User wallet]
      S[wTSLAx / wNVDAx / wSPYx / wAAPLx]
      G[USDG]
    end
    subgraph AG[Agama]
      ER[AgamaEarnRouter]
      AR[AgamaAmplifyRouter]
      AC[AgamaAccount<br/>one clone per user]
      V[Agama vault<br/>agUSD queue + sagUSD]
    end
    subgraph AF[Arrow Finance on X Layer]
      P[ArrowLendingPool<br/>ERC-4626 on USDG]
      XA[ArrowXStockAdapter x4]
      VA[ArrowVaultShareAdapter]
      SP[ArrowStabilityPool]
      O[DataStreamsStockOracle]
    end
    L[USDG lenders] -->|supply| P
    S --> ER --> AC
    G --> AR --> AC
    AC -->|collateral| XA
    AC -->|pledged shares| VA
    XA --> P
    VA --> P
    P -->|borrow USDG| AC
    AC -->|deposit| V
    O -->|price + market status| XA
    CL[Chainlink Data Streams<br/>or Chainlink relay] --> O
    SP -->|liquidate, buy back| P
```

| Contract | Role |
|---|---|
| `ArrowLendingPool` | ERC-4626 pool on USDG. Per-market isolated debt, Aave-style indices. Borrows are gated by the adapter (`borrowAllowed`). Liquidation is **partial**: the stability pool absorbs the debt and receives collateral worth `debt x (1 + bonus)`, the rest stays with the borrower. |
| `ArrowXStockAdapter` | One per stock. Holds the **ERC-4626 wrapper** (the base xStock rebases), prices it as `stock price x wrapper.convertToAssets(1e18)` so dividends are counted. Market closed: no new borrows and a lower liquidation threshold (weekend buffer). |
| `ArrowVaultShareAdapter` | Agama vault shares as collateral: exchange-rate pricing (never a hardcoded 1$), CAPO growth cap, 3% haircut, circuit breaker that pauses borrows if the NAV drops 2% under the snapshot, without blocking liquidations. |
| `ArrowStabilityPool` | Liquidation backstop (Arrow model). `liquidate` is permissionless. Seized stocks are sold to anyone at the oracle price minus 3% (`buyCollateral`), since X Layer DEX depth for xStocks is a few dollars. Seized vault shares are redeemed with priority. |
| `DataStreamsStockOracle` | Stores prices a lending market can read. Verifies Chainlink Data Streams v11 reports on-chain (permissionless) and accepts a bounded keeper relay. Market status aware (24/5), sequencer-uptime check, never falls back to a default price. |
| `AgamaAccount` | The borrower of record, one clone per user. Earn open/close, `softDeleverage` (anyone, HF < 1.15 -> back to 1.40), Amplify loop and unwind, `autoUnwind` spread guard. |
| `agUSDQueue` / `sagUSD` | The Agama vault on USDG. On X Layer it gains a `PRIORITY_ROLE` for the stability pool and a one-shot **forbidden vault**: the vault can never lend into the pool that accepts its own shares (the Stream xUSD / Elixir loop). |

## Risk parameters (v1)

| Collateral | Max LTV | Liquidation threshold | Bonus | Weekend buffer |
|---|---|---|---|---|
| wSPYx | 50% | 60% | 6% | -5 pts |
| wTSLAx, wNVDAx | 30% | 40% | 10% | -8 pts |
| wAAPLx | 35% | 45% | 8% | -8 pts |
| Agama vault shares | 70% | 80% | 5% | none (3% haircut) |

Earn defaults to 25% LTV. Amplify is capped at 3x. Rates: 1% base, 6% at 90% utilization.

## What was built during the OKX Dev Day build period

Everything under `src/arrow/oracle`, `src/arrow/adapters/Arrow*`, `src/arrow/ArrowStabilityPool.sol`, `src/agama`, `script`, `scripts`, `test` is new. The commit history shows the order.

Ported from the Agama protocol and changed for X Layer:
- `ArrowLendingPool` (from the Agama LendingPool): borrow gating, partial liquidation, bad debt only once the collateral is gone, USDG decimals, no settlement vault.
- `agUSDQueue`: priority redemptions and the anti-circularity guard.

Imported unchanged: `DebtToken`, rate and reserve libraries, `agUSD`, `sagUSD`.

## Run it

```bash
forge build
forge test                         # 46 tests, most on a fork of X Layer mainnet (real USDG, real xStocks)

# local X Layer mainnet fork with the full stack and real Chainlink prices
anvil --fork-url https://rpc.xlayer.tech --chain-id 1961 &
./scripts/fork-reset.sh            # deploy + seed + one keeper tick
python3 scripts/e2e.py fork        # full scenario with real transactions

# front
cd app && pnpm install && pnpm dev # http://localhost:3021
```

The end-to-end scenario: Alice opens Earn on 10 wTSLAx at 25%, Carol at 30% without a buffer, Bob opens Amplify 3x; vault yield is settled; TSLA crashes to 71.5%; the keeper soft-deleverages Alice (she keeps all 10 wTSLAx) and the stability pool partially liquidates Carol (she keeps 5.4 of 10); a buyer takes the seized stock at a 3% discount; TSLA recovers and everyone exits.

## Deployments

### X Layer testnet (chain 1952), live

All 24 contracts are source-verified on the OKLink explorer. X Layer testnet has no USDG and no xStocks, so they are public-faucet stand-ins there (same decimals, same ERC-4626 wrapper shape); the Arrow x Agama contracts are the exact mainnet code and wiring.

| Contract | Address |
|---|---|
| ArrowLendingPool | [`0xeeC557d8108406Bc9711ACa91Da618F7c0B609F2`](https://www.okx.com/web3/explorer/xlayer-test/address/0xeeC557d8108406Bc9711ACa91Da618F7c0B609F2) |
| ArrowStabilityPool | [`0x34bD33eD3656641F1D2a5C38C3eb0D9e3A009CEc`](https://www.okx.com/web3/explorer/xlayer-test/address/0x34bD33eD3656641F1D2a5C38C3eb0D9e3A009CEc) |
| DataStreamsStockOracle | [`0x83621D4ec8607E0B2190Ae3B990b0391AcdB18aB`](https://www.okx.com/web3/explorer/xlayer-test/address/0x83621D4ec8607E0B2190Ae3B990b0391AcdB18aB) |
| ArrowXStockAdapter (TSLA) | [`0xdd12dfF517d7e9E304453D2B1CBb8Da259a6194b`](https://www.okx.com/web3/explorer/xlayer-test/address/0xdd12dfF517d7e9E304453D2B1CBb8Da259a6194b) |
| ArrowXStockAdapter (NVDA) | [`0xF438FC2680410D17D1C2720d8FD852a2287675B4`](https://www.okx.com/web3/explorer/xlayer-test/address/0xF438FC2680410D17D1C2720d8FD852a2287675B4) |
| ArrowXStockAdapter (SPY) | [`0xfE7E44c64a3F2A5097198b413DA70368be203116`](https://www.okx.com/web3/explorer/xlayer-test/address/0xfE7E44c64a3F2A5097198b413DA70368be203116) |
| ArrowXStockAdapter (AAPL) | [`0x6Efa945e2B5689F4B235f3A23BBaA0345f852BE7`](https://www.okx.com/web3/explorer/xlayer-test/address/0x6Efa945e2B5689F4B235f3A23BBaA0345f852BE7) |
| ArrowVaultShareAdapter | [`0x072944f6E671220aE73E89E61659E356437B16a5`](https://www.okx.com/web3/explorer/xlayer-test/address/0x072944f6E671220aE73E89E61659E356437B16a5) |
| AgamaEarnRouter | [`0x3Cd1C5e687aE76eb80264FFCCd1CD7369B44190d`](https://www.okx.com/web3/explorer/xlayer-test/address/0x3Cd1C5e687aE76eb80264FFCCd1CD7369B44190d) |
| AgamaAmplifyRouter | [`0x64691CFe29B3f1cB02dC26517da6281C7A9a7bf7`](https://www.okx.com/web3/explorer/xlayer-test/address/0x64691CFe29B3f1cB02dC26517da6281C7A9a7bf7) |
| AgamaAccountFactory | [`0xec7EA4df98cc6B861E39055765d9EAaa872c8291`](https://www.okx.com/web3/explorer/xlayer-test/address/0xec7EA4df98cc6B861E39055765d9EAaa872c8291) |
| agUSDQueue (Agama vault) | [`0xEAd648B0399e283690F10b8ABB765b337e158592`](https://www.okx.com/web3/explorer/xlayer-test/address/0xEAd648B0399e283690F10b8ABB765b337e158592) |
| sagUSD (Agama vault share) | [`0x865ACC9E2034B54d720729B4F890507dF23efF11`](https://www.okx.com/web3/explorer/xlayer-test/address/0x865ACC9E2034B54d720729B4F890507dF23efF11) |
| tUSDG (testnet stand-in) | [`0x06AA0672F88CCB05F7B8d0290C45D03b91f5F31c`](https://www.okx.com/web3/explorer/xlayer-test/address/0x06AA0672F88CCB05F7B8d0290C45D03b91f5F31c) |
| wTSLAx (testnet stand-in) | [`0x9B43fA0d47aF23D49F3603979d849D96EF93eE3C`](https://www.okx.com/web3/explorer/xlayer-test/address/0x9B43fA0d47aF23D49F3603979d849D96EF93eE3C) |

Full list: [`deployments/1952.json`](deployments/1952.json).

The end-to-end scenario below ran against this deployment with real transactions (`python3 scripts/e2e.py testnet`):

```
2. Alice: Earn on 10 wTSLAx at 25% LTV     borrowed 939.56 USDG, HF 1.600, 939.56 USDG parked in the vault
3. Carol: Earn at 30% LTV, no buffer       debt 1127.47 USDG
4. Bob: Amplify 1,000 USDG at 3x           exposure 3000.00, debt 2000.00, HF 1.164
5. vault yield settled                     Bob's exposure 3000.00 -> 3013.50 USDG
6. TSLA 375.82 -> 268.71                   Alice HF 1.144, Carol HF 0.953
7. keeper                                  Alice soft-deleveraged to HF 1.400, keeps all 10 wTSLAx
                                           Carol liquidated partially: SP seized 4.615, Carol keeps 5.385
8. buyer                                   4.615 wTSLAx bought at a 3% discount
9. exits                                   Bob 1013.50 USDG back for 1,000 in, Alice 10 wTSLAx back
E2E PASSED
```

### X Layer mainnet (chain 196)

`script/Deploy.s.sol` targets the real USDG and Backed wrappers, with small caps (5,000 USDG supply, 2,000 USDG borrow). The 46 Foundry tests and the same end-to-end scenario run on a fork of X Layer mainnet (`./scripts/fork-reset.sh && python3 scripts/e2e.py fork`).

## Oracle: how prices reach X Layer

1. **Chainlink Data Streams** (`pushReports`): signed v11 reports, verified on-chain by the X Layer VerifierProxy. Expiry, age and ordering are enforced by our contract, since the FeeManager that normally enforces expiry is absent on X Layer.
2. **Chainlink relay** (current default): the keeper reads the Chainlink TSLA/USD, NVDA/USD, SPY/USD, AAPL/USD push feeds on Arbitrum and writes them through `pushMany`, bounded on-chain by a 15% per-update deviation cap (50% on a reopen gap).

## Known limits, stated plainly

- The Agama vault's private-credit yield is settled on-chain by the operator (`settleYield`). The credit deployment itself happens off-chain with asset managers.
- The keeper relay is a trusted role, bounded by deviation caps; Data Streams removes that trust once credentials are active.
- Instant exits and soft deleverage rely on the vault's liquid reserve (50% target). Larger exits go through the redemption queue.
- `autoUnwind` needs two vault snapshots with measured yield before it can fire, by design.
- Not audited. Mainnet deployment runs with small caps.
