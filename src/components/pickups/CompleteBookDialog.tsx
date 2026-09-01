"use client";

import { useEffect, useRef } from "react";

/**
 * "Mark book as complete and mastered. Ready to submit to the rights holder."
 *
 * ── WHY THIS IS A DIALOG AND NOT A BUTTON ──────────────────────────────────
 *
 * It used to be a plain outline button beside a number field, wearing the
 * database's word for it — "Mark complete" — at the same visual weight as
 * "Reopen". The thing it actually does is declare a book finished and ready to
 * go to the rights holder, which is the largest statement anyone makes in this
 * app and the one hardest to walk back once a file has been sent on.
 *
 * ── THE CONFIRMATION CARRIES FACTS, NOT A SECOND ASK ───────────────────────
 *
 * A dialog that only says "are you sure?" adds a click and no information; it
 * trains people to press through it. This one states what is true at the moment
 * of pressing:
 *
 *   - the book, and how many chapters are marked done out of the total
 *   - HOW MANY PICKUPS ARE STILL OPEN, which is the one that matters
 *
 * Declaring a book ready to submit with fifteen corrections outstanding is
 * exactly what a confirmation exists to catch, and it is invisible from this
 * screen otherwise — the pickups live further down the page, and open ones on
 * other chapters are not on screen at all.
 *
 * ── IT WARNS, IT DOES NOT BLOCK ────────────────────────────────────────────
 *
 * Dean may have a good reason: corrections handed to a co-narrator, a chapter
 * the rights holder already accepted, a book being submitted in parts. The
 * dialog's job is to make sure he knows, not to decide for him. The confirm
 * button stays enabled and keeps its own wording no matter what the counts say.
 */

export type CompletionFacts = {
  title: string;
  chaptersDone: number;
  /** Null when the book has no chapter count set — then the ratio is not shown. */
  chaptersTotal: number | null;
  /** 'sent' + 'returned': everything not yet resolved or dismissed. */
  openPickups: number;
};

export function CompleteBookDialog({
  facts,
  busy,
  onConfirm,
  onCancel,
}: {
  facts: CompletionFacts;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button, and let Escape out. Nothing here is destructive
  // enough to warrant focusing Cancel — this is reversible with Reopen.
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const chaptersLine =
    facts.chaptersTotal !== null
      ? `${facts.chaptersDone} of ${facts.chaptersTotal} chapters marked done`
      : `${facts.chaptersDone} chapter${facts.chaptersDone === 1 ? "" : "s"} marked done`;

  const chaptersShort =
    facts.chaptersTotal !== null && facts.chaptersDone < facts.chaptersTotal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-book-title"
        className="w-full max-w-md rounded-2xl border border-[#D4AF37]/40 bg-[#0A0D3A] p-5 shadow-2xl"
      >
        <p className="text-[11px] uppercase tracking-[1px] text-[#D4AF37]">Mastered</p>
        <h2 id="complete-book-title" className="mt-1 text-lg font-bold text-white">
          Mark {facts.title} complete and mastered?
        </h2>
        <p className="mt-2 text-sm text-white/70">
          This says the book is finished and ready to submit to the rights holder.
        </p>

        {/* THE FACTS, in the order they matter. */}
        <ul className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
          <li className={chaptersShort ? "text-amber-200" : "text-white/70"}>
            {chaptersLine}
            {chaptersShort && (
              <span className="block text-xs text-amber-200/80">
                {facts.chaptersTotal! - facts.chaptersDone} not marked done yet.
              </span>
            )}
          </li>
          <li className={facts.openPickups > 0 ? "font-semibold text-amber-200" : "text-white/70"}>
            {facts.openPickups === 0
              ? "No pickups are open."
              : `${facts.openPickups} pickup${facts.openPickups === 1 ? " is" : "s are"} still open.`}
            {facts.openPickups > 0 && (
              <span className="block text-xs font-normal text-amber-200/80">
                {/* Named as a consequence, not as a rule. He is being told what
                    this means, not told he may not. */}
                Submitting with corrections outstanding means they will not be in
                the delivered files.
              </span>
            )}
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            Not yet
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
          >
            {busy ? "Marking…" : "Complete and mastered"}
          </button>
        </div>
      </div>
    </div>
  );
}
