#!/usr/bin/env bash
# Seed the local X Layer fork (anvil, chain 1961) after `forge script script/Deploy.s.sol`.
# Credits real USDG and wrapped xStocks through storage writes, supplies Arrow,
# stakes the stability pool and runs one keeper tick (real Chainlink prices).
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC_URL:-http://127.0.0.1:8545}
DEP=deployments/1961.json
KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil #0: admin, keeper, lender
ADMIN=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEMO=${DEMO_USER:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}        # anvil #1

j() { python3 -c "import json;print(json.load(open('$DEP'))$1)"; }
USDG=$(j "['tokens']['USDG']"); POOL=$(j "['contracts']['pool']"); SP=$(j "['contracts']['stabilityPool']")

set_balance() { # token slot holder amount
  local key; key=$(cast index address "$3" "$2")
  cast rpc anvil_setStorageAt "$1" "$key" "$(cast to-uint256 "$4")" --rpc-url "$RPC" >/dev/null
}

set_balance "$USDG" 1 "$ADMIN" 100000000000        # 100,000 USDG
set_balance "$USDG" 1 "$DEMO" 10000000000          # 10,000 USDG
for w in wTSLAx wNVDAx wSPYx wAAPLx; do
  set_balance "$(j "['tokens']['$w']")" 101 "$DEMO" 10000000000000000000   # 10 each
done
echo "balances credited (admin 100k USDG, demo user 10k USDG + 10 of each xStock)"

cast send "$USDG" "approve(address,uint256)" "$POOL" 20000000000 --private-key $KEY0 --rpc-url "$RPC" >/dev/null
cast send "$POOL" "deposit(uint256,address)" 20000000000 "$ADMIN" --private-key $KEY0 --rpc-url "$RPC" >/dev/null
cast send "$USDG" "approve(address,uint256)" "$SP" 5000000000 --private-key $KEY0 --rpc-url "$RPC" >/dev/null
cast send "$SP" "depositUSDG(uint256,address)" 5000000000 "$ADMIN" --private-key $KEY0 --rpc-url "$RPC" >/dev/null
echo "Arrow supplied 20,000 USDG, stability pool 5,000 USDG"

RPC_URL=$RPC DEPLOYMENT=$DEP KEEPER_KEY=$KEY0 ONCE=1 python3 scripts/keeper.py
