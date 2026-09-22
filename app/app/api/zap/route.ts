import {createHmac} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {NextResponse} from "next/server";
import {isAddress, type Address} from "viem";

import {XLAYER_ID} from "@/lib/chains";
import {deployments} from "@/lib/generated/deployments";
import {STOCKS} from "@/lib/stocks";

export const dynamic = "force-dynamic";

const HOST = "https://web3.okx.com";
const CHAIN_INDEX = String(XLAYER_ID);
const SLIPPAGE_PERCENT = "1";
// AMM routes only (Uniswap V2/V3, community AMMs, LFGSwap, QuickSwap V3). The
// aggregator's JIT routes are signed per wallet and expire within seconds,
// which never survives a wallet confirmation.
const DEX_IDS = "34,6484,53,6534,93,169";

type Creds = {key: string; secret: string; passphrase: string};

/// Credentials come from the environment; the repo `.env` one level up is a
/// convenience for local runs. They never leave the server.
function creds(): Creds | undefined {
  let {OKX_API_KEY: key, OKX_SECRET_KEY: secret, OKX_PASSPHRASE: passphrase} = process.env;
  if (!key || !secret || !passphrase) {
    for (const p of [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")]) {
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#") || !t.includes("=")) continue;
        const [k, ...rest] = t.split("=");
        const v = rest.join("=").trim();
        if (k === "OKX_API_KEY") key ||= v;
        else if (k === "OKX_SECRET_KEY") secret ||= v;
        else if (k === "OKX_PASSPHRASE") passphrase ||= v;
      }
    }
  }
  if (!key || !secret || !passphrase) return undefined;
  return {key, secret, passphrase};
}

async function okxGet(c: Creds, path: string, params: Record<string, string>) {
  const full = `${path}?${new URLSearchParams(params).toString()}`;
  const ts = new Date().toISOString(); // ISO with milliseconds
  const sign = createHmac("sha256", c.secret).update(ts + "GET" + full).digest("base64");
  const res = await fetch(HOST + full, {
    headers: {
      "OK-ACCESS-KEY": c.key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": c.passphrase,
      "Content-Type": "application/json",
      // The OKX edge answers 403 "error code: 1010" without a plain user agent.
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) agama-xlayer/1.0",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: {code?: string | number; msg?: string; data?: unknown[]};
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`OKX DEX API ${res.status}: ${text.slice(0, 160)}`);
  }
  if (String(body.code) !== "0") throw new Error(`OKX DEX API ${body.code}: ${body.msg || "unknown error"}`);
  const data = body.data as Record<string, unknown>[] | undefined;
  if (!data?.length) throw new Error("OKX DEX API returned no route for this pair and size");
  return data[0];
}

type Quote = {
  toTokenAmount: string;
  toToken?: {tokenUnitPrice?: string; decimals?: string};
};

type Swap = {
  tx: {to: string; data: string; minReceiveAmount: string; value?: string};
  routerResult?: {toTokenAmount?: string};
};

/// POST {mode: "quote" | "swap", stock, amount}
///   quote: what `amount` USDG buys (preview, no calldata)
///   swap:  OKX router, spender, calldata and minimum out, built for the zap
export async function POST(req: Request) {
  let mode = "quote";
  let stockKey = "";
  let amount = "";
  try {
    const body = (await req.json()) as {mode?: string; stock?: string; amount?: string};
    mode = body.mode === "swap" ? "swap" : "quote";
    stockKey = body.stock ?? "";
    amount = String(body.amount ?? "");
  } catch {
    return NextResponse.json({error: "Body must be JSON {mode, stock, amount}"}, {status: 400});
  }

  const stock = STOCKS.find((s) => s.key === stockKey);
  if (!stock) return NextResponse.json({error: `Unknown stock ${stockKey}`}, {status: 400});
  if (!/^[1-9]\d*$/.test(amount)) return NextResponse.json({error: "amount must be USDG base units"}, {status: 400});

  const d = deployments[XLAYER_ID];
  const zap = d?.contracts.zapRouter;
  if (!d || !zap || !isAddress(zap)) {
    return NextResponse.json({error: "No zap router deployed on X Layer"}, {status: 404});
  }
  const c = creds();
  if (!c) {
    return NextResponse.json(
      {error: "OKX DEX API keys missing: set OKX_API_KEY, OKX_SECRET_KEY and OKX_PASSPHRASE."},
      {status: 503},
    );
  }

  const fromToken = d.tokens.USDG as Address;
  const toToken = d.tokens[stock.wrapper] as Address;

  try {
    const q = (await okxGet(c, "/api/v6/dex/aggregator/quote", {
      chainIndex: CHAIN_INDEX,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount,
      dexIds: DEX_IDS,
    })) as unknown as Quote;

    const unitPrice = q.toToken?.tokenUnitPrice ?? null;
    if (mode === "quote") {
      return NextResponse.json({toTokenAmount: q.toTokenAmount, unitPrice});
    }

    const approve = (await okxGet(c, "/api/v6/dex/aggregator/approve-transaction", {
      chainIndex: CHAIN_INDEX,
      tokenContractAddress: fromToken,
      approveAmount: amount,
    })) as {dexContractAddress?: string};

    const s = (await okxGet(c, "/api/v6/dex/aggregator/swap", {
      chainIndex: CHAIN_INDEX,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount,
      userWalletAddress: zap, // the zap holds the USDG and receives the stock
      slippagePercent: SLIPPAGE_PERCENT,
      dexIds: DEX_IDS,
    })) as unknown as Swap;

    const spender = approve.dexContractAddress;
    if (!spender || !isAddress(spender) || !isAddress(s.tx.to)) {
      return NextResponse.json({error: "OKX DEX API returned an unusable route"}, {status: 502});
    }

    return NextResponse.json({
      router: s.tx.to,
      spender,
      data: s.tx.data,
      minReceive: s.tx.minReceiveAmount,
      toTokenAmount: s.routerResult?.toTokenAmount ?? q.toTokenAmount,
      unitPrice,
      slippagePercent: SLIPPAGE_PERCENT,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({error: msg}, {status: 502});
  }
}
