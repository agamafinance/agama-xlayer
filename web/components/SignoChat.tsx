'use client';

import {useEffect, useRef, useState} from 'react';

/// The Signo agent, as a bubble in the corner.
///
/// Signo ships no widget: a partner builds the chat and calls the API from its
/// own backend, so this talks to `/api/signo` and never sees the partner key.
/// Their integration guide asks for one chat column with the composer pinned at
/// the bottom, reasoning streamed inline, and no JSON on screen. That is what
/// this is, scaled down to a corner panel.

type Turn = {role: 'you' | 'signo'; text: string; status?: string; link?: boolean};

/// The agent Signo hosts for us. It answers today; ours answers once Signo
/// turns the partner scope on, so until then the panel points at theirs rather
/// than leaving the question unanswered.
const HOSTED = 'https://app.signo.fi/agama';

const EXAMPLES = [
  'How does Agama Earn work?',
  'Compare USDG and stablecoin yields on X Layer',
  'What happens to my position over the weekend?',
];

export function SignoChat({wallet}: {wallet?: string}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({top: thread.current.scrollHeight, behavior: 'smooth'});
  }, [turns, open]);

  async function ask(prompt: string) {
    if (!prompt.trim() || busy) return;
    setDraft('');
    setBusy(true);
    setTurns((t) => [...t, {role: 'you', text: prompt}, {role: 'signo', text: '', status: 'Thinking'}]);

    const land = (patch: Partial<Turn>) =>
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? {...x, ...patch} : x)));

    try {
      // Under /xlayer, not /api: app.agama.finance only proxies the /xlayer
      // prefix to this deployment, so a route outside it answers from the other
      // project and 404s.
      const res = await fetch('/xlayer/api/signo', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prompt, wallet}),
      });

      if (!res.ok || !res.body) {
        const why = await res.json().catch(() => ({}));
        // Not switched on yet is the expected answer during the beta, not a
        // fault: say so plainly and hand the question to the agent that can
        // already take it.
        const pending = res.status === 403;
        land({
          text: pending
            ? 'The agent is not switched on for this surface yet. Signo hosts it in the meantime:'
            : (why.friendly_message ?? 'Signo could not answer that one.'),
          link: pending,
          status: undefined,
        });
        return;
      }

      // Signo's SSE: `delta` carries the text as it is written, `tool-start`
      // says what it is reading, `final` closes the turn.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream: true});
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const ev = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
          const raw = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
            .join('');
          if (!raw) continue;
          let data: any;
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }
          if (ev === 'delta' && typeof data === 'string') {
            text += data;
            land({text, status: undefined});
          } else if (ev === 'delta' && typeof data?.text === 'string') {
            text += data.text;
            land({text, status: undefined});
          } else if (ev === 'tool-start') {
            land({status: typeof data?.label === 'string' ? data.label : 'Reading onchain data'});
          } else if (ev === 'final') {
            const final = typeof data?.reasoning === 'string' ? data.reasoning : text;
            land({text: final || 'No answer came back.', status: undefined});
          }
        }
      }
      if (!text) land({text: 'No answer came back.', status: undefined});
    } catch {
      land({text: 'The connection dropped before Signo finished.', status: undefined});
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the Agama agent"
        className="fixed bottom-5 right-5 z-50 flex h-12 items-center gap-2 rounded-full bg-[#254839] px-5 text-[14px] font-medium text-[#fdf8ed] shadow-lg transition hover:bg-[#1d3a2e]"
      >
        Ask Agama
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(620px,calc(100vh-3rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-[#fdf8ed] shadow-2xl ring-1 ring-black/10">
      <header className="flex items-center justify-between bg-[#254839] px-4 py-3 text-[#fdf8ed]">
        <div>
          <p className="flex items-center gap-2 text-[14px] font-medium leading-tight">
            Agama agent
            <span className="rounded-full bg-[#fdf8ed]/20 px-2 py-0.5 text-[10px] font-normal tracking-wide">
              PREVIEW
            </span>
          </p>
          <p className="text-[11px] opacity-70">Powered by Signo</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded-full px-2 py-1 text-[18px] leading-none opacity-70 transition hover:opacity-100"
        >
          ×
        </button>
      </header>

      <div ref={thread} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-[#254839]/70">
              Ask about the markets, the agents, or what a position does once it is open. Agama runs on
              X Layer testnet, so the agent explains and watches; it does not prepare transactions.
              Answers here are still being switched on, and the hosted agent takes the question in the
              meantime.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => ask(e)}
                  className="rounded-full bg-[#254839]/[0.07] px-3 py-1.5 text-left text-[12px] text-[#254839] transition hover:bg-[#254839]/[0.12]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === 'you' ? 'flex justify-end' : ''}>
            <div
              className={
                t.role === 'you'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-[#254839] px-3 py-2 text-[13px] text-[#fdf8ed]'
                  : 'max-w-[92%] text-[13px] leading-relaxed text-[#254839] whitespace-pre-wrap'
              }
            >
              {t.text}
              {t.status && (
                <span className="inline-block animate-pulse text-[#254839]/50">{t.status}…</span>
              )}
              {t.link && (
                <a
                  href={HOSTED}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block w-fit rounded-full bg-[#254839] px-3 py-1.5 text-[12px] text-[#fdf8ed]"
                >
                  Open the Agama agent
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="border-t border-[#254839]/10 p-3"
      >
        <div className="flex items-end gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the agent…"
            className="min-w-0 flex-1 rounded-xl bg-[#254839]/[0.06] px-3 py-2.5 text-[13px] text-[#254839] outline-none placeholder:text-[#254839]/40"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-xl bg-[#254839] px-3.5 py-2.5 text-[13px] text-[#fdf8ed] transition disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
