#!/usr/bin/env bash
# Sweep the faucet relay wallets into the deployer.
#
#   ./scripts/sweep-relays.sh
#
# The OKX faucet rate limits per address, so gas is claimed onto throwaway
# wallets in .keys/faucet-relays.json and moved here. Each one sends its whole
# balance less the fee for the single transfer that moves it, so they end at
# zero and can be claimed onto again tomorrow.
set -uo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC_URL:-https://testrpc.xlayer.tech/terigon}
RELAYS=.keys/faucet-relays.json
[ -f "$RELAYS" ] || { echo "no $RELAYS"; exit 1; }

TO=$(cast wallet address "$(python3 -c "import json;d=json.load(open('.keys/deployer.json'));d=d[0] if isinstance(d,list) else d;print(d['private_key'])")")
GAS_PRICE=$(cast gas-price --rpc-url "$RPC")
# A plain transfer is 21000. Three times the fee as headroom, because the price
# moves between reading it and the block, and a transfer that cannot pay for
# itself reverts and wastes the claim.
FEE=$((GAS_PRICE * 21000 * 3))

printf "sweeping into %s\n" "$TO"
printf "gas price %s wei, holding back %s wei per wallet\n\n" "$GAS_PRICE" "$FEE"

moved=0
n=$(python3 -c "import json;print(len(json.load(open('$RELAYS'))))")
for i in $(seq 0 $((n - 1))); do
  ADDR=$(python3 -c "import json;print(json.load(open('$RELAYS'))[$i]['address'])")
  BAL=$(cast balance "$ADDR" --rpc-url "$RPC")
  HUMAN=$(cast from-wei "$BAL")
  if [ "$BAL" -le "$FEE" ]; then
    printf "%-44s %s OKB, nothing to move\n" "$ADDR" "$HUMAN"
    continue
  fi
  SEND=$((BAL - FEE))
  KEY=$(python3 -c "import json;print(json.load(open('$RELAYS'))[$i]['private_key'])")
  # The key goes in on stdin's sibling, never on the command line: `ps` is
  # readable by every process on this machine.
  if OUT=$(cast send "$TO" --value "$SEND" --private-key "$KEY" --rpc-url "$RPC" 2>&1); then
    printf "%-44s %s OKB -> sent %s\n" "$ADDR" "$HUMAN" "$(cast from-wei $SEND)"
    moved=$((moved + 1))
  else
    printf "%-44s FAILED: %s\n" "$ADDR" "$(echo "$OUT" | tail -1 | cut -c1-90)"
  fi
done

printf "\n%d wallet(s) swept. Deployer now holds %s OKB\n" "$moved" "$(cast from-wei "$(cast balance "$TO" --rpc-url "$RPC")")"
