"use client";

// 8. Teleprompter / filming mode.
//
// Large text, auto-scrolling, propped on a dash mount. Design rules that come
// from the use case rather than from taste:
//
// - Tap anywhere on the text to start/stop. You are wearing driving gloves and
//   the phone is at arm's length; there is no small control to hit.
// - Only the spoken lines scroll. Visual direction and on-screen text are
//   reference material you read *before* rolling, so they live in a collapsible
//   panel outside the scroll — not in what you're reading off camera.
// - Speed is px/second, adjusted in steps, and persisted for the session so the
//   next take starts where you left it.
// - Everything is client-side: no writes, no refreshes. Filming mode never
//   touches the script.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseChecklist } from "@/lib/content/scriptRules";

const SPEEDS = [8, 12, 16, 22, 30, 40, 55]; // px/second
const DEFAULT_SPEED_INDEX = 2;

export function TeleprompterClient({
  id,
  title,
  hook,
  lines,
  visualDirection,
  onScreenText,
  checklist,
}: {
  id: string;
  title: string;
  hook: string;
  lines: string[];
  visualDirection: string;
  onScreenText: string;
  checklist: string;
}) {
  const [running, setRunning] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  const [fontScale, setFontScale] = useState(1);
  const [showReference, setShowReference] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  // Sub-pixel scroll accumulator: at 8 px/s a per-frame Math.round would
  // quantise to zero and the text would never move.
  const offsetRef = useRef(0);

  const speed = SPEEDS[speedIndex];

  useEffect(() => {
    if (!running) {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTsRef.current = null;
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    offsetRef.current = el.scrollTop;

    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last != null) {
        offsetRef.current += (speed * (ts - last)) / 1000;
        el.scrollTop = offsetRef.current;
        // Reached the end — stop rather than sit there fighting the clamp.
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setRunning(false);
          return;
        }
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTsRef.current = null;
    };
  }, [running, speed]);

  // Keyboard: space toggles, ↑/↓ change speed, R rewinds. Useful when the phone
  // is mounted and a laptop is running the take.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " ") {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSpeedIndex((i) => Math.min(SPEEDS.length - 1, i + 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSpeedIndex((i) => Math.max(0, i - 1));
      } else if (e.key.toLowerCase() === "r") {
        rewind();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function rewind() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    offsetRef.current = 0;
  }

  const outstanding = parseChecklist(checklist).filter((i) => !i.done);
  // The hook is usually also the script's first spoken line. Showing it twice
  // would have you read it twice on camera.
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.!?…"'“”]+$/g, "");
  const showHook = hook.trim().length > 0 && normalize(lines[0] ?? "") !== normalize(hook);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-plane">
      {/* Controls — deliberately chunky; this is operated at arm's length. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
        <Link
          href={`/content/scripts/${id}`}
          className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
        >
          ← Exit
        </Link>
        <span className="max-w-[40%] truncate text-xs text-ink-muted">{title}</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSpeedIndex((i) => Math.max(0, i - 1))}
            disabled={speedIndex === 0}
            className="rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
            title="Slower"
          >
            −
          </button>
          <span className="w-20 text-center font-mono text-xs text-ink-muted">{speed} px/s</span>
          <button
            onClick={() => setSpeedIndex((i) => Math.min(SPEEDS.length - 1, i + 1))}
            disabled={speedIndex === SPEEDS.length - 1}
            className="rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
            title="Faster"
          >
            +
          </button>
          <button
            onClick={() => setFontScale((s) => Math.max(0.7, Math.round((s - 0.15) * 100) / 100))}
            className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs text-ink-secondary transition hover:text-ink-primary"
            title="Smaller text"
          >
            A−
          </button>
          <button
            onClick={() => setFontScale((s) => Math.min(2.2, Math.round((s + 0.15) * 100) / 100))}
            className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs text-ink-secondary transition hover:text-ink-primary"
            title="Bigger text"
          >
            A+
          </button>
          <button
            onClick={() => setMirrored((m) => !m)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              mirrored
                ? "border-series-1 bg-series-1/15 text-ink-primary"
                : "border-hairline bg-surface-2 text-ink-secondary hover:text-ink-primary"
            }`}
            title="Mirror horizontally (for a beam-splitter rig)"
          >
            Mirror
          </button>
          <button
            onClick={rewind}
            className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs text-ink-secondary transition hover:text-ink-primary"
          >
            Rewind
          </button>
          <button
            onClick={() => setRunning((r) => !r)}
            className="rounded-lg bg-series-1 px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            {running ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      {/* The reading surface. Tap = start/stop. */}
      <div
        ref={scrollerRef}
        onClick={() => setRunning((r) => !r)}
        className="flex-1 cursor-pointer overflow-y-auto px-6 py-[35vh] sm:px-16"
        style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
      >
        {showHook && (
          <p
            className="mb-10 font-semibold leading-tight tracking-tight text-series-1"
            style={{ fontSize: `${2.6 * fontScale}rem` }}
          >
            {hook}
          </p>
        )}
        {lines.length === 0 ? (
          <p className="text-xl text-ink-muted">
            No spoken lines in this script yet — write the Script section first.
          </p>
        ) : (
          lines.map((line, i) =>
            line === "" ? (
              <div key={i} style={{ height: `${1.6 * fontScale}rem` }} />
            ) : (
              <p
                key={i}
                className="mb-6 font-medium leading-snug text-ink-primary"
                style={{ fontSize: `${2.2 * fontScale}rem` }}
              >
                {line}
              </p>
            ),
          )
        )}
        <p className="mt-16 text-lg text-ink-muted">— end —</p>
      </div>

      {/* Reference: read before rolling, never part of the scroll. */}
      <div className="border-t border-hairline bg-surface-1">
        <button
          onClick={() => setShowReference((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs text-ink-muted transition hover:text-ink-secondary"
        >
          <span>
            Reference — visual direction, on-screen text
            {outstanding.length > 0 && (
              <span className="ml-2 text-status-warning">
                · {outstanding.length} checklist item{outstanding.length === 1 ? "" : "s"} outstanding
              </span>
            )}
          </span>
          <span aria-hidden>{showReference ? "▾" : "▸"}</span>
        </button>
        {showReference && (
          <div className="grid max-h-[38vh] grid-cols-1 gap-4 overflow-y-auto border-t border-hairline/60 px-3 py-3 text-xs leading-relaxed sm:grid-cols-3">
            <ReferenceBlock title="Visual direction" body={visualDirection} />
            <ReferenceBlock title="On-screen text" body={onScreenText} />
            <div>
              <div className="mb-1 font-medium text-ink-secondary">Still outstanding</div>
              {outstanding.length === 0 ? (
                <p className="text-ink-muted">Checklist clear.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-ink-muted">
                  {outstanding.map((item, i) => (
                    <li key={i}>{item.text}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReferenceBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="mb-1 font-medium text-ink-secondary">{title}</div>
      {body.trim() ? (
        <pre className="whitespace-pre-wrap font-sans text-ink-muted">{body.trim()}</pre>
      ) : (
        <p className="text-ink-muted">—</p>
      )}
    </div>
  );
}
