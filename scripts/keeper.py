#!/usr/bin/env python3
"""Arrow x Agama keeper for X Layer.

One tick does three jobs:

1. Prices. Writes TSLA / NVDA / SPY / AAPL into the StockOracle.
   - RedStone (default for TSLA, NVDA, AAPL): a signed data package is fetched
     from the public gateway, appended to the calldata of `pushRedStone`, and
     the signatures of three of five authorised signers are checked on-chain.
     RedStone stops publishing when the US market closes, so a failed push
     outside trading hours is expected, and the relay below keeps the market
     status up to date. RedStone does not publish SPY.
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

3. Agents. The user deposits a stock and never touches it again:
   - `rebalance` keeps every position at the LTV its owner picked (the stock
     went up: borrow more and put it in the vault; it went down: repay from the
     yield buffer, never from the stock).
   - `compoundIntoStock` turns the vault yield above the debt into MORE STOCK
     and adds it as collateral, through the swap venue the zap allowlists.
   Both are permissionless: the keeper is convenience, not control.

4. Vault CAPO snapshot, once a day (permissionless `snapshot()`).

Requires Foundry's `cast` on PATH. Config via env:
  RPC_URL (default https://xlayerrpc.okx.com), DEPLOYMENT (deployments/196.json),
  KEEPER_KEY (private key with KEEPER_ROLE), ARB_RPC_URL, DS_API_KEY, DS_API_SECRET,
  DS_HOST (default https://api.dataengine.chain.link), INTERVAL (seconds, default 300),
  ONCE=1 to run a single tick, JOBS=redstone,prices,protection,agents,snapshot to pick jobs.
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
RPC = os.environ.get("RPC_URL", "https://xlayerrpc.okx.com")
ARB_RPC = os.environ.get("ARB_RPC_URL", "https://arb1.arbitrum.io/rpc")
KEY = os.environ.get("KEEPER_KEY", "")
DEPLOYMENT = os.environ.get("DEPLOYMENT", os.path.join(ROOT, "deployments", "196.json"))
DS_KEY = os.environ.get("DS_API_KEY", "")
DS_SECRET = os.environ.get("DS_API_SECRET", "")
DS_HOST = os.environ.get("DS_HOST", "https://api.dataengine.chain.link")
INTERVAL = int(os.environ.get("INTERVAL", "300"))
# Gas ceilings per kind of call, each several times what it actually burns.
GAS_PRICE_PUSH = 400_000      # one oracle push, signed payload included
GAS_AGENT = 3_000_000         # rebalance, compound (a swap through a router)
GAS_PROTECTION = 6_000_000    # soft deleverage and liquidation walk positions
DEFAULT_GAS = GAS_PROTECTION

TICKERS = ["TSLA", "NVDA", "SPY", "AAPL"]
# Tickers RedStone publishes (no SPY, no ETFs).
REDSTONE_TICKERS = ["TSLA", "NVDA", "AAPL"]

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


TRANSIENT = ("error sending request", "timed out", "connection reset", "502", "503", "504", "EOF")


def cast(*args, rpc=RPC):
    # Retry transient transport errors of public RPCs (not reverts).
    for attempt in range(5):
        out = subprocess.run(["cast", *args, "--rpc-url", rpc], capture_output=True, text=True)
        if out.returncode == 0:
            return out.stdout.strip()
        if attempt < 4 and any(t in out.stderr for t in TRANSIENT):
            time.sleep(2 + 2 * attempt)
            continue
        raise RuntimeError(out.stderr.strip().splitlines()[-1] if out.stderr else "cast failed")


def call(to, sig, *args, rpc=RPC):
    return cast("call", to, sig, *args, rpc=rpc)


def send(to, sig, *args, gas=DEFAULT_GAS):
    """`sig` may be a signature plus args, or a full calldata hex blob.

    Always checks the receipt: a mined-but-reverted transaction must never be
    reported as a success (a keeper that lies about a liquidation is worse than
    one that stops).

    Gas is set explicitly because estimation is tight on the loop-heavy paths,
    but the limit is per call rather than one blanket number. A node requires
    the sender to cover `gasLimit * gasPrice` up front even when the call burns
    a fraction of it, so a 6M limit on a 60k price push means a keeper with a
    faucet-sized balance cannot push a price at all.
    """
    if not KEY:
        raise RuntimeError("KEEPER_KEY not set")
    for attempt in range(6):
        try:
            out = cast("send", to, sig, *args, "--private-key", KEY,
                       "--gas-limit", str(gas), "--json")
            receipt = json.loads(out)
            if receipt.get("status") not in ("0x1", 1, "1"):
                raise RuntimeError(f"reverted: {receipt.get('transactionHash')}")
            return out
        except RuntimeError as e:
            # Load-balanced public RPCs can serve a stale nonce: wait and retry.
            if attempt < 5 and ("nonce too low" in str(e) or "already known" in str(e)):
                time.sleep(3)
                continue
            raise


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


def tick_redstone(dep):
    """Signed RedStone prices, verified on-chain by the oracle."""
    oracle = dep["contracts"]["oracle"]
    if not market_open_24_5():
        log("market closed, RedStone does not publish: skipped")
        return
    payload = subprocess.run(["node", os.path.join(ROOT, "scripts", "redstone_payload.js"),
                              ",".join(REDSTONE_TICKERS)], capture_output=True, text=True)
    if payload.returncode != 0:
        log(f"redstone payload failed: {payload.stdout.strip()[:120]}{payload.stderr.strip()[:120]}")
        return
    tickers = "[" + ",".join(b32(t) for t in REDSTONE_TICKERS) + "]"
    calldata = subprocess.check_output(["cast", "calldata", "pushRedStone(bytes32[])", tickers], text=True).strip()
    send(oracle, calldata + payload.stdout.strip(), gas=GAS_PRICE_PUSH)
    time.sleep(2)  # load-balanced RPCs lag a block; read after they catch up
    prices = {t: round(first_int(call(oracle, "feed(bytes32)((uint128,uint64,bool,bool))", b32(t))
                                  .strip("()").split(", ")[0]) / 1e18, 2) for t in REDSTONE_TICKERS}
    log("redstone:", prices, "(signed, verified on-chain)")


def _marked_closed(oracle, ticker):
    """True when the oracle holds a price for `ticker` and has it marked closed."""
    f = call(oracle, "feed(bytes32)((uint128,uint64,bool,bool))", b32(ticker)).strip("()").split(", ")
    return int(f[0].split()[0]) != 0 and f[2] == "false"


def tick_prices(dep):
    oracle = dep["contracts"]["oracle"]
    if DS_KEY and DS_SECRET:
        reports = data_streams_reports()
        send(oracle, "pushReports(bytes[])", "[" + ",".join(reports) + "]", gas=GAS_PRICE_PUSH)
        log("Data Streams: pushed", len(reports), "verified reports")
        return
    prices = arbitrum_prices()
    if not prices:
        return
    is_open = market_open_24_5()
    # While the market trades, RedStone signs TSLA, NVDA and AAPL, so the relay
    # only carries SPY. At the close it carries every ticker once, to flip the
    # market status and freeze the last price for the weekend.
    names = [t for t in TICKERS if t in prices and (not is_open or t not in REDSTONE_TICKERS)]
    if is_open:
        # And at the reopen it has to carry them once more. `pushRedStone`
        # refuses to write a ticker whose stored status says closed, by design:
        # RedStone keeps publishing out of session and the close must stay
        # frozen. So RedStone cannot lift its own freeze. Only the keeper can,
        # and if it never does, those three tickers stay shut for good.
        names += [t for t in REDSTONE_TICKERS if t in prices and t not in names and _marked_closed(oracle, t)]
    if not names:
        return
    # Observation time = chain time (a fork's clock may lag the wall clock).
    ts = first_int(cast("block", "latest", "-f", "timestamp"))
    stored = call(oracle, "feed(bytes32)((uint128,uint64,bool,bool))", b32(names[0]))
    if ts <= int(stored.strip("()").split(", ")[1].split()[0]):
        log("prices already current for this block, skipped")
        return
    tick_arr = "[" + ",".join(b32(t) for t in names) + "]"
    px_arr = "[" + ",".join(str(prices[t]) for t in names) + "]"
    send(oracle, "pushMany(bytes32[],uint256[],uint64,bool)", tick_arr, px_arr, str(ts),
         "true" if is_open else "false", gas=GAS_PRICE_PUSH)
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


def _swap_calldata(dep, ticker, usdg_amount, account):
    """Calldata that buys `ticker` with `usdg_amount`, and the minimum out.

    Testnet has no aggregator, so the deployment carries a stand-in router
    priced at the oracle; mainnet uses the OKX DEX aggregator.
    """
    wrapper = dep["tokens"]["w" + ticker + "x"]
    adapter = dep["adapters"][ticker]
    price = first_int(call(adapter, "wrapperPrice()(uint256)"))
    test_dex = dep["contracts"].get("testDexRouter")
    if not test_dex and dep["chainId"] != 196:
        # A chain-1961 fork keeps mainnet state but not its chain id, and the
        # aggregator signs its routes for 196: no venue the swap can use.
        raise RuntimeError("no swap venue on this deployment")
    if test_dex:
        data = subprocess.check_output(
            ["cast", "calldata", "swap(address,uint256,uint256)", wrapper, str(usdg_amount), str(price)],
            text=True).strip()
        return test_dex, test_dex, data, (usdg_amount * 10**18 // price) * 98 // 100
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import okx_dex  # noqa: E402

    swap = okx_dex.swap(dep["tokens"]["USDG"], wrapper, str(usdg_amount), account)
    spender = okx_dex.approve(dep["tokens"]["USDG"], str(usdg_amount))["dexContractAddress"]
    return swap["tx"]["to"], spender, swap["tx"]["data"], int(swap["tx"]["minReceiveAmount"])


def tick_agents(dep):
    """Keep every position on its target, and grow the stock with the yield."""
    factory = dep["contracts"]["factory"]
    pool = dep["contracts"]["pool"]
    n = first_int(call(factory, "accountCount()(uint256)"))
    for i in range(n):
        acct = call(factory, "accounts(uint256)(address)", str(i))
        for ticker in TICKERS:
            adapter = dep["adapters"][ticker]
            target = first_int(call(acct, "targetLtvBps(address)(uint256)", adapter))
            if target == 0:  # the user never opened an Earn position on this stock
                continue
            # Only send when the position is actually off target and the
            # account can act on it: a keeper that fires blind wastes gas and
            # fills the log with reverts.
            value = first_int(call(adapter, "getAssetValue(address,bytes)(uint256)", acct, "0x"))
            debt = first_int(call(pool, "getPositionScaledDebt(address,address,bytes)(uint256)",
                                  adapter, acct, "0x"))
            if value:
                wanted = value * target // 10_000
                band = value // 100
                buffer_ = first_int(call(acct, "redeemableUsdg()(uint256)"))
                actionable = (wanted > debt + band) or (debt > wanted + band and buffer_ > 0)
                if actionable:
                    try:
                        send(acct, "rebalance(address)", adapter, gas=GAS_AGENT)
                        log(f"rebalanced {acct[:10]} on {ticker}: {debt / 1e6:.2f} -> "
                            f"{first_int(call(pool, 'getPositionScaledDebt(address,address,bytes)(uint256)', adapter, acct, '0x')) / 1e6:.2f} USDG")
                    except RuntimeError as e:
                        log(f"rebalance {acct[:10]} {ticker}: {str(e)[:90]}")

            debt = first_int(call(pool, "getPositionScaledDebt(address,address,bytes)(uint256)",
                                  adapter, acct, "0x"))
            have = first_int(call(acct, "redeemableUsdg()(uint256)"))
            profit = have - debt if have > debt else 0
            profit = profit * 999 // 1000  # the surplus shrinks with interest before inclusion
            if profit < 10**6:  # under 1 USDG, not worth the gas
                continue
            try:
                target_, spender, data, min_out = _swap_calldata(dep, ticker, profit, acct)
            except RuntimeError as e:
                log(f"compound skipped: {e}")
                continue
            try:
                send(acct, "compoundIntoStock(address,uint256,address,address,bytes,uint256)",
                     adapter, str(profit), target_, spender, data, str(min_out), gas=GAS_AGENT)
                log(f"compounded {profit / 1e6:.2f} USDG of yield into {ticker} for {acct[:10]}")
            except RuntimeError as e:
                log(f"compound {acct[:10]} {ticker}: {str(e)[:90]}")


def tick_snapshot(dep):
    va = dep["adapters"]["VAULT"]
    last = first_int(call(va, "snapshotAt()(uint256)"))
    if time.time() > last + 86400 + 60:
        send(va, "snapshot()", gas=GAS_PRICE_PUSH)
        log("vault CAPO snapshot")


def main():
    dep = json.load(open(DEPLOYMENT))
    log("keeper on chain", dep["chainId"], "source:", "Data Streams" if DS_KEY else "Chainlink Arbitrum relay")
    while True:
        jobs = {"redstone": tick_redstone, "prices": tick_prices, "protection": tick_protection,
                "agents": tick_agents, "snapshot": tick_snapshot}
        selected = os.environ.get("JOBS", "redstone,prices,protection,agents,snapshot").split(",")
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
