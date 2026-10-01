#!/usr/bin/env python3
"""Record the demo flow as a video, at the pace a viewer can read it.

    python3 scripts/demo_record.py [base_url]

Same injected signer as `ui_e2e.py`, so every transaction is a real one on
X Layer testnet, but paced and framed for a screen recording rather than for
assertions: it pauses on the things worth seeing and skips the ones that are
only interesting to a test.

The output is a reference cut. It has no wallet popup, because the signer here
is injected, so the real recording still has to be made by hand with OKX
Wallet. What this gives you is the timing: how long each step actually takes,
which is the thing you cannot guess while writing a shot list.

    out: ../agama-xlayer-local/demo/<name>.webm
"""

import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ui_e2e as h  # the wallet bridge, the chain reads, the deployment

OUT = os.path.join(os.path.dirname(h.ROOT), "agama-xlayer-local", "demo")
os.makedirs(OUT, exist_ok=True)
BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://app.agama.finance/xlayer").rstrip("/")

# Long enough to read a number, short enough that the cut stays under a minute.
BEAT = 2.0


async def beat(page, n=1.0):
    await page.wait_for_timeout(int(BEAT * n * 1000))


async def main():
    mark = {}

    print(f"wallet {h.ACCOUNT}")
    bal = int(h.subprocess.check_output(["cast", "balance", h.ACCOUNT, "--rpc-url", h.RPC], text=True).split()[0])
    if bal < 5 * 10**14:
        h.subprocess.run(["cast", "send", h.ACCOUNT, "--value", str(2 * 10**15),
                          "--private-key", h.admin_key(), "--rpc-url", h.RPC], capture_output=True)
    print("gas funded")

    async with h.async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=OUT,
            record_video_size={"width": 1440, "height": 900},
        )
        await ctx.expose_function("__agamaWallet", h.wallet_bridge)
        await ctx.add_init_script(h.INJECT)
        page = await ctx.new_page()
        page.set_default_navigation_timeout(90000)

        t0 = h.time.time()

        def at(label):
            mark[label] = round(h.time.time() - t0, 1)
            print(f"  {mark[label]:5.1f}s  {label}")

        # 1. The markets, priced, live.
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(7000)
        t0 = h.time.time()
        at("Earn page, four markets priced")
        await beat(page, 2)

        # 2. Funds: one button, one transaction.
        await page.get_by_role("link", name="Faucet", exact=True).click()
        await beat(page, 1.5)
        at("Faucet")
        await page.get_by_role("button", name=re.compile("Get the test tokens")).first.click()
        while h.balance(h.DEP["tokens"]["USDG"]) < 5000 * 10**6:
            await page.wait_for_timeout(1500)
        await beat(page, 1.5)
        at("USDG and four stocks in the wallet, one signature")

        # 3. Earn: deposit the stock, the protocol does the rest.
        await page.get_by_role("link", name="Earn", exact=True).click()
        await page.wait_for_timeout(5000)
        card = h.card(page, re.compile("^Deposit "))
        await card.locator("input[inputmode=decimal]").first.fill("2")
        await beat(page, 1.5)
        at("2 TSLAx typed, the card quotes the borrow")
        await card.get_by_role("button", name=re.compile("Deposit and start earning")).first.click()
        while h.earn_position()["collateral"] == 0:
            await page.wait_for_timeout(1500)
        await page.wait_for_timeout(4000)
        at("position open, agents running")
        await beat(page, 2)

        # 4. Amplify, on another stock: a loop and an Earn position on one
        #    market are one position, so NVDAx keeps the two readable.
        await page.get_by_role("link", name="Amplify", exact=True).click()
        await page.wait_for_timeout(5000)
        await page.get_by_role("button", name=re.compile("^NVDAx")).first.click()
        await beat(page, 1.5)
        at("Amplify, NVDAx picked, ceiling shown")
        loop = h.card(page, re.compile("^Loop "))
        await loop.locator("input[inputmode=decimal]").first.fill("2")
        await beat(page, 1.5)
        at("2 NVDAx typed, the loop quotes what comes out")
        await loop.get_by_role("button", name=re.compile("Open at")).first.click()
        while h.earn_position("NVDA")["collateral"] == 0:
            await page.wait_for_timeout(1500)
        await page.wait_for_timeout(4000)
        nv = h.earn_position("NVDA")
        at(f"loop open: 2 became {nv['collateral'] / 1e18:.4f} NVDAx")
        await beat(page, 2)

        # 5. Everything in one place.
        await page.get_by_role("link", name="Portfolio", exact=True).click()
        await page.wait_for_timeout(6000)
        at("Portfolio")
        await beat(page, 2.5)

        await ctx.close()
        await browser.close()

    print("\nmarks, in seconds from the first frame:")
    for k, v in mark.items():
        print(f"  {v:5.1f}  {k}")
    vids = sorted(os.listdir(OUT))
    print(f"\nvideo: {os.path.join(OUT, vids[-1]) if vids else '(none)'}")


if __name__ == "__main__":
    asyncio.run(main())
