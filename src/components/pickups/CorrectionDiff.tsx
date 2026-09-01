"use client";

import { useEffect, useRef, useState } from "react";
import { diffPickup, type DiffToken } from "@/lib/pickup-diff";

/**
 * said / should be, with the changed words marked.
 *
 * ── UNDERLINE AND STRIKETHROUGH ONLY. NO NEW COLOUR. ───────────────────────
 *
 * Struck in "said", underlined in "should be". Dean has separately asked for
 * less contrast across these screens, and a highlight colour would undo that in
 * the same change. It is also the signal that survives: anyone who cannot
 * distinguish the highlight from the background reads the same marks everyone
 * else does.
 *
 * THE STRIKETHROUGH MOVED FROM THE LINE TO THE WORDS. /pickups struck the whole
 * "said" value through, which says "this line is wrong" — true, but it is the
 * question the reader already had. Striking the word says which one.
 *
 * ── THE CLAMP IS FOR THE ADMIN PAGES ONLY ──────────────────────────────────
 *
 * /pickups is a list to scan, so a thirty-word correction pushing four rows off
 * screen is a real cost; two lines and an expand control keeps it scannable
 * without hiding anything. The narrator page is the opposite: she is working
 * from that text at the microphone, there is exactly one batch on it, and a
 * correction she has to click to finish reading is a correction she can misread.
 * It is never clamped there — that page is the reason `clamp` defaults to off.
 */

function Marked({ tokens, mode }: { tokens: DiffToken[]; mode: "said" | "shouldBe" }) {
  return (
    <>
      {tokens.map((t, i) => (
        <span
          key={i}
          className={
            t.changed
              ? mode === "said"
                ? "line-through decoration-current decoration-2"
                : "underline decoration-current decoration-2 underline-offset-2"
              : undefined
          }
        >
          {t.text}
          {i < tokens.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/**
 * Two lines, then an expand control — but only when there is something hidden.
 *
 * Measured rather than guessed from a character count: the same string wraps to
 * one line on a desktop row and four in a phone column, and a control that
 * expands nothing is worse than no control.
 */
function Clamped({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, open]);

  return (
    <div className={className}>
      <div ref={ref} className={open ? undefined : "line-clamp-2"}>
        {children}
      </div>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="mt-0.5 text-xs text-text-dim underline-offset-2 hover:text-accent-amber hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function CorrectionDiff({
  said,
  shouldBe,
  clamp = false,
  /** Tailwind classes for the two values, so each surface keeps its own type. */
  saidClass = "text-[15px] text-text-muted",
  shouldBeClass = "text-[15px] font-semibold text-text-primary",
  labelClass = "w-20 shrink-0 text-xs uppercase tracking-wide text-text-dim",
}: {
  said: string | null;
  shouldBe: string | null;
  clamp?: boolean;
  saidClass?: string;
  shouldBeClass?: string;
  labelClass?: string;
}) {
  const d = diffPickup(said, shouldBe);
  const Wrap = clamp ? Clamped : ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );

  return (
    <dl className="mt-2 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <dt className={labelClass}>Said</dt>
        <Wrap className={`min-w-0 flex-1 break-words ${saidClass}`}>
          {d.said.length > 0 ? <Marked tokens={d.said} mode="said" /> : "—"}
        </Wrap>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <dt className={labelClass}>Should be</dt>
        <Wrap className={`min-w-0 flex-1 break-words ${shouldBeClass}`}>
          {d.shouldBe.length > 0 ? <Marked tokens={d.shouldBe} mode="shouldBe" /> : "—"}
        </Wrap>
      </div>
    </dl>
  );
}
