#!/usr/bin/env python3
"""UI end-to-end test of the LIVE app against X Layer testnet, with a real signer.

    python3 scripts/ui_e2e.py [base_url]     # default https://agama-xlayer.vercel.app

A headless Chromium opens the app with an injected EIP-1193 wallet. Reads go to
the testnet RPC; `eth_sendTransaction` is signed and broadcast by `cast` with a
fresh throwaway key funded by the deployer, so every click is a real testnet
transaction. Screenshots land in ../agama-xlayer-local/ui-e2e/.

Flow: page loads with live prices -> connect -> faucet -> Earn open -> Buy and Earn -> agents
(rebalance, compound) -> Amplify open -> Amplify close -> Earn close -> Arrow supply and withdraw.
Fails on any page error or any transaction error shown by the app.
"""

import asyncio
import json
import re
import os
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://agama-xlayer.vercel.app"
RPC = "https://testrpc.xlayer.tech/terigon"
CHAIN_HEX = hex(1952)
OUT = os.path.join(os.path.dirname(ROOT), "agama-xlayer-local", "ui-e2e")
os.makedirs(OUT, exist_ok=True)


def key(name):
    path = os.path.join(ROOT, ".keys", "e2e.json")
    ks = json.load(open(path)) if os.path.exists(path) else {}
    if name not in ks:
        w = json.loads(subprocess.check_output(["cast", "wallet", "new", "--json"]))
        ks[name] = (w[0] if isinstance(w, list) else w)["private_key"]
        json.dump(ks, open(path, "w"))
        os.chmod(path, 0o600)
    return ks[name]


def admin_key():
    d = json.load(open(os.path.join(ROOT, ".keys", "deployer.json")))
    return (d[0] if isinstance(d, list) else d)["private_key"]


