# Agama x Arrow on X Layer: web app

Next.js (app router) + wagmi v2 + viem + RainbowKit. Three pages:

- `/` Earn on your stocks: deposit a wrapped xStock, borrow USDG, the USDG goes into the Agama vault (sagUSD). Soft deleverage under HF 1.15.
- `/amplify`: loop the Agama vault on Arrow up to 3x, or stack it on the vault shares of an Earn position.
- `/lend`: supply USDG to the Arrow pool, stake in the Arrow Stability Pool.

## Networks

| Chain | Id | Default | Test tokens |
| --- | --- | --- | --- |
| X Layer Testnet | 1952 | yes, when `deployments/1952.json` exists (public demo) | **Get test tokens** button: 5 wallet txs calling `faucet(to, amount)` on the stand-in tokens (5,000 USDG, 10 of each xStock). Gas OKB: https://web3.okx.com/xlayer/faucet |
| X Layer (fork) | 1961 | when there is no testnet deployment | **Fork faucet** button (anvil cheat codes, see below) |
| X Layer | 196 | when neither exists | real tokens; shows "Not deployed yet" until `deployments/196.json` exists |

Explorer links on 1952 and 196 point to the OKX explorer. On 1952 a strip under the header says the
USDG and xStocks are faucet stand-ins.

## Run

```bash
cd app
pnpm install
pnpm dev          # http://localhost:3021, opens on X Layer Testnet
```

## Run against the local fork

The fork is an anvil node on `http://127.0.0.1:8545` with chain id 1961 and the stack deployed
(`deployments/1961.json` in the repo root).

Pick "X Layer (fork)" in the network menu. In the wallet (OKX Wallet or any injected wallet) add the network:
name `X Layer (fork)`, RPC `http://127.0.0.1:8545`, chain id `1961`, currency `OKB`.
Use the **Fork faucet** button in the header: it credits the connected address with
10,000 USDG, 10 of each wrapped xStock (wTSLAx, wNVDAx, wSPYx, wAAPLx) and 10 OKB
through `anvil_setStorageAt` / `anvil_setBalance` (`app/api/faucet/route.ts`, fork only).

Production build: `pnpm build && pnpm start` (port 3021).

## Addresses and ABIs

`scripts/sync.mjs` runs before `dev` and `build`. It copies `../deployments/*.json` and the ABIs
from the Foundry artifacts (`../out`) into `lib/generated/` as typed modules. Run `forge build`
and the deploy script first; if `../out` or `../deployments` is missing, the committed files in
`lib/generated/` are kept. A chain without a deployment file (X Layer mainnet, 196, until it is
deployed) shows "Not deployed yet".

## Environment (all optional)

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_FORK_RPC` | `http://127.0.0.1:8545` (browser reads on 1961) |
| `FORK_RPC_URL` | `http://127.0.0.1:8545` (faucet route) |
| `NEXT_PUBLIC_XLAYER_RPC` | `https://rpc.xlayer.tech` |
| `NEXT_PUBLIC_XLAYER_TESTNET_RPC` | `https://testrpc.xlayer.tech/terigon` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | placeholder; only needed for the WalletConnect fallback when the OKX extension is not installed |

## Notes

- Every transaction is simulated first, so reverts show a decoded reason (the error ABIs of the
  whole stack are merged for decoding).
- Closing an Earn position reads `closeShortfall(user, adapter)`. If it is 0 the button calls
  `close(adapter)`; otherwise it approves the USDG top-up to the router and calls
  `closeWithTopUp(adapter, maxTopUp)` (the quote plus a 0.5% margin for accrued interest; the
  router only pulls what is missing).
- `next dev` exits when its stdin closes: when starting it from a script, keep stdin open
  (for example `tail -f /dev/null | pnpm dev`).
