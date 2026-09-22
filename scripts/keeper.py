#!/usr/bin/env python3
"""Arrow x Agama keeper for X Layer.

One tick does three jobs:

1. Prices. Writes TSLA / NVDA / SPY / AAPL into the StockOracle.
   - Preferred: Chainlink Data Streams. If DS_API_KEY and DS_API_SECRET are set,
     the keeper fetches the latest signed v11 reports and calls
     `pushReports(bytes[])`. The oracle verifies them on-chain against the X Layer
     VerifierProxy, so the keeper is only a carrier.
   - Fallback: relay of the Chainlink push feeds on Arbitrum (TSLA/USD, NVDA/USD,
     SPY/USD, AAPL/USD) through `pushMany`, bounded on-chain by the deviation cap.
     A value is relayed as current only while it is inside the feed heartbeat.
   Market status follows the xStocks 24/5 schedule (Sunday 20:00 to Friday 20:00
   New York time, NYSE holidays closed) unless Data Streams says otherwise.

2. Protection. For every Agama account: HF < 1.15 with free vault shares ->
   `softDeleverage`; HF < 1 -> `ArrowStabilityPool.liquidate`.

3. Vault CAPO snapshot, once a day (permissionless `snapshot()`).

Requires Foundry's `cast` on PATH. Config via env:
  RPC_URL (default https://rpc.xlayer.tech), DEPLOYMENT (deployments/196.json),
  KEEPER_KEY (private key with KEEPER_ROLE), ARB_RPC_URL, DS_API_KEY, DS_API_SECRET,
  DS_HOST (default https://api.dataengine.chain.link), INTERVAL (seconds, default 300),
  ONCE=1 to run a single tick, JOBS=prices,protection,snapshot to pick jobs.
"""

import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPC = os.environ.get("RPC_URL", "https://rpc.xlayer.tech")
ARB_RPC = os.environ.get("ARB_RPC_URL", "https://arb1.arbitrum.io/rpc")
KEY = os.environ.get("KEEPER_KEY", "")
DEPLOYMENT = os.environ.get("DEPLOYMENT", os.path.join(ROOT, "deployments", "196.json"))
DS_KEY = os.environ.get("DS_API_KEY", "")
DS_SECRET = os.environ.get("DS_API_SECRET", "")
DS_HOST = os.environ.get("DS_HOST", "https://api.dataengine.chain.link")
INTERVAL = int(os.environ.get("INTERVAL", "300"))

TICKERS = ["TSLA", "NVDA", "SPY", "AAPL"]

# Chainlink push feeds on Arbitrum One (8 decimals), used for the relay fallback.
ARB_FEEDS = {
    "TSLA": "0x3609baAa0a9b1f0FE4d6CC01884585d0e191C3E3",
    "NVDA": "0x4881A4418b5F2460B21d6F08CD5aA0678a7f262F",
    "SPY": "0x46306F3795342117721D8DEd50fbcF6DF2b3cc10",
    "AAPL": "0x8d0CC5f38f9E802475f2CFf4F9fc7000C2E1557c",
}
ARB_HEARTBEAT = 26 * 3600  # 24h heartbeat plus margin

# Chainlink Data Streams v11 feed IDs (US equities, regular hours).
DS_FEEDS = {
    "TSLA": "0x000b2dbed1640ead18d37338b75e4755630a900649261baf4ed79d9a749be13d",
    "NVDA": "0x000b6aa036224454037bab103184565f6aa9ea589c3b349f6d8471ee753524b9",
    "SPY": "0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac",
    "AAPL": "0x000bbd87a23775b4c11092ae9a1fc7b3393636ae1dbb9f1ef460f845c0f4cff1",
}

NYSE_HOLIDAYS_2026 = {
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16), date(2026, 4, 3),
    date(2026, 5, 25), date(2026, 6, 19), date(2026, 7, 3), date(2026, 9, 7),
    date(2026, 11, 26), date(2026, 12, 25),
}

SOFT_TRIGGER = 115 * 10**25  # 1.15 RAY
RAY = 10**27


def log(*a):
    print(datetime.now(timezone.utc).strftime("%H:%M:%S"), *a, flush=True)


def cast(*args, rpc=RPC):
    out = subprocess.run(["cast", *args, "--rpc-url", rpc], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip().splitlines()[-1] if out.stderr else "cast failed")
    return out.stdout.strip()


def call(to, sig, *args, rpc=RPC):
    return cast("call", to, sig, *args, rpc=rpc)


def send(to, sig, *args):
    if not KEY:
        raise RuntimeError("KEEPER_KEY not set")
    return cast("send", to, sig, *args, "--private-key", KEY, "--json")


def first_int(s):
    return int(s.split()[0])