# A fresh throwaway wallet per run: the flow is always the first-time user path.
UI_KEY = (lambda w: (w[0] if isinstance(w, list) else w)["private_key"])(
    json.loads(subprocess.check_output(["cast", "wallet", "new", "--json"]))
)
ACCOUNT = subprocess.check_output(["cast", "wallet", "address", UI_KEY], text=True).strip()
PAGE_ERRORS = []


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def send_tx(tx):
    args = ["cast", "send", tx["to"], tx.get("data") or "0x", "--private-key", UI_KEY,
            "--rpc-url", RPC, "--async"]
    if tx.get("value") and int(tx["value"], 16) > 0:
        args += ["--value", str(int(tx["value"], 16))]
    if tx.get("gas"):
        args += ["--gas-limit", str(int(int(tx["gas"], 16) * 12 // 10))]
    for attempt in range(6):
        r = subprocess.run(args, capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout.strip().splitlines()[-1]
        if "nonce too low" in r.stderr and attempt < 5:
            time.sleep(3)
            continue
        raise RuntimeError(r.stderr.strip()[-300:])


async def wallet_bridge(method, params_json):
    """Called from the page for every EIP-1193 request."""
    params = json.loads(params_json or "[]")
    if method in ("eth_requestAccounts", "eth_accounts"):
        return json.dumps({"result": [ACCOUNT]})
    if method == "eth_chainId":
        return json.dumps({"result": CHAIN_HEX})
    if method == "net_version":
        return json.dumps({"result": "1952"})
    if method in ("wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_watchAsset"):
        return json.dumps({"result": None})
    if method in ("wallet_requestPermissions", "wallet_getPermissions"):
        return json.dumps({"result": [{"parentCapability": "eth_accounts"}]})
    if method == "eth_sendTransaction":
        try:
            h = await asyncio.to_thread(send_tx, params[0])
            print(f"   tx  {h}", flush=True)
            return json.dumps({"result": h})
        except Exception as e:  # surfaced to the app as a wallet error
            return json.dumps({"error": {"code": -32000, "message": str(e)}})
    res = await asyncio.to_thread(rpc, method, params)
    return json.dumps(res)


INJECT = """
(() => {
  const listeners = {};
  const provider = {
    isMetaMask: false,
    request: async ({method, params}) => {
      const out = JSON.parse(await window.__agamaWallet(method, JSON.stringify(params ?? [])));
      if (out.error) { const e = new Error(out.error.message); e.code = out.error.code; e.data = out.error.data; throw e; }
      return out.result;
    },
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    removeListener: () => {},
  };
  window.ethereum = provider;
})();
"""


DEP = json.load(open(os.path.join(ROOT, "deployments", "1952.json")))


def call(to, sig, *args):
    out = subprocess.check_output(["cast", "call", to, sig, *args, "--rpc-url", RPC], text=True).strip()
    return out


def admin_send(to, sig, *args):
    r = subprocess.run(["cast", "send", to, sig, *args, "--private-key", admin_key(), "--rpc-url", RPC,
                        "--gas-limit", "3000000"], capture_output=True, text=True)
    if r.returncode != 0:  # the key must never reach a log line
        raise SystemExit(f"   FAIL: admin {sig.split('(')[0]}: {r.stderr.strip()[-200:]}")


def tsla_price():
    parts = call(DEP["contracts"]["oracle"], "feed(bytes32)((uint128,uint64,bool,bool))",
                 "0x" + "TSLA".encode().hex().ljust(64, "0")).strip("()").split(", ")
    return int(parts[0].split()[0])


def push_tsla(price):
    """Move the price the way the keeper does, in steps inside the deviation cap."""
    cur = tsla_price()
    while cur != price:
        nxt = max(price, cur * 88 // 100) if price < cur else min(price, cur * 112 // 100)
        admin_send(DEP["contracts"]["oracle"], "push(bytes32,uint256,uint64,bool)",
                   "0x" + "TSLA".encode().hex().ljust(64, "0"), str(nxt), str(int(time.time())), "true")
        cur = nxt


def wait_position(pred, timeout=60):
    """Poll the chain until the position satisfies `pred` (the RPC is load balanced)."""
    t0 = time.time()
    p = earn_position()
    while time.time() - t0 < timeout and not pred(p):
        time.sleep(3)
        p = earn_position()
    return p


def earn_position():
    out = call(DEP["contracts"]["earnRouter"],
               "position(address,address)((address,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256))",
               ACCOUNT, DEP["adapters"]["TSLA"])
    f = [x.split()[0] for x in out.strip("()").split(", ")]
    return {"account": f[0], "collateral": int(f[1]), "value": int(f[2]), "debt": int(f[3])}


def step(msg):
    print(f"\n\033[1m== {msg}\033[0m", flush=True)


def ok(cond, msg):
    if not cond:
        raise SystemExit(f"   FAIL: {msg}")
    print(f"   ok  {msg}", flush=True)


async def shot(page, name):
    await page.wait_for_timeout(1500)
    await page.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)


async def wait_text(page, selector, pred, timeout=45):
    """The app polls a load-balanced RPC: wait for the state instead of sleeping."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pred(await page.locator(selector).inner_text()):
            return True
        await page.wait_for_timeout(1000)
    return False


async def click_tx(page, name, scope=None, timeout=120):
    """Click a transaction button and wait for the app to report Done or an error."""
    root = page.locator(scope) if scope else page
    # Testnet stand-ins carry on-chain symbols (tUSDG): match "USDG" and "tUSDG".
    pattern = re.compile(re.escape(name).replace("USDG", "t?USDG"))
    btn = root.get_by_role("button", name=pattern).first
    await btn.wait_for(state="visible", timeout=30000)
    for _ in range(120):
        if await btn.is_enabled():
            break
        await page.wait_for_timeout(250)
    box = await btn.locator("xpath=..").element_handle()
    await btn.click()
    t0 = time.time()
    while time.time() - t0 < timeout:
        txt = await box.inner_text()
        if "Done" in txt:
            print(f"   ok  {name}", flush=True)
            await page.wait_for_timeout(2500)
            return
        if await box.query_selector("[role=alert]"):
            raise SystemExit(f"   FAIL: {name}: {txt.replace(chr(10), ' | ')[:300]}")
        await page.wait_for_timeout(400)
    raise SystemExit(f"   FAIL: {name}: no confirmation after {timeout}s")


async def main():
    step(f"0. funding the UI wallet {ACCOUNT}")
    # Gas is ~0.02 gwei here, so 0.001 OKB is a whole run with room to spare, and
    # the deployer keeps its reserve for the keeper (testnet OKB comes from a faucet).
    bal = int(subprocess.check_output(["cast", "balance", ACCOUNT, "--rpc-url", RPC], text=True).split()[0])
    if bal < 5 * 10**14:
        # Never let the key reach an exception message or a log line.
        r = subprocess.run(["cast", "send", ACCOUNT, "--value", str(10**15), "--private-key", admin_key(),
                            "--rpc-url", RPC], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"   FAIL: funding the UI wallet: {r.stderr.strip()[-200:]}")
    ok(True, "gas funded (0.001 OKB)")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1360, "height": 1000})
        await ctx.expose_function("__agamaWallet", wallet_bridge)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: PAGE_ERRORS.append(str(e)))

        step("1. live page loads with oracle prices")
        await page.goto(BASE + "/")
        await page.wait_for_timeout(6000)
        body = await page.locator("body").inner_text()
        ok("wTSLAx" in body and "$" in body and "Open" in body, "stock table rendered with live prices and market status")
        await shot(page, "01-earn-live")

        step("2. connect the wallet")
        await ctx.add_init_script(INJECT)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: PAGE_ERRORS.append(str(e)))
        await page.goto(BASE + "/")
        await page.wait_for_timeout(5000)
        if await page.get_by_role("button", name="Connect wallet").count() > 0:
            await page.get_by_role("button", name="Connect wallet").first.click()
            await page.get_by_text("Browser Wallet").first.click()
            await page.wait_for_timeout(3000)
        body = await page.locator("body").inner_text()
        ok(ACCOUNT[2:6].lower() in body.lower() or "Get test tokens" in body, "wallet connected")

        step("3. testnet faucet")
        await page.get_by_role("button", name="Get test tokens").first.click()
        t0 = time.time()
        while time.time() - t0 < 180:
            txt = await page.locator("body").inner_text()
            if "Test tokens received" in txt:
                break
            if "Faucet failed" in txt:
                raise SystemExit("   FAIL: faucet")
            await page.wait_for_timeout(1000)
        ok("Test tokens received" in txt, "5,000 USDG + 10 of each xStock received")
        await page.reload()
        await page.wait_for_timeout(5000)

        step("4. Earn: the OKX rail (base token) is the default, then the wrapped one")
        body = await page.locator("section[aria-labelledby=ticket-title], form, main").first.inner_text()
        ok("From OKX" in body, "the deposit card offers the token an OKX withdrawal sends")
        await page.fill("#earn-amount", "2")
        await page.wait_for_timeout(2500)
        await shot(page, "02-earn-ticket")
        # Holding base tokens and no position, the app preselects "From OKX".
        await click_tx(page, "Approve TSLAx")
        await click_tx(page, "Open position")
        shown = await wait_text(page, "section[aria-labelledby=pos-title]",
                                lambda t: "No wTSLAx position yet" not in t)
        ok(shown, "position opened straight from the OKX token")

        # Same card, wrapped token this time.
        await page.get_by_text(re.compile(r"Wrapped \(w?t?TSLAx\)")).first.click()
        await page.wait_for_timeout(1500)
        await page.fill("#earn-amount", "2")
        await page.wait_for_timeout(2000)
        await click_tx(page, "Approve wTSLAx")
        await click_tx(page, "Add and borrow")
        shown = await wait_text(page, "section[aria-labelledby=pos-title]", lambda t: "No wTSLAx position yet" not in t)
        ok(shown, "position carries both deposits (collateral, debt, health factor)")
        await shot(page, "03-earn-position")

        step("5. Buy and Earn: 200 USDG buys the stock and opens the position")
        await page.get_by_role("tab", name="Buy and Earn").click()
        await page.wait_for_timeout(1500)
        await page.fill("#buy-amount", "200")
        await wait_text(page, "section[aria-labelledby=buy-title]", lambda t: "-" not in t.split("You receive")[-1][:40])
        await shot(page, "03b-buy-ticket")
        await click_tx(page, "Approve USDG", scope="section[aria-labelledby=buy-title]")
        await click_tx(page, "Buy and earn", scope="section[aria-labelledby=buy-title]")
        grew = await wait_text(page, "section[aria-labelledby=pos-title]",
                               lambda t: "No wTSLAx position yet" not in t)
        ok(grew, "position grew from the bought stock")
        await shot(page, "03c-buy-position")

        step("6. Agents: the stock moves, the position follows, the yield becomes stock")
        p0 = earn_position()
        start = tsla_price()
        push_tsla(start * 12 // 10)                      # the stock gains 20%
        await page.reload()
        await page.wait_for_timeout(6000)
        await shot(page, "03d-agent-offtarget")
        await click_tx(page, "Rebalance now")
        moved = await asyncio.to_thread(wait_position, lambda q: q["debt"] > p0["debt"])
        ok(moved["debt"] > p0["debt"],
           f"the agent borrowed the difference from the button: debt {p0['debt'] / 1e6:.2f} "
           f"-> {moved['debt'] / 1e6:.2f} USDG")

        # Yield the vault has earned, so there is a surplus above the debt to compound.
        admin_send(DEP["tokens"]["USDG"], "faucet(address,uint256)",
                   subprocess.check_output(["cast", "wallet", "address", admin_key()], text=True).strip(),
                   str(200 * 10**6))
        admin_send(DEP["tokens"]["USDG"], "transfer(address,uint256)", DEP["contracts"]["queue"], str(200 * 10**6))
        admin_send(DEP["contracts"]["queue"], "settleYield(uint256)", str(200 * 10**6))
        stock_before = moved["collateral"]
        await page.reload()
        await page.wait_for_timeout(8000)
        await click_tx(page, "Compound yield into stock")
        grown = await asyncio.to_thread(wait_position, lambda q: q["collateral"] > stock_before)
        ok(grown["collateral"] > stock_before,
           f"the yield came back as stock: {stock_before / 1e18:.6f} -> {grown['collateral'] / 1e18:.6f} wTSLAx")
        await shot(page, "03e-agent-grown")
        push_tsla(start)

        step("7. Amplify: 300 USDG at the default leverage")
        await page.goto(BASE + "/amplify")
        await page.wait_for_timeout(5000)
        await page.fill("#amp-amount", "300")
        await page.wait_for_timeout(2500)
        await click_tx(page, "Approve USDG")
        await click_tx(page, "Open at")
        shown = await wait_text(page, "section[aria-labelledby=amp-pos]",
                                lambda t: re.search(r"Leverage\s*[12]\.\d\dx", t) is not None)
        ok(shown, "Amplify position shown (exposure, debt, leverage)")
        await shot(page, "04-amplify-position")

        step("8. Amplify: close to USDG")
        await click_tx(page, "Close to USDG")
        await shot(page, "05-amplify-closed")

        step("9. Earn: close")
        await page.goto(BASE + "/")
        await page.wait_for_timeout(6000)
        sec = page.locator("section[aria-labelledby=pos-title]")
        btn = sec.locator("button").filter(has_text=re.compile(r"Close to .?TSLAx"))
        if await btn.count() == 0:
            btn = sec.locator("button").filter(has_text="Close")
        label = await btn.first.inner_text()
        await btn.first.click()
        t0 = time.time()
        closed = False
        while time.time() - t0 < 150:
            txt = await sec.inner_text()
            if "No wTSLAx position yet" in txt:
                closed = True
                break
            if await sec.locator("[role=alert]").count() > 0:
                raise SystemExit("   FAIL: close: " + await sec.locator("[role=alert]").first.inner_text())
            await page.wait_for_timeout(800)
        ok(closed, f"Earn closed via '{label.strip()}': the stock comes back in the form an OKX deposit takes")
        await shot(page, "06-earn-closed")

        step("10. Arrow: supply then withdraw 100 USDG")
        await page.goto(BASE + "/lend")
        await page.wait_for_timeout(5000)
        await page.fill("#lend-amount", "100")
        await click_tx(page, "Approve USDG", scope="section[aria-labelledby=supply-title]")
        await click_tx(page, "Supply USDG")
        supplied = await wait_text(page, "section[aria-labelledby=supply-title]",
                                   lambda t: re.search(r"Your supply\s*\$(9\d|1\d\d)\.", t) is not None)
        ok(supplied, "supply shown (~100 USDG)")
        await page.get_by_role("tab", name="withdraw").click()
        await page.wait_for_timeout(1000)
        await page.locator("section[aria-labelledby=supply-title]").get_by_role("button", name="Max").click()
        await click_tx(page, "Withdraw USDG")
        await shot(page, "07-lend-done")

        ok(not PAGE_ERRORS, f"no page errors ({len(PAGE_ERRORS)})" if not PAGE_ERRORS else PAGE_ERRORS[0][:200])
        await browser.close()
    print(f"\n\033[1mUI E2E PASSED\033[0m  screenshots: {OUT}")


asyncio.run(main())
