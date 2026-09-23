#!/usr/bin/env python3
"""Buy and Earn with REAL OKX DEX aggregator calldata, on a fork of X Layer mainnet.

    ./scripts/fork-reset.sh && python3 scripts/zap_check.py [usdg_amount]

Asks the OKX Onchain OS DEX API for a swap built for our AgamaZapRouter, then
executes `buyAndEarn` on the fork: the OKX router buys the wrapped xStock and
the Earn position opens for the buyer in the same transaction.
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import okx_dex  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The OKX aggregator signs its market-maker quotes over chain id 196, so the
# zap can only be exercised on a fork that KEEPS chain id 196:
#   anvil --fork-url https://xlayerrpc.okx.com --chain-id 196 --port 8546
#   DEPLOY_FILE=196-fork.json forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8546 --broadcast
RPC = os.environ.get("RPC_URL", "http://127.0.0.1:8546")
DEP = json.load(open(os.path.join(ROOT, "deployments", os.environ.get("DEPLOY_FILE", "196-fork.json"))))
C, A, T = DEP["contracts"], DEP["adapters"], DEP["tokens"]
USER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"  # anvil #2
AMOUNT = int(float(sys.argv[1]) * 1e6) if len(sys.argv) > 1 else 200 * 10**6


def cast(*args):
    r = subprocess.run(["cast", *args, "--rpc-url", RPC], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-400:])
    return r.stdout.strip()


def num(s):
    return int(s.split()[0])


def ensure_prices():
    """A fresh fork has an empty oracle: RedStone signs TSLA/NVDA/AAPL, the
    relay carries SPY."""
    feed = cast("call", C["oracle"], "feed(bytes32)((uint128,uint64,bool,bool))",
                "0x" + b"TSLA".hex().ljust(64, "0"))
    if int(feed.strip("()").split(", ")[0].split()[0]) > 0:
        return
    env = dict(os.environ, RPC_URL=RPC, DEPLOYMENT=os.path.join(ROOT, "deployments",
               os.environ.get("DEPLOY_FILE", "196-fork.json")),
               KEEPER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
               ONCE="1", JOBS="redstone,prices")
    out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "keeper.py")], env=env,
                         capture_output=True, text=True)
    print("   keeper |", out.stdout.strip().splitlines()[-1] if out.stdout.strip() else out.stderr[-200:])


def ensure_liquidity():
    """A fresh fork has no lenders: supply USDG so the Earn borrow can be served."""
    cash = num(cast("call", T["USDG"], "balanceOf(address)(uint256)", C["pool"]))
    if cash >= 20_000 * 10**6:
        return
    admin_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # anvil #0
    admin = subprocess.check_output(["cast", "wallet", "address", admin_key], text=True).strip()
    key = subprocess.check_output(["cast", "index", "address", admin, "1"], text=True).strip()
    cast("rpc", "anvil_setStorageAt", T["USDG"], key, "0x" + format(20_000 * 10**6, "064x"))
    cast("send", T["USDG"], "approve(address,uint256)", C["pool"], str(20_000 * 10**6), "--private-key", admin_key)
    cast("send", C["pool"], "deposit(uint256,address)", str(20_000 * 10**6), admin, "--private-key", admin_key)
    print("   seeded Arrow with 20,000 USDG of lender liquidity")


def main():
    user = subprocess.check_output(["cast", "wallet", "address", USER_KEY], text=True).strip()
    zap = C["zapRouter"]
    print(f"zap {zap}\nuser {user}\nspending {AMOUNT / 1e6:.2f} USDG")
    ensure_prices()
    ensure_liquidity()

    # 1. fund the buyer with USDG (fork storage write) and approve the zap
    key = subprocess.check_output(["cast", "index", "address", user, "1"], text=True).strip()
    cast("rpc", "anvil_setStorageAt", T["USDG"], key, "0x" + format(AMOUNT, "064x"))
    cast("send", T["USDG"], "approve(address,uint256)", zap, str(AMOUNT), "--private-key", USER_KEY)

    # 2. swap calldata LAST, right before sending: aggregator quotes are short-lived
    q = okx_dex.quote(T["USDG"], T["wTSLAx"], str(AMOUNT))
    print(f"quote: {int(q['toTokenAmount']) / 1e18:.6f} wTSLAx at ${float(q['toToken']['tokenUnitPrice']):.2f}")
    spender = okx_dex.approve(T["USDG"], str(AMOUNT))["dexContractAddress"]
    s = okx_dex.swap(T["USDG"], T["wTSLAx"], str(AMOUNT), zap)
    tx = s["tx"]
    min_out = int(tx["minReceiveAmount"])
    print(f"router {tx['to']}  spender {spender}  minReceive {min_out / 1e18:.6f}")

    # 3. one transaction: OKX swap + Earn position
    receipt = json.loads(cast("send", zap, "buyAndEarn(uint256,address,address,bytes,address,uint256,uint256)",
                              str(AMOUNT), tx["to"], spender, tx["data"], A["TSLA"], str(min_out), "2500",
                              "--private-key", USER_KEY, "--gas-limit", "8000000", "--json"))
    if receipt["status"] != "0x1":
        print(cast("run", receipt["transactionHash"])[-1200:])
        raise SystemExit("buyAndEarn reverted")
    print(f"buyAndEarn mined in {int(receipt['gasUsed'], 16):,} gas: {receipt['transactionHash']}")

    out = cast("call", C["earnRouter"],
               "position(address,address)((address,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256))",
               user, A["TSLA"])
    f = [x.split()[0] for x in out.strip("()").split(", ")]
    collateral, value, debt, hf = int(f[1]), int(f[2]), int(f[3]), int(f[4])
    print(f"\nposition: {collateral / 1e18:.6f} wTSLAx worth {value / 1e6:.2f} USDG, "
          f"debt {debt / 1e6:.2f} USDG, HF {hf / 1e27:.3f}")
    assert collateral >= min_out, "bought less than the minimum"
    assert abs(debt - value // 4) < value // 100, "debt should be 25% of the stock value"
    assert num(cast("call", T["USDG"], "balanceOf(address)(uint256)", zap)) == 0, "zap holds nothing"
    print("\033[1mZAP CHECK PASSED (real OKX calldata on a mainnet fork)\033[0m")


if __name__ == "__main__":
    main()
