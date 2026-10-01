#!/usr/bin/env python3
"""Cut the demo recording down to pitch length, keeping the moments that matter.

    python3 scripts/demo_cut.py <video> <mark seconds...> [--target 40]

`demo_record.py` prints the second at which each thing lands on screen. Give
those here and this holds real time for a beat after each one, then runs the
gaps between them faster: a transaction confirming is dead air, a number
appearing is the whole point. The speed-up is computed so the result hits the
target length rather than guessed.

    python3 scripts/demo_cut.py ../agama-xlayer-local/demo/x.webm \\
        0 7.1 16 24 36.1 48.1 51.1 65.1 75.1 --target 40
"""

import os
import subprocess
import sys

HOLD = 2.6  # seconds of real time to keep from each mark: long enough to read


def build(video, marks, target, out):
    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nk=1:nw=1", video], text=True).strip())

    # Every stretch is either a hold (kept at 1x) or a gap (sped up).
    spans, t = [], 0.0
    for m in sorted(marks):
        if m > t:
            spans.append(("gap", t, m))
        spans.append(("hold", m, min(m + HOLD, dur)))
        t = min(m + HOLD, dur)
    if t < dur:
        spans.append(("gap", t, dur))

    held = sum(b - a for kind, a, b in spans if kind == "hold")
    gapped = sum(b - a for kind, a, b in spans if kind == "gap")
    if held >= target:
        print(f"the held moments alone are {held:.1f}s, over the {target}s target.")
        print("drop a mark or shorten HOLD.")
        return None
    speed = gapped / (target - held)
    print(f"{dur:.1f}s in, {len(marks)} marks, {held:.1f}s held, {gapped:.1f}s of gaps at {speed:.1f}x")

    parts, concat = [], ""
    for i, (kind, a, b) in enumerate(spans):
        if b - a < 0.05:
            continue
        pts = f",setpts=PTS/{speed:.4f}" if kind == "gap" else ""
        parts.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS{pts}[v{i}]")
        concat += f"[v{i}]"
    n = concat.count("[")
    graph = ";".join(parts) + f";{concat}concat=n={n}:v=1:a=0[out]"

    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video,
                    "-filter_complex", graph, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-r", "30", out], check=True)
    got = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nk=1:nw=1", out], text=True).strip())
    print(f"out: {out}  {got:.1f}s")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    target = 40.0
    if "--target" in args:
        i = args.index("--target")
        target = float(args[i + 1])
        args = args[:i] + args[i + 2:]
    video, marks = args[0], [float(a) for a in args[1:]]
    build(video, marks, target, os.path.splitext(video)[0] + f"-cut{int(target)}s.mp4")
