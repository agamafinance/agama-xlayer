#!/usr/bin/env python3
"""End-to-end run of Arrow x Agama with real transactions.

    python3 scripts/e2e.py fork      # local X Layer mainnet fork (anvil, chain 1961)
    python3 scripts/e2e.py testnet   # X Layer testnet (chain 1952), deployer in .keys/

Scenario (every step asserted on-chain state):
  1. keeper relays real Chainlink prices
  2. Alice: Earn on 10 wTSLAx at 25% LTV (keeps her vault shares as buffer)
  3. Carol: Earn on 10 wTSLAx at 30% LTV, then pulls her vault shares out (no buffer)
  4. Bob: Amplify 1,000 USDG at 3x
  5. vault yield settled by the operator -> Bob's equity grows
  6. TSLA crash to ~71% in steps inside the oracle deviation cap
  7. keeper protection tick: Alice soft-deleveraged (stock untouched),
     Carol partially liquidated by the stability pool (keeps the rest)
  8. a buyer takes the SP inventory at the 3% discount
  9. TSLA recovers, Bob closes Amplify to USDG, Alice closes Earn and gets her 10 wTSLAx back
"""

import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODE = sys.argv[1] if len(sys.argv) > 1 else "fork"
RPC = {"fork": "http://127.0.0.1:8545", "testnet": "https://testrpc.xlayer.tech/terigon"}[MODE]
DEP = json.load(open(os.path.join(ROOT, "deployments", {"fork": "1961", "testnet": "1952"}[MODE] + ".json")))
C, A, T = DEP["contracts"], DEP["adapters"], DEP["tokens"]
RAY = 10**27
E18 = 10**18
E6 = 10**6

ANVIL_KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
]


def keys():
    if MODE == "fork":
        return {"admin": ANVIL_KEYS[0], "alice": ANVIL_KEYS[2], "carol": ANVIL_KEYS[3],
                "bob": ANVIL_KEYS[4], "buyer": ANVIL_KEYS[5]}
    dep = json.load(open(os.path.join(ROOT, ".keys", "deployer.json")))
    dep = dep[0] if isinstance(dep, list) else dep
    path = os.path.join(ROOT, ".keys", "e2e.json")
    if not os.path.exists(path):
        ks = {}
        for name in ("alice", "carol", "bob", "buyer"):
            w = json.loads(subprocess.check_output(["cast", "wallet", "new", "--json"]))
            w = w[0] if isinstance(w, list) else w
            ks[name] = w["private_key"]
        json.dump(ks, open(path, "w"))
        os.chmod(path, 0o600)
    ks = json.load(open(path))
    ks["admin"] = dep["private_key"]
    return ks


K = keys()
ADDR = {n: subprocess.check_output(["cast", "wallet", "address", k], text=True).strip() for n, k in K.items()}


def cast(*args):
    r = subprocess.run(["cast", *args, "--rpc-url", RPC], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"cast {args[0]} {args[1] if len(args) > 1 else ''}: {r.stderr.strip()[-400:]}")
    return r.stdout.strip()


def call(to, sig, *args):
    return cast("call", to, sig, *args)


def num(s):
    return int(s.split()[0])


def send(who, to, sig, *args, value=None):
    extra = ["--value", str(value)] if value else []
    out = cast("send", to, sig, *args, "--private-key", K[who], "--json", *extra)
    tx = json.loads(out)
    if tx.get("status") not in ("0x1", 1, "1"):
        raise RuntimeError(f"tx reverted: {sig}")
    return tx["transactionHash"]


def step(msg):
    print(f"\n\033[1m== {msg}\033[0m", flush=True)


def ok(cond, msg):
    if not cond:
        raise SystemExit(f"   FAIL: {msg}")
    print(f"   ok  {msg}", flush=True)


def b32(t):
    return "0x" + t.encode().hex().ljust(64, "0")


def fund():
    step("0. funding actors")
    if MODE == "fork":
        for n in ("alice", "carol", "bob", "buyer"):
            cast("rpc", "anvil_setBalance", ADDR[n], hex(10 * E18))
        def setbal(token, slot, who, amount):
            key = subprocess.check_output(["cast", "index", "address", who, str(slot)], text=True).strip()
            cast("rpc", "anvil_setStorageAt", token, key, "0x" + format(amount, "064x"))
        for n in ("alice", "carol"):
            setbal(T["wTSLAx"], 101, ADDR[n], 10 * E18)
        setbal(T["USDG"], 1, ADDR["bob"], 5_000 * E6)
        setbal(T["USDG"], 1, ADDR["buyer"], 5_000 * E6)
        setbal(T["USDG"], 1, ADDR["admin"], 100_000 * E6)
    else:
        for n in ("alice", "carol", "bob", "buyer"):
            if num(cast("balance", ADDR[n])) < 2 * 10**15:
                send("admin", ADDR[n], "", value=3 * 10**15)  # 0.003 OKB of gas
        for n in ("alice", "carol"):
            if num(call(T["wTSLAx"], "balanceOf(address)(uint256)", ADDR[n])) < 10 * E18:
                send(n, T["wTSLAx"], "faucet(address,uint256)", ADDR[n], str(10 * E18))
        for n in ("bob", "buyer", "admin"):
            send(n, T["USDG"], "faucet(address,uint256)", ADDR[n], str(5_000 * E6))
    ok(num(call(T["wTSLAx"], "balanceOf(address)(uint256)", ADDR["alice"])) >= 10 * E18, "alice holds 10 wTSLAx")
    ok(num(call(T["USDG"], "balanceOf(address)(uint256)", ADDR["bob"])) >= 1_000 * E6, "bob holds USDG")


