import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

const INTENT = "https://app.signo.fi/api/v1beta/intent";

/// The partner key is server-only. Signo's own guidance is blunt about it: a key
/// in a browser bundle is a key someone else will use. The repo `.env` one level
/// up is a convenience for local runs; production reads the environment.
function key(): string | undefined {
  let k = process.env.SIGNO_API_KEY;
  if (k) return k;
  for (const p of [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^SIGNO_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  return undefined;
}

/// Ask Signo, stream the answer back untouched.
///
/// The browser never sees the key and never talks to Signo directly. What comes
/// back is Signo's own SSE stream, forwarded as is, so the client renders the
/// reasoning as it arrives rather than waiting for a whole answer.
export async function POST(req: Request) {
  const k = key();
  if (!k) {
    return NextResponse.json(
      {error: "not_configured", friendly_message: "The agent is not wired up on this deployment yet."},
      {status: 503},
    );
  }

  let prompt: string;
  let wallet: string | undefined;
  try {
    const body = await req.json();
    prompt = String(body.prompt ?? "").slice(0, 2000);
    wallet = typeof body.wallet === "string" ? body.wallet : undefined;
  } catch {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }
  if (!prompt.trim()) return NextResponse.json({error: "invalid_request"}, {status: 400});

  // Signo requires at least one wallet. Before connect there is none to send, so
  // the question goes up against a null address: it answers about the protocol
  // rather than about a position, which is what an unconnected visitor asked.
  const wallets = [{address: wallet ?? "0x0000000000000000000000000000000000000000", chain: "xlayer"}];

  let upstream: Response;
  try {
    upstream = await fetch(INTENT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${k}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({prompt, wallets}),
    });
  } catch {
    return NextResponse.json(
      {error: "upstream_unreachable", friendly_message: "Signo did not answer. Try again in a moment."},
      {status: 502},
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let parsed: {error?: string; friendly_message?: string} = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* Signo answered with something that is not JSON; the status still tells us enough. */
    }
    // The one error worth naming: during beta a key can exist without the partner
    // scope, and then every question fails the same way. Saying so beats a spinner.
    const friendly =
      parsed.error === "partner_not_configured"
        ? "The Agama agent is not switched on for this key yet."
        : (parsed.friendly_message ?? "Signo could not answer that one.");
    return NextResponse.json({error: parsed.error ?? "upstream_error", friendly_message: friendly}, {
      status: upstream.status,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
