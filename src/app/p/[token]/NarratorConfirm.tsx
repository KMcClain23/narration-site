"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BatchRow } from "@/lib/pickup-link";

/**
 * The list, and the one action.
 *
 * The correction is the point of the page, so it is the largest thing on it and
 * is never truncated — she is reading this in a booth, off a phone, to work
 * from. The timestamp is monospace because it is a coordinate she scrubs to.
 *
 * The confirm posts to a route handler that holds the service key; the token
 * never reaches a database call from this browser, because `anon` has EXECUTE on
 * none of the functions involved.
 */
export function NarratorConfirm({
  token,
  outstanding,
  done,
}: {
  token: string;
  outstanding: BatchRow[];
  done: BatchRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function confirm() {
    if (busy || checked.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pickup-link/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pickupIds: [...checked] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.moved !== "number") {
        setError(body.error ?? "That did not save. Try again.");
        return;
      }
      if (body.moved === 0) {
        // Zero is an answer, not a silence: the link may have been replaced
        // since this page loaded.
        setError("Nothing was updated. This link may have been replaced by a newer one.");
        return;
      }
      setChecked(new Set());
      router.refresh();
    } catch {
      setError("That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function Item({ r, muted }: { r: BatchRow; muted?: boolean }) {
    return (
      <li
        className={`rounded-xl border px-4 py-3.5 ${
          muted ? "border-white/10 bg-white/[0.02] opacity-70" : "border-white/15 bg-white/[0.04]"
        }`}
      >
        <div className="flex items-start gap-3">
          {!muted && (
            <input
              type="checkbox"
              checked={checked.has(r.pickup_id)}
              onChange={() => toggle(r.pickup_id)}
              className="mt-1 h-5 w-5 shrink-0 accent-[#D4AF37]"
              aria-label={`Re-recorded at ${r.timestamp_at}`}
            />
          )}
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded bg-white/10 px-2 py-0.5 font-mono text-sm font-medium tabular-nums text-white">
              {r.timestamp_at || "—"}
            </span>
            {r.kind === "misread" ? (
              <dl className="mt-2 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-white/40">Said</dt>
                  <dd className="min-w-0 break-words text-[15px] text-white/50 line-through">
                    {r.said || "—"}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-white/40">Should be</dt>
                  <dd className="min-w-0 break-words text-[15px] font-semibold text-white">
                    {r.should_be || "—"}
                  </dd>
                </div>
                {r.note?.trim() && (
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-white/40">Note</dt>
                    <dd className="min-w-0 break-words text-sm text-white/70">{r.note}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 break-words text-[15px] text-white">
                {r.note?.trim() || r.kind}
              </p>
            )}
            {muted && <p className="mt-2 text-xs text-white/40">Marked re-recorded</p>}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="mt-8">
      {error && (
        <p className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {outstanding.length > 0 ? (
        <>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/50">
            {outstanding.length} to re-record
          </h2>
          <ul className="space-y-2">
            {outstanding.map(r => (
              <Item key={r.pickup_id} r={r} />
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || checked.size === 0}
              onClick={() => void confirm()}
              className="rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
            >
              {busy
                ? "Saving…"
                : `Mark ${checked.size || ""} re-recorded`.replace("  ", " ")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setChecked(new Set(outstanding.map(r => r.pickup_id)))}
              className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
            >
              Select all
            </button>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
          Everything here has been marked re-recorded. Nothing else is needed from you.
        </p>
      )}

      {done.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-bold uppercase tracking-wide text-white/40">
            Already re-recorded
          </h2>
          <ul className="space-y-2">
            {done.map(r => (
              <Item key={r.pickup_id} r={r} muted />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