def market_open_24_5(now_utc=None):
    """xStocks trade 24/5: Sunday 20:00 to Friday 20:00 New York time."""
    ny = (now_utc or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    if ny.date() in NYSE_HOLIDAYS_2026:
        return False
    wd, hour = ny.weekday(), ny.hour  # Monday = 0
    if wd == 5:
        return False
    if wd == 6:
        return hour >= 20
    if wd == 4:
        return hour < 20
    return True


def b32(ticker):
    return "0x" + ticker.encode().hex().ljust(64, "0")


# ---- price sources ------------------------------------------------------------------


def ds_headers(method, path, body=b""):
    ts = str(int(time.time() * 1000))
    body_hash = hashlib.sha256(body).hexdigest()
    msg = f"{method} {path} {body_hash} {DS_KEY} {ts}"
    sig = hmac.new(DS_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return {
        "Authorization": DS_KEY,
        "X-Authorization-Timestamp": ts,
        "X-Authorization-Signature-SHA256": sig,
    }


def data_streams_reports():
    reports = []
    for t in TICKERS:
        path = f"/api/v1/reports/latest?feedID={DS_FEEDS[t]}"
        req = urllib.request.Request(DS_HOST + path, headers=ds_headers("GET", path))
        with urllib.request.urlopen(req, timeout=10) as r:
            reports.append(json.load(r)["report"]["fullReport"])
    return reports


def arbitrum_prices():
    now = int(time.time())
    prices = {}
    for t, feed in ARB_FEEDS.items():
        out = call(feed, "latestRoundData()(uint80,int256,uint256,uint256,uint80)", rpc=ARB_RPC).splitlines()
        answer, updated = first_int(out[1]), first_int(out[3])
        if now - updated > ARB_HEARTBEAT:
            log(f"{t}: Arbitrum feed outside heartbeat ({now - updated}s), skipped")
            continue
        prices[t] = answer * 10**10  # 8 -> 18 decimals
    return prices


def tick_prices(dep):
    oracle = dep["contracts"]["oracle"]
    if DS_KEY and DS_SECRET:
        reports = data_streams_reports()
        send(oracle, "pushReports(bytes[])", "[" + ",".join(reports) + "]")
        log("Data Streams: pushed", len(reports), "verified reports")
        return
    prices = arbitrum_prices()
    if not prices:
        return
    is_open = market_open_24_5()
    names = [t for t in TICKERS if t in prices]
    # Observation time = chain time (a fork's clock may lag the wall clock).
    ts = first_int(cast("block", "latest", "-f", "timestamp"))
    tick_arr = "[" + ",".join(b32(t) for t in names) + "]"
    px_arr = "[" + ",".join(str(prices[t]) for t in names) + "]"
    send(oracle, "pushMany(bytes32[],uint256[],uint64,bool)", tick_arr, px_arr, str(ts), "true" if is_open else "false")
    log("relay:", {t: round(prices[t] / 1e18, 2) for t in names}, "open" if is_open else "closed")


# ---- protection -----------------------------------------------------------------------


def tick_protection(dep):
    factory = dep["contracts"]["factory"]
    pool = dep["contracts"]["pool"]
    sp = dep["contracts"]["stabilityPool"]
    stocks = [dep["adapters"][t] for t in TICKERS]
    n = first_int(call(factory, "accountCount()(uint256)"))
    for i in range(n):
        acct = call(factory, "accounts(uint256)(address)", str(i))
        for adapter in stocks + [dep["adapters"]["VAULT"]]:
            debt = first_int(call(pool, "getPositionScaledDebt(address,address,bytes)(uint256)", adapter, acct, "0x"))
            if debt == 0:
                continue
            try:
                hf = first_int(call(pool, "calculateHealthFactor(address,address,bytes)(uint256)", adapter, acct, "0x"))
            except RuntimeError as e:
                log(f"{acct[:10]} HF unreadable ({e})")
                continue
            if hf < RAY:
                send(sp, "liquidate(address,address)", adapter, acct)
                log(f"liquidated {acct[:10]} on {adapter[:10]} (HF {hf / RAY:.3f})")
            elif hf < SOFT_TRIGGER and adapter in stocks:
                free = first_int(call(acct, "freeShares()(uint256)"))
                if free > 0:
                    send(acct, "softDeleverage(address)", adapter)
                    log(f"soft-deleveraged {acct[:10]} (HF {hf / RAY:.3f})")


def tick_snapshot(dep):
    va = dep["adapters"]["VAULT"]
    last = first_int(call(va, "snapshotAt()(uint256)"))
    if time.time() > last + 86400 + 60:
        send(va, "snapshot()")
        log("vault CAPO snapshot")


def main():
    dep = json.load(open(DEPLOYMENT))
    log("keeper on chain", dep["chainId"], "source:", "Data Streams" if DS_KEY else "Chainlink Arbitrum relay")
    while True:
        jobs = {"prices": tick_prices, "protection": tick_protection, "snapshot": tick_snapshot}
        selected = os.environ.get("JOBS", "prices,protection,snapshot").split(",")
        for job in (jobs[j] for j in selected):
            try:
                job(dep)
            except Exception as e:  # keep ticking
                log(f"{job.__name__} failed: {e}")
        if os.environ.get("ONCE"):
            return
        time.sleep(INTERVAL)


if __name__ == "__main__":
    sys.exit(main())
