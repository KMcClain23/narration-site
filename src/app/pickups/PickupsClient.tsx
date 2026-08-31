"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

/**
 * Every write here is a FUNCTION CALL — resolve_pickup and mark_pickup_returned,
 * with Dean's own session. Never a direct table write.
 *
 * The rules those functions own — resolved only from returned, dismissed from
 * sent or returned, resolved_by is whoever pressed the button — are enforced
 * once, in the place that owns them. If an `.update("pickups")` ever appears in
 * this file, the site has acquired a second write path and the guarantee is gone.
 *
 * ── GROUPED BY WHOSE COURT THE BALL IS IN ──────────────────────────────────
 *
 * Every sent row used to show Resolve and Dismiss regardless of assignee, so
 * Dean was handed buttons for Ann Dahlia's work — and, since the state machine
 * landed, a Resolve that would have been refused anyway because the narrator has
 * not sent it back. The list now says who is holding each item:
 *
 *   Yours to re-record   his own, sent      → he acts: "Re-recorded"
 *   With the narrator    someone else, sent → read-only; nothing for him to do
 *   Waiting on Marizete  returned           → read-only; verification is hers
 *   Closed               resolved/dismissed → collapsed
 *
 * He keeps a force-close everywhere, as a quiet secondary action rather than a
 * primary button, because "this one is never happening" is a real outcome.
 *
 * EMPTY GROUPS RENDER NOTHING. Two of the four are usually empty, and a heading
 * over an empty list reads as something failing to load.
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
 * Chapters sort NUMERICALLY where they can. They are free text — "12",
 * "Chapter 12", "12a" are all legal — so a plain string sort puts 10 before 2.
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

/**
 * CHAPTER IS FREE TEXT, so the heading cannot just prefix "Chapter". A leading
 * digit means a bare number wanting the word; anything else already reads as a
 * name ("Prologue"), and "Chapter 7" would otherwise render doubled.
 */
function chapterHeading(chapter: string): string {
  const c = (chapter ?? "").trim();
  if (!c) return "Chapter —";
  return /^\d/.test(c) ? `Chapter ${c}` : c;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PickupsClient({
  pickups,
  ownerNarratorId,
}: {
  pickups: AdminPickup[];
  /** Which assignee is Dean, from narrators.profile_id. Null means unknown, and
   *  then nothing lands in "Yours" rather than everything doing so. */
  ownerNarratorId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const groups = useMemo(() => {
    const sorted = [...pickups].sort(
      (a, b) =>
        a.cardTitle.localeCompare(b.cardTitle) ||
        compareChapters(a.chapter, b.chapter) ||
        a.timestampAt.localeCompare(b.timestampAt),
    );
    const isMine = (p: AdminPickup) =>
      ownerNarratorId !== null && p.assignedNarratorId === ownerNarratorId;

    const closed = sorted.filter(p => CLOSED.has(p.status));
    const resolved = closed.filter(p => p.status === "resolved").length;
    const dismissed = closed.length - resolved;
    const parts = [];
    if (resolved) parts.push(`${resolved} resolved`);
    if (dismissed) parts.push(`${dismissed} dismissed`);

    return {
      mine: sorted.filter(p => p.status === "sent" && isMine(p)),
      withNarrator: sorted.filter(p => p.status === "sent" && !isMine(p)),
      returned: sorted.filter(p => p.status === "returned"),
      drafts: sorted.filter(p => p.status === "draft"),
      closed,
      closedLabel: parts.join(" · "),
    };
  }, [pickups, ownerNarratorId]);

  async function call(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      const { error: e } = await fn();
      if (e) {
        // Surfaced, not swallowed. "The narrator has not sent it back" is a real
        // answer from the function and he needs to read it, not watch nothing
        // happen.
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
  const close = (id: string, status: "resolved" | "dismissed") =>
    call(id, () => supabase.rpc("resolve_pickup", { p_id: id, p_status: status }));

  /** The correction itself, at full size and never truncated. */
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

  function Row({ p, actions }: { p: AdminPickup; actions: "mine" | "none" }) {
    const busy = busyId === p.id;
    return (
      <li className="rounded-xl border border-surface-border bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h4 className="text-base font-semibold text-text-primary">
                {chapterHeading(p.chapter)}
              </h4>
              {/* A location, not decoration. It is what he scrubs to. */}
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
            {actions === "mine" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void markReturned(p.id)}
                className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-amber-bright disabled:opacity-40"
              >
                {busy ? "…" : "Re-recorded"}
              </button>
            )}
            {/* FORCE-CLOSE, everywhere and quietly. Secondary on purpose: it is
                the exception, not the flow. */}
            {!CLOSED.has(p.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void close(p.id, "dismissed")}
                className="text-xs text-text-dim underline-offset-2 transition-colors hover:text-text-muted hover:underline disabled:opacity-40"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  /** A heading over nothing reads as a fault, so an empty group renders nothing. */
  function Group({
    title,
    hint,
    rows,
    actions,
  }: {
    title: string;
    hint: string;
    rows: AdminPickup[];
    actions: "mine" | "none";
  }) {
    if (rows.length === 0) return null;
    return (
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-divider pb-2">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <span className="text-xs text-text-dim">
            {rows.length} · {hint}
          </span>
        </div>
        <ul className="space-y-2">
          {rows.map(p => (
            <BookRow key={p.id} p={p} actions={actions} />
          ))}
        </ul>
      </section>
    );
  }

  /** Rows span books inside a group, so each one names its own. */
  function BookRow({ p, actions }: { p: AdminPickup; actions: "mine" | "none" }) {
    return (
      <div>
        <Link
          href={`/board/card/${p.cardId}`}
          className="mb-1 block text-xs text-text-muted hover:text-accent-amber"
        >
          {p.cardTitle}
        </Link>
        <ul>
          <Row p={p} actions={actions} />
        </ul>
      </div>
    );
  }

  const openCount =
    groups.mine.length + groups.withNarrator.length + groups.returned.length + groups.drafts.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-text-primary">Pickups</h1>
        <p className="text-sm text-text-muted">
          {openCount} open{groups.closedLabel ? ` · ${groups.closedLabel}` : ""}
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-alert-red/50 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
          {error}
        </p>
      )}

      {openCount === 0 ? (
        <p className="mt-6 rounded-xl border border-surface-border bg-surface p-6 text-sm text-text-muted">
          Nothing open.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          <Group
            title="Yours to re-record"
            hint="waiting on you"
            rows={groups.mine}
            actions="mine"
          />
          <Group
            title="With the narrator"
            hint="waiting on them"
            rows={groups.withNarrator}
            actions="none"
          />
          <Group
            title="Waiting on Marizete"
            hint="re-recorded, not yet verified"
            rows={groups.returned}
            actions="none"
          />
          {/* Drafts are hers and not yet sent. Shown so an unsent pile is
              visible rather than absent, but there is nothing here for him. */}
          <Group
            title="Not sent yet"
            hint="still drafts"
            rows={groups.drafts}
            actions="none"
          />
        </div>
      )}

      {groups.closed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowClosed(v => !v)}
            className="mt-10 text-xs text-text-muted transition-colors hover:text-text-body"
          >
            {showClosed ? "Hide" : "Show"} {groups.closedLabel}
          </button>
          {showClosed && (
            <ul className="mt-3 space-y-2">
              {groups.closed
                .slice()
                .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
                .map(p => (
                  <Row key={p.id} p={p} actions="none" />
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
