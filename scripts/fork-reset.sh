#!/usr/bin/env bash
# Fresh local fork of X Layer mainnet with the full stack deployed and seeded.
# Needs anvil running: anvil --fork-url https://xlayerrpc.okx.com --chain-id 1961
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=${RPC_URL:-http://127.0.0.1:8545}
cast rpc anvil_reset '{"forking":{"jsonRpcUrl":"https://xlayerrpc.okx.com"}}' --rpc-url "$RPC" >/dev/null
SUPPLY_CAP_USDG=1000000 BORROW_CAP_USDG=500000 SP_COOLDOWN=3600 \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 | grep -E "written|Error"
./scripts/seed-fork.sh
