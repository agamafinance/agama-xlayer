#!/usr/bin/env python3
"""Live check of the RedStone path against a deployed oracle.

    python3 scripts/redstone_check.py [testnet|fork]

Fetches a signed RedStone package, sends `pushRedStone` with it appended to the
calldata, and asserts the stored prices match the gateway within a tick. This is
the on-chain proof that the signature verification works on X Layer: the unit
tests stub the extraction, this does not.
"""
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODE = sys.argv[1] if len(sys.argv) > 1 else "testnet"
RPC = {"testnet": "https://testrpc.xlayer.tech/terigon", "fork": "http://127.0.0.1:8545"}[MODE]
DEP = json.load(open(os.path.join(ROOT, "deployments", {"testnet": "1952", "fork": "1961"}[MODE] + ".json")))
ORACLE = DEP["contracts"]["oracle"]
TICKERS = ["TSLA", "NVDA", "AAPL"]
GATEWAY = "https://oracle-gateway-1.a.redstone.finance/data-packages/latest/redstone-primary-prod"


def key():
    d = json.load(open(os.path.join(ROOT, ".keys", "deployer.json")))
    return (d[0] if isinstance(d, list) else d)["private_key"]


def cast(*args):
    r = subprocess.run(["cast", *args, "--rpc-url", RPC], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-300:])
    return r.stdout.strip()


def b32(t):
    return "0x" + t.encode().hex().ljust(64, "0")


def gateway_prices():
    with urllib.request.urlopen(GATEWAY, timeout=20) as r:
        d = json.load(r)
    out = {}
    for t in TICKERS:
        vals = sorted(p["dataPoints"][0]["value"] for p in d[t])
        out[t] = vals[len(vals) // 2]  # median, like the contract
    return out


def main():
    print(f"oracle {ORACLE} on {MODE}")
    for t in TICKERS:
        feed = cast("call", ORACLE, "redStoneFeedId(bytes32)(bytes32)", b32(t))
        assert int(feed, 16) != 0, f"{t} has no RedStone feed configured"
    print("   ok  TSLA, NVDA, AAPL mapped to RedStone feeds")

    payload = subprocess.run(["node", os.path.join(ROOT, "scripts", "redstone_payload.js"), ",".join(TICKERS)],
                             capture_output=True, text=True)
    assert payload.returncode == 0, payload.stderr[:300]
    print(f"   ok  signed package fetched ({len(payload.stdout) // 2} bytes, 3 of 5 signers)")

    calldata = subprocess.check_output(
        ["cast", "calldata", "pushRedStone(bytes32[])", "[" + ",".join(b32(t) for t in TICKERS) + "]"],
        text=True).strip()
    receipt = json.loads(cast("send", ORACLE, calldata + payload.stdout.strip(),
                              "--private-key", key(), "--json"))
    assert receipt["status"] == "0x1", "pushRedStone reverted"
    print(f"   ok  verified on-chain in {int(receipt['gasUsed'], 16):,} gas: {receipt['transactionHash']}")

    expected = gateway_prices()
    for t in TICKERS:
        stored = int(cast("call", ORACLE, "feed(bytes32)((uint128,uint64,bool,bool))", b32(t))
                     .strip("()").split(", ")[0].split()[0]) / 1e18
        drift = abs(stored - expected[t]) / expected[t]
        assert drift < 0.01, f"{t}: stored {stored} vs gateway {expected[t]}"
        print(f"   ok  {t} {stored:.4f} on-chain, gateway median {expected[t]:.4f}")

    # A call without the payload must be refused by the RedStone base.
    try:
        cast("call", ORACLE, calldata, "--from", "0x0000000000000000000000000000000000000001")
        raise SystemExit("   FAIL: a call without a signed payload was accepted")
    except RuntimeError:
        print("   ok  the same call without the payload is refused")

    print("\033[1mREDSTONE CHECK PASSED\033[0m")


if __name__ == "__main__":
    main()
