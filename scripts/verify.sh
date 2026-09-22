#!/usr/bin/env bash
# Verify every deployed contract on the OKLink X Layer explorer.
#   ./scripts/verify.sh 1952   (testnet)   |   ./scripts/verify.sh 196   (mainnet)
# OKLINK_API_KEY is passed if set (https://www.oklink.com/account/my-api).
set -uo pipefail
cd "$(dirname "$0")/.."
CHAIN=${1:-1952}
case $CHAIN in
  196) SHORT=XLAYER ;;
  1952) SHORT=XLAYER_TESTNET ;;
  *) echo "unknown chain $CHAIN"; exit 1 ;;
esac
URL="https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/$SHORT"
KEY_ARGS=()
[ -n "${OKLINK_API_KEY:-}" ] && KEY_ARGS=(--etherscan-api-key "$OKLINK_API_KEY")
RUN=broadcast/$( [ "$CHAIN" = 1952 ] && echo DeployTestnet.s.sol || echo Deploy.s.sol )/$CHAIN/run-latest.json

python3 - "$RUN" <<'PY' > /tmp/verify_targets.txt
import json, sys
run = json.load(open(sys.argv[1]))
for tx in run["transactions"]:
    if tx["transactionType"] == "CREATE" and tx.get("contractName"):
        print(tx["contractAddress"], tx["contractName"], tx.get("arguments") and "|".join(map(str, tx["arguments"])) or "")
PY

while read -r addr name args; do
  path=$(grep -rl "^contract $name\b" src | head -1)
  [ -z "$path" ] && { echo "skip $name (source not found)"; continue; }
  echo "== $name $addr"
  forge verify-contract "$addr" "$path:$name" --verifier oklink --verifier-url "$URL" \
    --chain "$CHAIN" --guess-constructor-args --rpc-url "$( [ "$CHAIN" = 1952 ] && echo https://testrpc.xlayer.tech/terigon || echo https://rpc.xlayer.tech )" \
    "${KEY_ARGS[@]}" --watch 2>&1 | tail -2
done < /tmp/verify_targets.txt
