#!/usr/bin/env python3
"""UI end-to-end test of the LIVE app against X Layer testnet, with a real signer.

    python3 scripts/ui_e2e.py [base_url]     # default https://app.agama.finance/xlayer

A headless Chromium opens the app with an injected EIP-1193 wallet. Reads go to
the testnet RPC; `eth_sendTransaction` is signed and broadcast by `cast` with a
fresh throwaway key funded by the deployer, so every click is a real testnet
transaction. Screenshots land in ../agama-xlayer-local/ui-e2e/.

Flow: page loads with live prices -> connect -> faucet -> Earn from the OKX base
token -> the agent panel -> Amplify open and close -> Lend supply and withdraw ->
Earn close. Fails on any page error or any error the app puts under a button.

Needs testnet OKB on the deployer: the run funds a throwaway wallet with
0.001 OKB and the deployer tops up from https://web3.okx.com/xlayer/faucet.
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Against X Layer testnet by default. Against a local anvil fork of X Layer,
# where gas is free and the faucet is not a queue:
#   CHAIN_ID=1961 python3 scripts/ui_e2e.py http://127.0.0.1:3021/xlayer
CHAIN_ID = int(os.environ.get("CHAIN_ID", "1952"))
IS_FORK = CHAIN_ID == 1961
BASE = (sys.argv[1] if len(sys.argv) > 1
        else ("http://127.0.0.1:3021/xlayer" if IS_FORK else "https://app.agama.finance/xlayer")).rstrip("/")
RPC = os.environ.get("RPC_URL", "http://127.0.0.1:8545" if IS_FORK else "https://testrpc.xlayer.tech/terigon")
CHAIN_HEX = hex(CHAIN_ID)
OUT = os.path.join(os.path.dirname(ROOT), "agama-xlayer-local", "ui-e2e")
os.makedirs(OUT, exist_ok=True)

DEP = json.load(open(os.path.join(ROOT, "deployments", f"{CHAIN_ID}.json")))
PAGE_ERRORS = []

ANVIL0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_UI = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"  # anvil #6


def admin_key():
    if IS_FORK:
        return ANVIL0
    d = json.load(open(os.path.join(ROOT, ".keys", "deployer.json")))
    return (d[0] if isinstance(d, list) else d)["private_key"]


# A fresh throwaway wallet per run: the flow is always the first-time user path.
# On a fork an anvil account is used instead, already funded with gas.
UI_KEY = ANVIL_UI if IS_FORK else (lambda w: (w[0] if isinstance(w, list) else w)["private_key"])(
    json.loads(subprocess.check_output(["cast", "wallet", "new", "--json"]))
)
ACCOUNT = subprocess.check_output(["cast", "wallet", "address", UI_KEY], text=True).strip()


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


# ---- chain reads -------------------------------------------------------------


def call(to, sig, *args):
    return subprocess.check_output(["cast", "call", to, sig, *args, "--rpc-url", RPC], text=True).strip()


def earn_position():
    out = call(DEP["contracts"]["earnRouter"],
               "position(address,address)((address,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256))",
               ACCOUNT, DEP["adapters"]["TSLA"])
    f = [x.split()[0] for x in out.strip("()").split(", ")]
    return {"account": f[0], "collateral": int(f[1]), "value": int(f[2]), "debt": int(f[3])}


def amplify_position():
    # (account, pledgedShares, exposure, debt, equity, leverageBps,
    #  healthFactorRay, borrowRateRay, vaultApyRay)
    out = call(DEP["contracts"]["amplifyRouter"],
               "position(address)((address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))",
               ACCOUNT)
    f = [x.split()[0] for x in out.strip("()").split(", ")]
    return {"account": f[0], "pledgedShares": int(f[1]), "exposure": int(f[2]), "debt": int(f[3]),
            "equity": int(f[4]), "leverageBps": int(f[5])}


def fund_on_fork():
    """Real tokens have no faucet, so the fork gets its balances written."""
    def poke(token, slot, amount):
        key = subprocess.check_output(["cast", "index", "address", ACCOUNT, slot], text=True).strip()
        subprocess.run(["cast", "rpc", "anvil_setStorageAt", token, key, "0x" + format(amount, "064x"),
                        "--rpc-url", RPC], capture_output=True, check=True)

    poke(DEP["tokens"]["USDG"], "1", 10_000 * 10**6)
    for w in ("wTSLAx", "wNVDAx", "wSPYx", "wAAPLx"):
        poke(DEP["tokens"][w], "101", 10 * 10**18)
    base = call(DEP["tokens"]["wTSLAx"], "asset()(address)").split()[0]
    poke(base, "263", 10 * 10**18)


def wait_chain(read, pred, timeout=90):
    """The testnet RPC is load balanced, so poll instead of reading once."""
    t0 = time.time()
    v = read()
    while time.time() - t0 < timeout and not pred(v):
        time.sleep(3)
        v = read()
    return v


# ---- output ------------------------------------------------------------------


def step(msg):
    print(f"\n\033[1m== {msg}\033[0m", flush=True)


def ok(cond, msg):
    if not cond:
        raise SystemExit(f"   FAIL: {msg}")
    print(f"   ok  {msg}", flush=True)


async def shot(page, name):
    await page.wait_for_timeout(1200)
    await page.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)


# ---- driving the fork's cards -------------------------------------------------
#
# Every action in this app is one round button inside a cream card. While the
# transaction runs the button is disabled and its label is the status; when it
# finishes the card shows "Done" underneath, or the error, in the same spot.


def card(page, heading):
    """The cream card whose heading matches, addressed through the heading itself."""
    return page.locator("div.rounded-2xl").filter(has=page.get_by_role("heading", name=heading)).first


async def act(page, scope, button, timeout=180, settled=None):
    """Click an action button and wait for its verdict.

    `settled` is for the actions that empty the card they live in: a close
    takes its own button away, so the verdict moves to the card level and the
    chain is the thing worth waiting on.
    """
    btn = scope.get_by_role("button", name=re.compile(button)).first
    await btn.wait_for(state="visible", timeout=30000)
    for _ in range(80):  # 20s: the form needs its reads before it will let go
        if await btn.is_enabled():
            break
        await page.wait_for_timeout(250)
    else:
        raise SystemExit(f"   FAIL: {button}: the button stayed disabled. Card said: "
                         f"{(await scope.inner_text()).replace(chr(10), ' | ')[:300]}")
    await btn.click()
    # Each action renders its verdict in the paragraph right under its own
    # button, and only once it has finished. So the verdict is that paragraph:
    # "Done", or whatever went wrong. Reading the whole card instead means
    # either missing an error word nobody predicted, or calling a refreshed
    # balance an error.
    if settled is not None:
        t0 = time.time()
        while time.time() - t0 < timeout:
            if await asyncio.to_thread(settled):
                print(f"   ok  {button}", flush=True)
                await page.wait_for_timeout(2000)
                return
            await page.wait_for_timeout(2000)
        raise SystemExit(f"   FAIL: {button}: the chain never settled after {timeout}s")

    verdict = btn.locator("xpath=following-sibling::p[1]")
    t0 = time.time()
    while time.time() - t0 < timeout:
        if await verdict.count() > 0:
            said = (await verdict.first.inner_text()).strip()
            if said == "Done":
                print(f"   ok  {button}", flush=True)
                await page.wait_for_timeout(2000)
                return
            if said:
                raise SystemExit(f"   FAIL: {button}: {said[:300]}")
        await page.wait_for_timeout(500)
    raise SystemExit(f"   FAIL: {button}: nothing after {timeout}s")


async def fill_amount(scope, value):
    await scope.locator("input[inputmode=decimal]").first.fill(value)


async def main():
    step(f"0. funding the UI wallet {ACCOUNT}")
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
        ctx = await browser.new_context(viewport={"width": 1360, "height": 1100})
        await ctx.expose_function("__agamaWallet", wallet_bridge)
        await ctx.add_init_script(INJECT)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: PAGE_ERRORS.append(str(e)))

        step("1. the Agama app opens on X Layer, with live oracle prices")
        await page.goto(BASE)
        await page.wait_for_timeout(7000)
        body = await page.locator("body").inner_text()
        ok("Deposit your stock" in body and "wTSLAx" in body and "$" in body,
           "Earn page rendered in the Agama design with the four markets priced")
        ok(all(t in body for t in ("Earn", "Amplify", "Lend", "Faucet")), "the four tabs are there")
        await shot(page, "f01-earn")

        step("2. the wallet is picked up")
        # The app asks the injected provider for `eth_accounts` on mount, so a
        # wallet that already has the site approved is connected without a click.
        nav = await page.locator("header").inner_text()
        if ACCOUNT[-4:].lower() not in nav.lower():
            await page.get_by_role("button", name="Connect Wallet").first.click()
            await page.wait_for_timeout(4000)
            nav = await page.locator("header").inner_text()
        ok(ACCOUNT[-4:].lower() in nav.lower(), f"wallet connected, navbar shows {nav.splitlines()[-1]}")

        step("3. tokens in the wallet")
        if IS_FORK:
            # The fork runs on the real USDG and the real Backed wrappers, which
            # have no faucet. Write the balances instead: slot 1 for USDG, 101
            # for the wrappers, 263 for the base xStocks.
            fund_on_fork()
            ok(True, "balances written on the fork (real tokens, no faucet)")
        else:
            await page.get_by_role("link", name="Faucet", exact=True).click()
            await page.wait_for_timeout(4000)
            await act(page, page.locator("body"), "Get test tokens", timeout=420)
        usdg = int(call(DEP["tokens"]["USDG"], "balanceOf(address)(uint256)", ACCOUNT).split()[0])
        ok(usdg >= 5000 * 10**6, f"{usdg / 1e6:.0f} USDG in the wallet")

        step("4. Earn: deposit the token an OKX withdrawal delivers, at 25% LTV")
        await page.get_by_role("link", name="Earn", exact=True).click()
        await page.wait_for_timeout(6000)
        deposit = card(page, re.compile("^Deposit "))
        await deposit.get_by_role("button", name="From OKX").click()
        await page.wait_for_timeout(1500)
        await fill_amount(deposit, "2")
        await page.wait_for_timeout(1500)
        await act(page, deposit, "Deposit and borrow", timeout=300)
        pos = wait_chain(earn_position, lambda p: p["collateral"] > 0)
        ok(pos["collateral"] >= 2 * 10**18 and pos["debt"] > 0,
           f"position open: {pos['collateral'] / 1e18:.4f} wTSLAx, {pos['debt'] / 1e6:.2f} USDG borrowed")
        await shot(page, "f02-position")

        step("5. the agent panel reports, and asks nothing of the user")
        panel = card(page, "Your position")
        txt = await panel.inner_text()
        ok("Agents running" in txt, "the position says the agents are running")
        ok("Rebalance" not in txt and "Compound" not in txt,
           "no agent button: the user has nothing to press, which is the product")

        step("6. Amplify: open at 2x, then close")
        await page.get_by_role("link", name="Amplify", exact=True).click()
        await page.wait_for_timeout(6000)
        loop = card(page, "Open a loop")
        await fill_amount(loop, "300")
        await page.wait_for_timeout(1200)
        await act(page, loop, "Open at", timeout=300)
        amp = wait_chain(amplify_position, lambda a: a["exposure"] > 0)
        ok(amp["exposure"] > 300 * 10**6,
           f"loop open: {amp['exposure'] / 1e6:.2f} USDG of exposure at {amp['leverageBps'] / 10000:.2f}x")
        await shot(page, "f03-amplify")
        await act(page, card(page, "Your loop"), "Close to USDG", timeout=300,
                  settled=lambda: amplify_position()["exposure"] == 0)
        amp = amplify_position()
        ok(amp["exposure"] == 0, "loop closed, equity back in USDG")

        step("7. Lend: supply 100 USDG, then withdraw it")
        await page.get_by_role("link", name="Lend", exact=True).click()
        await page.wait_for_timeout(6000)
        # Anchored on the supply/withdraw pill, which is in the card whichever
        # tab is showing; the action button is renamed by the tab itself.
        supply = page.locator("div.rounded-2xl").filter(
            has=page.get_by_role("button", name="supply", exact=True)).first
        await fill_amount(supply, "100")
        await page.wait_for_timeout(1200)
        await act(page, supply, "Supply USDG", timeout=300)
        shares = int(call(DEP["contracts"]["pool"], "balanceOf(address)(uint256)", ACCOUNT).split()[0])
        # The pool's shares carry a decimals offset, so report what they are
        # worth rather than a raw count nobody can read.
        worth = int(call(DEP["contracts"]["pool"], "convertToAssets(uint256)(uint256)", str(shares)).split()[0])
        ok(shares > 0, f"supplied, shares worth {worth / 1e6:.2f} USDG")
        # exact, or it also matches the action button "Withdraw USDG".
        await supply.get_by_role("button", name="withdraw", exact=True).first.click()
        await page.wait_for_timeout(1500)
        # Max, not the amount that was supplied: a round trip through the pool's
        # shares comes back a rounding short of it, and the form is right to
        # refuse an amount the pool cannot pay.
        await supply.get_by_role("button", name=re.compile("Max")).first.click()
        await page.wait_for_timeout(1200)
        await act(page, supply, "Withdraw USDG", timeout=300)
        left = int(call(DEP["contracts"]["pool"], "balanceOf(address)(uint256)", ACCOUNT).split()[0])
        # Interest accrues between reading Max and the block landing, so a
        # rounding of shares survives. Anything under a cent is dust, not a bug.
        dust = int(call(DEP["contracts"]["pool"], "convertToAssets(uint256)(uint256)", str(left)).split()[0])
        ok(dust < 10_000, f"withdrawn, {dust} base units of dust left")

        step("8. Earn: close, the stock comes back as the token OKX accepts")
        await page.get_by_role("link", name="Earn", exact=True).click()
        await page.wait_for_timeout(6000)
        await act(page, card(page, "Your position"), "Close, send the stock back", timeout=300,
                  settled=lambda: earn_position()["collateral"] == 0)
        pos = earn_position()
        ok(pos["collateral"] == 0 and pos["debt"] == 0, "position closed, nothing left owed")
        await shot(page, "f04-closed")

        step("9. no page errors")
        ok(not PAGE_ERRORS, f"no page errors ({len(PAGE_ERRORS)})")

        await browser.close()

    print(f"\n\033[1mUI E2E PASSED\033[0m  screenshots: {OUT}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
