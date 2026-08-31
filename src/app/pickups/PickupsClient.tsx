"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

/**
 * Resolve and dismiss — THROUGH resolve_pickup(), never a direct table write.
 *
 * This is a client component for exactly that reason. It calls the function with
 * Dean's own session, so `assert_board_access` actually evaluates a caller
 * instead of taking the service_role early return, and every rule the function
 * owns — only 'sent' pickups resolve, only into two statuses, `resolved_by` is
 * whoever pressed the button — is enforced once, in the place that owns it.
 *
 * IF AN `.update("pickups")` EVER APPEARS IN THIS FILE, the site has acquired a
 * second write path and the guarantee is gone.
 *
 * ON THE LAYOUT. A pickup is an instruction to go back into a session and fix
 * something, so the correction is the row's centre of gravity and the timestamp
 * is a coordinate — it gets scrubbed to, which is why it is monospace and
 * weighted rather than grey filler. The first version of this page put all of
 * that in truncated 11px grey: the only content that told him what to do was the
 * smallest thing on screen, and a long correction was cut off mid-word.
 */

export type AdminPickup = {
  id: string;
  cardId: string;
  cardTitle: string;
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

const OPEN = new Set(["draft", "sent"]);

const KIND_LABEL: Record<string, string> = {
  misread: "Misread",
  noise: "Noise",
  sentence: "Sentence",
  other: "Other",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-text-dim text-text-muted",
  sent: "border-accent-amber-dim text-accent-amber",
  resolved: "border-capacity-light/50 text-capacity-light",
  dismissed: "border-surface-border text-text-dim",
};

/**
 * Chapters sort NUMERICALLY where they can.
 *
 * They are free text — "12", "Chapter 12", "12a" are all legal — so a plain
 * string sort puts 10 before 2 and scatters a book's chapters. Leading digits
 * decide, and anything without them falls to the end alphabetically.
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
 * CHAPTER IS FREE TEXT, so the heading cannot just prefix "Chapter".
 *
 * She types "12", but "Chapter 7" and "Prologue" are equally legal and both
 * appeared the moment this was tested with realistic values — the first version
 * rendered "Chapter Chapter 7". A leading digit is the signal that the label is
 * a bare number wanting the word; anything else already reads as a name.
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

export function PickupsClient({ pickups }: { pickups: AdminPickup[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const { open, closed, closedLabel } = useMemo(() => {
    const open = pickups.filter(p => OPEN.has(p.status));
    const closed = pickups.filter(p => !OPEN.has(p.status));
    // Say what it IS. "1 closed" beside a Hide button reads as something being
    // withheld; "1 resolved" is the same fact and needs no interpreting.
    const resolved = closed.filter(p => p.status === "resolved").length;
    const dismissed = closed.length - resolved;
    const parts = [];
    if (resolved) parts.push(`${resolved} resolved`);
    if (dismissed) parts.push(`${dismissed} dismissed`);
    return { open, closed, closedLabel: parts.join(" · ") };
  }, [pickups]);

  /** Open work, grouped by book and then in chapter order — he works a book at a time. */
  const byBook = useMemo(() => {
    const m = new Map<string, { title: string; cardId: string; rows: AdminPickup[] }>();
    for (const p of open) {
      const g = m.get(p.cardId) ?? { title: p.cardTitle, cardId: p.cardId, rows: [] };
      g.rows.push(p);
      m.set(p.cardId, g);
    }
    for (const g of m.values()) {
      g.rows.sort((a, b) => compareChapters(a.chapter, b.chapter) ||
        a.timestampAt.localeCompare(b.timestampAt));
    }
    return [...m.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [open]);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      // THE ONLY WRITE ON THIS PAGE, and it is a function call.
      const { error: e } = await supabase.rpc("resolve_pickup", { p_id: id, p_status: status });
      if (e) {
        // Surfaced, not swallowed. "Not sent yet" is a real answer from the
        // function and he needs to see it rather than watch nothing happen.
        setError(e.message);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

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

  function Row({ p }: { p: AdminPickup }) {
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

          {p.status === "sent" ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => void resolve(p.id, "resolved")}
                className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-amber-bright disabled:opacity-40"
              >
                {busyId === p.id ? "…" : "Resolve"}
              </button>
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => void resolve(p.id, "dismissed")}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-text-dim hover:text-text-body disabled:opacity-40"
              >
                Dismiss
              </button>
            </div>
          ) : (
            // A draft is hers and not yet sent. Saying so beats an inert row he
            // might read as broken.
            p.status === "draft" && (
              <span className="shrink-0 text-xs text-text-dim">not sent yet</span>
            )
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-text-primary">Pickups</h1>
        <p className="text-sm text-text-muted">
          {open.length} open{closedLabel ? ` · ${closedLabel}` : ""}
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-alert-red/50 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
          {error}
        </p>
      )}

      {open.length === 0 ? (
        <p className="mt-6 rounded-xl border border-surface-border bg-surface p-6 text-sm text-text-muted">
          Nothing open.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {byBook.map(group => (
            <section key={group.cardId}>
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-divider pb-2">
                <Link
                  href={`/board/card/${group.cardId}`}
                  className="text-lg font-bold text-text-primary hover:text-accent-amber"
                >
                  {group.title}
                </Link>
                <span className="shrink-0 text-xs text-text-dim">
                  {group.rows.length} open
                </span>
              </div>
              <ul className="space-y-2">
                {group.rows.map(p => (
                  <Row key={p.id} p={p} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowClosed(v => !v)}
            className="mt-10 text-xs text-text-muted transition-colors hover:text-text-body"
          >
            {showClosed ? "Hide" : "Show"} {closedLabel}
          </button>
          {showClosed && (
            <ul className="mt-3 space-y-2">
              {closed
                .slice()
                .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
                .map(p => (
                  <Row key={p.id} p={p} />
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