def keeper(jobs):
    env = dict(os.environ, RPC_URL=RPC, DEPLOYMENT=os.path.join(ROOT, "deployments", str(DEP["chainId"]) + ".json"),
               KEEPER_KEY=K["admin"], ONCE="1", JOBS=jobs)
    out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "keeper.py")], env=env,
                         capture_output=True, text=True)
    for line in out.stdout.strip().splitlines():
        print("   keeper |", line)


def feed(ticker):
    out = call(C["oracle"], "feed(bytes32)((uint128,uint64,bool,bool))", b32(ticker))
    parts = out.strip("()").split(", ")
    return int(parts[0].split()[0]), int(parts[1].split()[0]), parts[2] == "true"


def push(ticker, price):
    _, last_obs, is_open = feed(ticker)
    while True:
        now = num(cast("block", "latest", "-f", "timestamp"))
        if now > last_obs:
            break
        if MODE == "fork":
            cast("rpc", "evm_mine")  # anvil only advances time when a block is mined
        else:
            time.sleep(1)
    send("admin", C["oracle"], "push(bytes32,uint256,uint64,bool)", b32(ticker), str(price), str(now), "true")


def walk(ticker, target):
    cur, _, _ = feed(ticker)
    while cur != target:
        nxt = max(target, cur * 86 // 100) if target < cur else min(target, cur * 114 // 100)
        push(ticker, nxt)
        cur = nxt
        print(f"   {ticker} -> {cur / E18:.2f}")


def earn_pos(user):
    out = call(C["earnRouter"], "position(address,address)((address,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256))",
               ADDR[user], A["TSLA"])
    f = [x.split()[0] for x in out.strip("()").split(", ")]
    return {"account": f[0], "collateral": int(f[1]), "value": int(f[2]), "debt": int(f[3]), "hf": int(f[4]),
            "free": int(f[5]), "freeValue": int(f[6])}


def amp_pos(user):
    out = call(C["amplifyRouter"], "position(address)((address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))",
               ADDR[user])
    f = [x.split()[0] for x in out.strip("()").split(", ")]
    return {"account": f[0], "shares": int(f[1]), "exposure": int(f[2]), "debt": int(f[3]), "equity": int(f[4]),
            "lev": int(f[5]), "hf": int(f[6])}


def main():
    print(f"Arrow x Agama e2e on {MODE} (chain {DEP['chainId']})")
    for n, a in ADDR.items():
        print(f"   {n:6s} {a}")
    fund()

    step("1. keeper relays Chainlink prices")
    keeper("prices")
    p0, _, is_open = feed("TSLA")
    ok(p0 > 0 and is_open, f"TSLA {p0 / E18:.2f} USD, market open")

    step("2. Alice: Earn on 10 wTSLAx at 25% LTV")
    send("alice", T["wTSLAx"], "approve(address,uint256)", C["earnRouter"], str(10 * E18))
    send("alice", C["earnRouter"], "open(address,uint256,uint256)", A["TSLA"], str(10 * E18), "2500")
    a = earn_pos("alice")
    ok(abs(a["debt"] - a["value"] // 4) <= 2, f"borrowed {a['debt'] / E6:.2f} USDG = 25% of {a['value'] / E6:.2f}")
    ok(abs(a["hf"] - 16 * RAY // 10) < RAY // 1000, f"HF {a['hf'] / RAY:.3f}")
    ok(abs(a["freeValue"] - a["debt"]) <= 2, f"{a['freeValue'] / E6:.2f} USDG parked in the Agama vault")

    step("3. Carol: Earn at 30% LTV, then withdraws her vault shares (no buffer)")
    send("carol", T["wTSLAx"], "approve(address,uint256)", C["earnRouter"], str(10 * E18))
    send("carol", C["earnRouter"], "open(address,uint256,uint256)", A["TSLA"], str(10 * E18), "3000")
    c = earn_pos("carol")
    send("carol", c["account"], "sweep(address)", C["sagUSD"])
    ok(earn_pos("carol")["free"] == 0, f"Carol debt {c['debt'] / E6:.2f} USDG, buffer removed")

    step("4. Bob: Amplify 1,000 USDG at 3x")
    send("bob", T["USDG"], "approve(address,uint256)", C["amplifyRouter"], str(1_000 * E6))
    send("bob", C["amplifyRouter"], "open(uint256,uint256)", str(1_000 * E6), "30000")
    b = amp_pos("bob")
    ok(29_500 <= b["lev"] <= 30_100, f"leverage {b['lev'] / 10_000:.2f}x, exposure {b['exposure'] / E6:.2f}, debt {b['debt'] / E6:.2f}, HF {b['hf'] / RAY:.3f}")

    step("5. vault yield settled (0.5% of vault assets)")
    vault_assets = num(call(C["sagUSD"], "totalAssets()(uint256)")) // 10**12
    y = vault_assets // 200
    shares_b = num(call(A["VAULT"], "balanceOf(address)(uint256)", b["account"]))
    live_before = num(call(C["sagUSD"], "convertToAssets(uint256)(uint256)", str(shares_b))) // 10**12
    send("admin", T["USDG"], "transfer(address,uint256)", C["queue"], str(y))
    send("admin", C["queue"], "settleYield(uint256)", str(y))
    live_after = num(call(C["sagUSD"], "convertToAssets(uint256)(uint256)", str(shares_b))) // 10**12
    ok(live_after > live_before, f"Bob's exposure {live_before / E6:.2f} -> {live_after / E6:.2f} USDG (+{(live_after - live_before) / E6:.2f}, 3x the yield of his equity)")

    step("6. TSLA crash to ~71.5% (steps inside the 15% deviation cap)")
    walk("TSLA", p0 * 715 // 1000)
    a, c = earn_pos("alice"), earn_pos("carol")
    ok(a["hf"] < 115 * RAY // 100, f"Alice HF {a['hf'] / RAY:.3f} < 1.15 (soft-deleverage zone)")
    ok(c["hf"] < RAY, f"Carol HF {c['hf'] / RAY:.3f} < 1 (liquidatable)")

    step("7. keeper protection tick")
    sp_inv_before = num(call(T["wTSLAx"], "balanceOf(address)(uint256)", C["stabilityPool"]))
    keeper("protection")
    a, c = earn_pos("alice"), earn_pos("carol")
    ok(abs(a["hf"] - 14 * RAY // 10) < RAY // 100, f"Alice HF back to {a['hf'] / RAY:.3f}")
    ok(a["collateral"] == 10 * E18, "Alice still holds all 10 wTSLAx: the vault shares paid")
    seized = num(call(T["wTSLAx"], "balanceOf(address)(uint256)", C["stabilityPool"])) - sp_inv_before
    ok(c["debt"] == 0 and 0 < c["collateral"] < 10 * E18,
       f"Carol liquidated partially: SP seized {seized / E18:.3f} wTSLAx, Carol keeps {c['collateral'] / E18:.3f}")

    step("8. buyer takes the SP inventory at a 3% discount")
    inv = num(call(T["wTSLAx"], "balanceOf(address)(uint256)", C["stabilityPool"]))
    fair = num(call(A["TSLA"], "valueOf(uint256)(uint256)", str(inv)))
    max_cost = fair * 9_700 // 10_000 + 2
    send("buyer", T["USDG"], "approve(address,uint256)", C["stabilityPool"], str(max_cost))
    send("buyer", C["stabilityPool"], "buyCollateral(address,uint256,uint256,address)", A["TSLA"], str(inv), str(max_cost), ADDR["buyer"])
    ok(num(call(T["wTSLAx"], "balanceOf(address)(uint256)", ADDR["buyer"])) >= inv,
       f"buyer paid ~{max_cost / E6:.2f} USDG for {inv / E18:.3f} wTSLAx worth {fair / E6:.2f}")

    step("9. recovery and exits")
    walk("TSLA", p0)
    usdg_before = num(call(T["USDG"], "balanceOf(address)(uint256)", ADDR["bob"]))
    send("bob", C["amplifyRouter"], "close(bool)", "true")
    got = num(call(T["USDG"], "balanceOf(address)(uint256)", ADDR["bob"])) - usdg_before
    ok(got > 1_000 * E6, f"Bob closed Amplify: {got / E6:.2f} USDG back for 1,000 in")
    send("alice", C["earnRouter"], "close(address)", A["TSLA"])
    ok(num(call(T["wTSLAx"], "balanceOf(address)(uint256)", ADDR["alice"])) >= 10 * E18, "Alice closed Earn: 10 wTSLAx back")

    print("\n\033[1mE2E PASSED\033[0m")


if __name__ == "__main__":
    main()
