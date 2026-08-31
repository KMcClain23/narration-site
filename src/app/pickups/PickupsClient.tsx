"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

/**
 * Every write here is a FUNCTION CALL — resolve_pickup and mark_pickup_returned,
 * with Dean's own session. Never a direct table write. The rules those functions
 * own are enforced once, in the place that owns them. If an `.update("pickups")`
 * ever appears in this file, the site has acquired a second write path.
 *
 * ── WHY THIS IS A TREE AND NOT P1'S FOUR GROUPS ────────────────────────────
 *
 * P1 grouped by whose court the ball is in, to stop Dean being handed buttons
 * for Ann Dahlia's work. That guarantee is KEPT — one primary action, on his own
 * sent rows only, everything else read-only with a quiet force-close.
 *
 * What went is the structure around it. `/pickups` is in `requiresAdmin`, so
 * Marizete never opens it; she works from her editor card page. Only one of the
 * four groups was ever actionable by Dean, which left three headings whose whole
 * job was to say "not you".
 *
 * So: "Needs you" pinned flat at the top — the question the page opens with, and
 * never behind a disclosure — and everything else as book → chapter, which is
 * how the work is actually organised and how the manifests are filed.
 */

export type AdminPickup = {
  id: string;
  cardId: string;
  cardTitle: string;
  assignedNarratorId: string | null;
  chapter: string;
  timestampAt: string;
  kind: string;
  said: string | null;
  shouldBe: string | null;
  note: string | null;
  status: string;
  narratorName: string | null;
  createdAt: string | null;
  sentAt: string | null;
  resolvedAt: string | null;
};

const CLOSED = new Set(["resolved", "dismissed"]);

const KIND_LABEL: Record<string, string> = {
  misread: "Misread",
  noise: "Noise",
  sentence: "Sentence",
  other: "Other",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-text-dim text-text-muted",
  sent: "border-accent-amber-dim text-accent-amber",
  returned: "border-status-prepping text-status-prepping",
  resolved: "border-capacity-light/50 text-capacity-light",
  dismissed: "border-surface-border text-text-dim",
};

/**
 * Chapters sort NUMERICALLY where they can — the existing helper, reused rather
 * than reinvented. They are free text: "12", "Chapter 12", "12a" and "Prologue"
 * are all legal, so a plain string sort puts 10 before 2 and buries Prologue in
 * the middle. Anything without a leading number sorts AFTER the numbered ones.
 */
function chapterKey(chapter: string): [number, string] {
  const m = /(\d+)/.exec(chapter ?? "");
  return [m ? Number(m[1]) : Number.MAX_SAFE_INTEGER, (chapter ?? "").toLowerCase()];
}

function compareChapters(a: string, b: string): number {
  const [an, as_] = chapterKey(a);
  const [bn, bs] = chapterKey(b);
  return an !== bn ? an - bn : as_.localeCompare(bs);
}

