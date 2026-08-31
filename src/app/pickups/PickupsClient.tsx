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
 * If this file ever grows an `update("pickups")`, the site has acquired a second
 * write path and the guarantee is gone.
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

function summary(p: AdminPickup): string {
  if (p.kind === "misread") return `said "${p.said ?? ""}" — should be "${p.shouldBe ?? ""}"`;
  return (p.note ?? "").trim() || p.kind;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "border-white/20 text-white/50",
  sent: "border-[#D4AF37]/50 text-[#D4AF37]",
  resolved: "border-emerald-400/40 text-emerald-300",
  dismissed: "border-white/15 text-white/35",
};

export function PickupsClient({ pickups }: { pickups: AdminPickup[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const { open, closed } = useMemo(
    () => ({
      open: pickups.filter(p => OPEN.has(p.status)),
      closed: pickups.filter(p => !OPEN.has(p.status)),
    }),
    [pickups],
  );

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

  const Row = ({ p }: { p: AdminPickup }) => (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/board/card/${p.cardId}`} className="text-sm font-semibold hover:underline">
            {p.cardTitle}
          </Link>
          <span className="text-xs text-white/40">ch. {p.chapter || "—"}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[p.status] ?? "border-white/15 text-white/40"}`}
          >
            {p.status}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-white/80">{summary(p)}</p>
        <p className="text-[11px] text-white/40">
          {p.timestampAt}
          {p.narratorName ? ` · ${p.narratorName}` : " · unassigned"}
        </p>
      </div>

      {p.status === "sent" && (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busyId === p.id}
            onClick={() => void resolve(p.id, "resolved")}
            className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-400/10 disabled:opacity-40"
          >
            Resolve
          </button>
          <button
            type="button"
            disabled={busyId === p.id}
            onClick={() => void resolve(p.id, "dismissed")}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* A draft is hers and not yet sent. Saying so is better than an inert row
          he might read as broken. */}
      {p.status === "draft" && (
        <span className="shrink-0 text-[11px] text-white/30">not sent yet</span>
      )}
    </li>
  );

  return (
    <main className="min-h-screen bg-[#06082E] px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold">Pickups</h1>
          <p className="text-xs text-white/40">
            {open.length} open · {closed.length} closed
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
            {error}
          </p>
        )}

        {open.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
            Nothing open.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {open.map(p => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
        )}

        {closed.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowClosed(v => !v)}
              className="mt-8 text-xs text-white/40 hover:text-white/70"
            >
              {showClosed ? "Hide" : "Show"} {closed.length} closed
            </button>
            {showClosed && (
              <ul className="mt-3 space-y-2">
                {closed.map(p => (
                  <Row key={p.id} p={p} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
