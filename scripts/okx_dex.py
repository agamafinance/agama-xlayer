#!/usr/bin/env python3
"""Signed calls to the OKX Onchain OS DEX API (Trade), used by the zap.

Credentials come from .env (OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE).
The OKX edge rejects some HTTP clients, so requests go through curl.

    python3 scripts/okx_dex.py quote  <fromToken> <toToken> <amount>
    python3 scripts/okx_dex.py approve <token> <amount>
    python3 scripts/okx_dex.py swap   <fromToken> <toToken> <amount> <wallet> [slippage]
"""
import base64, hashlib, hmac, json, os, subprocess, sys, time, urllib.parse
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "https://web3.okx.com"
CHAIN = "196"  # X Layer mainnet


def env():
    out = {}
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k] = v.strip()
    for k in ("OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE"):
        out.setdefault(k, os.environ.get(k, ""))
    return out


def get(path, params):
    e = env()
    full = path + "?" + urllib.parse.urlencode(params)
    # The OKX edge is CloudFront-fronted and throttles bursts with an HTML 403:
    # back off and retry rather than failing the caller.
    for attempt in range(5):
        body = _curl(full, e, ts_headers=None)
        if isinstance(body, dict):
            if body.get("code") in ("0", 0):
                return body["data"]
            raise RuntimeError(f"OKX DEX API: {body.get('code')} {body.get('msg')}")
        if attempt == 4:
            raise RuntimeError(f"OKX DEX API: edge refused the request ({body[:80]})")
        time.sleep(2 + 3 * attempt)


def _curl(full, e, ts_headers=None):
    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    sign = base64.b64encode(
        hmac.new(e["OKX_SECRET_KEY"].encode(), (ts + "GET" + full).encode(), hashlib.sha256).digest()
    ).decode()
    r = subprocess.run(["curl", "-s", HOST + full,
                        "-H", f"OK-ACCESS-KEY: {e['OKX_API_KEY']}",
                        "-H", f"OK-ACCESS-SIGN: {sign}",
                        "-H", f"OK-ACCESS-TIMESTAMP: {ts}",
                        "-H", f"OK-ACCESS-PASSPHRASE: {e['OKX_PASSPHRASE']}",
                        "-H", "Content-Type: application/json",
                        "-H", "User-Agent: agama-xlayer/1.0"], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return r.stdout


def quote(from_token, to_token, amount):
    return get("/api/v6/dex/aggregator/quote",
               {"chainIndex": CHAIN, "fromTokenAddress": from_token, "toTokenAddress": to_token, "amount": amount})[0]


def approve(token, amount):
    return get("/api/v6/dex/aggregator/approve-transaction",
               {"chainIndex": CHAIN, "tokenContractAddress": token, "approveAmount": amount})[0]


# AMM liquidity sources on X Layer (Uniswap V2/V3, community AMMs, LFGSwap,
# QuickSwap V3). The aggregator's JIT router quotes are signed by a market maker
# and expire within seconds, which does not survive a wallet confirmation, so
# the zap asks for plain AMM routes.
AMM_DEX_IDS = "34,6484,53,6534,93,169"


def swap(from_token, to_token, amount, wallet, slippage="1", receiver=None, dex_ids=AMM_DEX_IDS):
    """slippage is a PERCENT string for v6 (`slippagePercent`), e.g. "1" = 1%."""
    p = {"chainIndex": CHAIN, "fromTokenAddress": from_token, "toTokenAddress": to_token,
         "amount": amount, "userWalletAddress": wallet, "slippagePercent": slippage}
    if dex_ids:
        p["dexIds"] = dex_ids
    if receiver:
        p["swapReceiverAddress"] = receiver
    return get("/api/v6/dex/aggregator/swap", p)[0]


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    print(json.dumps({"quote": quote, "approve": approve, "swap": swap}[cmd](*args), indent=2)[:4000])
