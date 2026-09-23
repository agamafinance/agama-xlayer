import {NextRequest, NextResponse} from "next/server";

// The Rayls testnet RPC does not send permissive CORS headers, so the
// browser blocks every direct JSON-RPC fetch from `localhost:3001`. This
// route proxies the call server-side: the browser hits `/api/rpc`,
// Next.js relays the body to the upstream RPC, and the response comes
// back with a same-origin response — no CORS issue.
//
// We also add bounded retry on transient Cloudflare 5xx (502/503/504/520
// /521/522/523/524). Rayls' Cloudflare layer occasionally drops the
// origin connection — observed live during testing, often resolved
// within 1-3 retries. Without retry, every Cloudflare hiccup paints the
// front with `—` placeholders even though the chain state is fine.
const UPSTREAM = "https://testnet-rpc.rayls.com/";

const RETRY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [200, 600, 1500];

async function tryFetch(body: string): Promise<{status: number; data: string}> {
  let lastError: {status: number; data: string} = {status: 502, data: "no upstream attempt"};
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const r = await fetch(UPSTREAM, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body,
        // 12s upper bound per attempt — Rayls usually replies in <500ms
        // when healthy; longer = clear timeout, fall through to retry.
        signal: AbortSignal.timeout(12_000),
      });
      const data = await r.text();
      if (!RETRY_STATUSES.has(r.status)) {
        // 200 or any non-transient error — surface immediately.
        return {status: r.status, data};
      }
      lastError = {status: r.status, data};
    } catch (e) {
      lastError = {
        status: 599,
        data: JSON.stringify({error: {message: `proxy fetch error: ${(e as Error).message}`}}),
      };
    }
    if (i < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    }
  }
  return lastError;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const {status, data} = await tryFetch(body);
  return new NextResponse(data, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Agama-Proxy-Attempts": String(MAX_ATTEMPTS),
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    upstream: UPSTREAM,
    retry: {maxAttempts: MAX_ATTEMPTS, backoffMs: BACKOFF_MS, retryStatuses: [...RETRY_STATUSES]},
  });
}
