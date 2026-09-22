#!/usr/bin/env bash
# Guarded launch on X Layer mainnet (chain 196).
#
#   ./scripts/mainnet-deploy.sh preflight   # what the deployer still needs
#   ./scripts/mainnet-deploy.sh deploy      # deploy, seed, price, verify
#
# Caps stay small on purpose: 5,000 USDG of supply, 2,000 USDG of borrow.
# The deployer key lives in .keys/deployer.json (gitignored).
set -uo pipefail
cd "$(dirname "$0")/.."

RPC=https://rpc.xlayer.tech
USDG=0x4ae46a509F6b1D9056937BA4500cb143933D2dc8
SEED_USDG=${SEED_USDG:-200000000}      # 200 USDG of lender liquidity
SEED_SP=${SEED_SP:-100000000}          # 100 USDG staked in the stability pool
KEY=$(python3 -c "import json;d=json.load(open('.keys/deployer.json'));d=d[0] if isinstance(d,list) else d;print(d['private_key'])")
ME=$(cast wallet address "$KEY")

okb() { cast balance "$ME" --rpc-url $RPC; }
usdg() { cast call $USDG "balanceOf(address)(uint256)" "$ME" --rpc-url $RPC | awk '{print $1}'; }

preflight() {
  echo "deployer  $ME"
  printf "OKB       %s (need ~0.01 for deploy + seed)\n" "$(cast from-wei "$(okb)")"
  printf "USDG      %s (need %s for the pool + SP seed)\n" \
    "$(python3 -c "print(f'{$(usdg)/1e6:.2f}')")" \
    "$(python3 -c "print(f'{($SEED_USDG+$SEED_SP)/1e6:.2f}')")"
  for t in wTSLAx:0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171 wSPYx:0xE7E553Cd128F0011777323A0b44a7b96EA1CB540; do
    n=${t%%:*}; a=${t##*:}
    printf "%-9s %s (optional, for a live demo position)\n" "$n" \
      "$(cast call "$a" "balanceOf(address)(uint256)" "$ME" --rpc-url $RPC | awk '{printf "%.6f", $1/1e18}')"
  done
}

deploy() {
  [ "$(okb)" -lt 5000000000000000 ] && { echo "not enough OKB, run preflight"; exit 1; }
  SUPPLY_CAP_USDG=5000 BORROW_CAP_USDG=2000 SP_COOLDOWN=86400 \
    forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --slow --private-key "$KEY" \
    | grep -E "written|ONCHAIN|Error"
  DEP=deployments/196.json
  POOL=$(python3 -c "import json;print(json.load(open('$DEP'))['contracts']['pool'])")
  SP=$(python3 -c "import json;print(json.load(open('$DEP'))['contracts']['stabilityPool'])")

  if [ "$(usdg)" -ge $((SEED_USDG + SEED_SP)) ]; then
    cast send $USDG "approve(address,uint256)" "$POOL" $SEED_USDG --private-key "$KEY" --rpc-url $RPC >/dev/null
    cast send "$POOL" "deposit(uint256,address)" $SEED_USDG "$ME" --private-key "$KEY" --rpc-url $RPC >/dev/null
    cast send $USDG "approve(address,uint256)" "$SP" $SEED_SP --private-key "$KEY" --rpc-url $RPC >/dev/null
    cast send "$SP" "depositUSDG(uint256,address)" $SEED_SP "$ME" --private-key "$KEY" --rpc-url $RPC >/dev/null
    echo "seeded: $((SEED_USDG / 1000000)) USDG lending, $((SEED_SP / 1000000)) USDG stability pool"
  else
    echo "skipped seeding: not enough USDG"
  fi

  RPC_URL=$RPC DEPLOYMENT=$DEP KEEPER_KEY="$KEY" ONCE=1 JOBS=prices python3 scripts/keeper.py
  ./scripts/verify.sh 196 | tail -3
  echo "keeper: tmux new -d -s agama-keeper-main './scripts/run-keeper.sh mainnet'"
}

case "${1:-preflight}" in
  preflight) preflight ;;
  deploy) deploy ;;
  *) echo "usage: $0 preflight|deploy"; exit 1 ;;
esac