/** A leading digit means a bare number wanting the word; anything else is a name. */
function chapterHeading(chapter: string): string {
  const c = (chapter ?? "").trim();
  if (!c) return "Chapter —";
  return /^\d/.test(c) ? `Chapter ${c}` : c;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The most recent thing that happened to a pickup, for ordering books by activity. */
function activityAt(p: AdminPickup): string {
  return [p.resolvedAt, p.sentAt, p.createdAt].filter(Boolean).sort().pop() ?? "";
}

const STORAGE_KEY = "dmn.pickups.collapsed";

export function PickupsClient({
  pickups,
  ownerNarratorId,
}: {
  pickups: AdminPickup[];
  /** Which assignee is Dean, from narrators.profile_id. Null means nothing lands
   *  in "Needs you" rather than everything doing so. */
  ownerNarratorId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  /**
   * The user's EXPLICIT expansion choice per book, where they have made one.
   *
   * Absent means "use the default", which is expanded-if-there-is-open-work — so
   * a book that appears after the preference was written still gets the sensible
   * default rather than inheriting someone else's decision.
   *
   * Every access is wrapped: a private window, cleared site data, or a browser
   * set to block storage all throw here, and none of them should take the page
   * down over a remembered folder.
   */
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setOverride(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* no preference is a fine state to be in */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(override));
    } catch {
      /* not being able to remember is not a failure worth showing anyone */
    }
  }, [override, restored]);

  async function call(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      const { error: e } = await fn();
      if (e) {
        // Surfaced, not swallowed. "The narrator has not sent it back" is a real
        // answer from the function and he needs to read it.
        setError(e.message);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  const markReturned = (id: string) =>
    call(id, () => supabase.rpc("mark_pickup_returned", { p_id: id }));
  const forceClose = (id: string) =>
    call(id, () => supabase.rpc("resolve_pickup", { p_id: id, p_status: "dismissed" }));

  /**
   * DELETE IS NOT DISMISS, and the UI has to keep them apart.
   *
   * Dismiss closes something real and leaves it in the history, so the record of
   * what a chapter needed stays true. Delete is for rows that should never have
   * existed — a mis-tap, a duplicate, a line raised against the wrong book.
   *
   * It is irreversible and there is no undo, so it asks first and names what it
   * is about to remove. Kept as the quietest affordance on the row: the common
   * action is Close, and a destructive control should not sit where a habitual
   * click lands.
   */
  const removePickup = (p: AdminPickup) => {
    const what = `${chapterHeading(p.chapter)} at ${p.timestampAt || "no timestamp"}`;
    if (!window.confirm(`Delete ${what}? This cannot be undone.

To close it instead and keep the record, use Close.`)) {
      return;
    }
    void call(p.id, () => supabase.rpc("delete_pickup", { p_id: p.id }));
  };

  const { needsYou, books, closedCount } = useMemo(() => {
    const isMine = (p: AdminPickup) =>
      ownerNarratorId !== null && p.assignedNarratorId === ownerNarratorId;

    // His own sent rows come OUT of the tree entirely: they are the question the
    // page opens with, and duplicating them below would make the counts lie.
    const needsYou = pickups
      .filter(p => p.status === "sent" && isMine(p))
      .sort((a, b) => compareChapters(a.chapter, b.chapter));
    const mineIds = new Set(needsYou.map(p => p.id));
    const rest = pickups.filter(p => !mineIds.has(p.id));

    type Chapter = { chapter: string; open: AdminPickup[]; closed: AdminPickup[] };
    type Book = {
      cardId: string; title: string; chapters: Chapter[];
      open: number; total: number; lastActivity: string;
    };

    const byBook = new Map<string, Map<string, Chapter>>();
    const meta = new Map<string, { title: string; lastActivity: string }>();

    for (const p of rest) {
      const chapters = byBook.get(p.cardId) ?? new Map<string, Chapter>();
      const ch = chapters.get(p.chapter) ?? { chapter: p.chapter, open: [], closed: [] };
      (CLOSED.has(p.status) ? ch.closed : ch.open).push(p);
      chapters.set(p.chapter, ch);
      byBook.set(p.cardId, chapters);

      const m = meta.get(p.cardId) ?? { title: p.cardTitle, lastActivity: "" };
      const at = activityAt(p);
      if (at > m.lastActivity) m.lastActivity = at;
      meta.set(p.cardId, m);
    }

    const books: Book[] = [...byBook.entries()].map(([cardId, chapterMap]) => {
      const chapters = [...chapterMap.values()]
        .map(c => ({
          ...c,
          open: c.open.sort((a, b) => a.timestampAt.localeCompare(b.timestampAt)),
          closed: c.closed.sort((a, b) => a.timestampAt.localeCompare(b.timestampAt)),
        }))
        .sort((a, b) => compareChapters(a.chapter, b.chapter));
      const open = chapters.reduce((n, c) => n + c.open.length, 0);
      const total = chapters.reduce((n, c) => n + c.open.length + c.closed.length, 0);
      return {
        cardId,
        title: meta.get(cardId)!.title,
        lastActivity: meta.get(cardId)!.lastActivity,
        chapters,
        open,
        total,
      };
    });

    // Books with live work first; then whatever moved most recently.
    books.sort(
      (a, b) =>
        (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) ||
        b.lastActivity.localeCompare(a.lastActivity) ||
        a.title.localeCompare(b.title),
    );

    return { needsYou, books, closedCount: rest.filter(p => CLOSED.has(p.status)).length };
  }, [pickups, ownerNarratorId]);

  /**
   * Expanded if it has open work — unless the user said otherwise for THIS book.
   *
   * The stored value is a TRI-STATE, not a set of collapsed ids. A set could only
   * ever record "collapse this", so a book that defaults to shut (nothing but
   * closed history) could never be opened: removing it from the set puts it back
   * on the default, which is shut. Recording the explicit choice is what lets
   * both directions stick.
   */
  const isExpanded = (b: { cardId: string; open: number }) =>
    b.cardId in override ? override[b.cardId] : b.open > 0;

  const toggleBook = (cardId: string, currentlyExpanded: boolean) =>
    setOverride(prev => ({ ...prev, [cardId]: !currentlyExpanded }));

  function Correction({ p }: { p: AdminPickup }) {
    if (p.kind === "misread") {
      return (
        <dl className="mt-2 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-text-dim">Said</dt>
            <dd className="min-w-0 break-words text-[15px] text-text-muted line-through decoration-text-dim">
              {p.said || "—"}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-text-dim">Should be</dt>
            <dd className="min-w-0 break-words text-[15px] font-semibold text-text-primary">
              {p.shouldBe || "—"}
            </dd>
          </div>
          {p.note?.trim() && (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-text-dim">Note</dt>
              <dd className="min-w-0 break-words text-sm text-text-body">{p.note}</dd>
            </div>
          )}
        </dl>
      );
    }
    return (
      <p className="mt-2 break-words text-[15px] text-text-primary">
        {p.note?.trim() || KIND_LABEL[p.kind] || p.kind}
      </p>
    );
  }

  /** `mine` is the ONLY variant with a primary button — P1's guarantee, kept. */
  function Row({ p, mine, demoted }: { p: AdminPickup; mine?: boolean; demoted?: boolean }) {
    const busy = busyId === p.id;
    return (
      <li
        className={`rounded-xl border px-4 py-3.5 ${
          demoted
            ? "border-surface-border/60 bg-surface/40 opacity-60"
            : "border-surface-border bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="rounded bg-surface-raised px-2 py-0.5 font-mono text-sm font-medium tabular-nums text-text-primary">
                {p.timestampAt || "—"}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[p.status] ?? "border-surface-border text-text-muted"}`}
              >
                {p.status}
              </span>
              {p.kind !== "misread" && (
                <span className="text-[11px] uppercase tracking-wide text-text-dim">
                  {KIND_LABEL[p.kind] ?? p.kind}
                </span>
              )}
            </div>

            <Correction p={p} />

            <p className="mt-2 text-xs text-text-muted">
              {p.narratorName ?? "Unassigned"}
              {p.sentAt ? ` · sent ${shortDate(p.sentAt)}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {mine && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void markReturned(p.id)}
                className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-amber-bright disabled:opacity-40"
              >
                {busy ? "…" : "Re-recorded"}
              </button>
            )}
            {!CLOSED.has(p.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceClose(p.id)}
                className="text-xs text-text-dim underline-offset-2 transition-colors hover:text-text-muted hover:underline disabled:opacity-40"
              >
                Close
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => removePickup(p)}
              title="Permanently remove this pickup"
              className="text-xs text-text-dim/70 underline-offset-2 transition-colors hover:text-alert-red hover:underline disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      </li>
    );
  }

  const visibleBooks = books
    .map(b => ({
      ...b,
      // With the toggle off, a chapter of nothing but history is not a chapter.
      chapters: b.chapters.filter(c => c.open.length > 0 || (showClosed && c.closed.length > 0)),
    }))
    .filter(b => b.chapters.length > 0);

  const nothingAtAll = needsYou.length === 0 && visibleBooks.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-text-primary">Pickups</h1>
        <p className="text-sm text-text-muted">
          {needsYou.length > 0 && `${needsYou.length} needs you · `}
          {books.reduce((n, b) => n + b.open, 0)} open · {closedCount} closed
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-alert-red/50 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
          {error}
        </p>
      )}

      {/* ── pinned, flat, never behind a disclosure ─────────────────────── */}
      {needsYou.length > 0 && (
        <section className="mt-6 rounded-2xl border border-accent-amber-dim/60 bg-accent-amber/[0.06] p-4">
          <h2 className="text-base font-bold text-accent-amber">Needs you</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Your own lines to re-record — {needsYou.length} of them.
          </p>
          <div className="mt-3 space-y-3">
            {needsYou.map(p => (
              <div key={p.id}>
                {/* Flat, so each row names its own book and chapter — there are
                    no folders here to carry that. */}
                <p className="mb-1 text-xs text-text-muted">
                  {p.cardTitle} · {chapterHeading(p.chapter)}
                </p>
                <ul>
                  <Row p={p} mine />
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── the tree ────────────────────────────────────────────────────── */}
      {visibleBooks.length > 0 && (
        <div className="mt-8 space-y-3">
          {visibleBooks.map(b => {
            const expanded = isExpanded(b);
            return (
              <section
                key={b.cardId}
                className="overflow-hidden rounded-2xl border border-surface-border bg-surface/40"
              >
                <button
                  type="button"
                  onClick={() => toggleBook(b.cardId, expanded)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-text-dim">{expanded ? "▾" : "▸"}</span>
                    <span className="truncate text-base font-bold text-text-primary">{b.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {b.open > 0 ? (
                      <span className="text-accent-amber">{b.open} open</span>
                    ) : (
                      <span className="text-text-dim">none open</span>
                    )}
                    {" · "}
                    {b.total} total
                  </span>
                </button>

                {expanded && (
                  <div className="space-y-4 border-t border-divider px-4 pb-4 pt-3">
                    {b.chapters.map(c => (
                      <div key={c.chapter}>
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <h3 className="text-sm font-semibold text-text-body">
                            {chapterHeading(c.chapter)}
                          </h3>
                          <span className="text-xs text-text-dim">
                            {c.open.length > 0 ? `${c.open.length} open` : "closed"}
                            {showClosed && c.closed.length > 0 ? ` · ${c.closed.length} closed` : ""}
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {c.open.map(p => (
                            <Row key={p.id} p={p} />
                          ))}
                          {showClosed &&
                            c.closed.map(p => <Row key={p.id} p={p} demoted />)}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href={`/board/card/${b.cardId}`}
                  className="block border-t border-divider px-4 py-2 text-xs text-text-dim transition-colors hover:text-accent-amber"
                >
                  Open the card
                </Link>
              </section>
            );
          })}
        </div>
      )}

      {nothingAtAll && (
        <p className="mt-6 rounded-xl border border-surface-border bg-surface p-6 text-sm text-text-muted">
          Nothing open.
        </p>
      )}

      {closedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowClosed(v => !v)}
          className="mt-8 text-xs text-text-muted transition-colors hover:text-text-body"
        >
          {showClosed ? "Hide" : "Show"} {closedCount} closed
        </button>
      )}
    </div>
  );
}
