"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * A filed take: download it, or go and look at it in OneDrive.
 *
 * ── DOWNLOAD IS THE PRIMARY ACTION ─────────────────────────────────────────
 *
 * The badge used to resolve to the file's webUrl, which opens OneDrive's
 * preview page. That is the wrong action for the person who needs it: Marizete
 * is putting the narrator's take into a DAW, and a preview is three more clicks
 * away from the file. Dean has the same need from /pickups.
 *
 * So download leads and "open in OneDrive" stays as a quieter second link —
 * demoted, not removed, because "show me where this actually lives" is a real
 * question, especially when something has gone wrong with the filing.
 *
 * ── MISSING IS MARKED, NOT HIDDEN — BUT IT WAS SAYING SOMETHING UNTRUE ─────
 *
 * A take whose file has been deleted keeps both controls and stays clickable:
 * removing them would erase the one fact worth acting on, and the resolver's
 * page explains the state better than a badge can — it is also what re-checks
 * the file and clears the mark if it has been restored.
 *
 * What was wrong was the wording. Chapter 6 read "2 audio files · missing" with
 * the count struck through, and Dean read it as his recording being lost. It
 * was not: that chapter holds a test upload from 31 August at the old flat path
 * convention, genuinely deleted, AND his real take, present. One badge, one
 * strikethrough, and a chapter with the audio it needs looked empty.
 *
 * SOME AND ALL ARE DIFFERENT FACTS, so they are said differently:
 *
 *   none missing        the ordinary badge, nothing added
 *   some missing        "1 of 2 takes missing", NEUTRAL — the chapter has what
 *                       it needs and nothing here should draw the eye
 *   every take missing  "no take on file", and this one may be loud, because
 *                       now there really is nothing
 *
 * The label is struck through ONLY in the last case. Striking it says the takes
 * are gone, which is precisely the claim that was false.
 *
 * ── AND THE FILE IS NAMED ──────────────────────────────────────────────────
 *
 * "1 of 2 takes missing" is still a puzzle. "Closing Credits — no longer in
 * OneDrive" is answerable at a glance, because Dean knows whether he deleted
 * it. Behind the disclosure, not in the header, so the header stays scannable.
 *
 * ── AND HE CAN REMOVE THE RECORD ───────────────────────────────────────────
 *
 * "I don't want this missing forever." Closing Credits.mp3 was a test upload he
 * deleted on purpose, and its row would report missing on chapter 6 for ever.
 *
 * DELETE APPEARS ONLY ON A ROW THAT IS ALREADY MISSING. Deleting the record of
 * a file that still exists would leave a file nobody is tracking; the database
 * function refuses it too, so the absence of the button is a convenience and
 * not the enforcement.
 *
 * It removes the ROW, never anything in OneDrive — the file is already gone,
 * and reaching for it would either fail or succeed against whatever has taken
 * its place. And the deletion writes an activity event: the sweep exists to
 * surface files that vanish, so a button that erased the evidence would defeat
 * it. The badge stops nagging; the log still remembers.
 */

export type MissingTake = { id: string; name: string | null };

export function TakeLinks({
  uploadId,
  filed,
  missing = 0,
  missingTakes = [],
  label,
  className = "",
}: {
  uploadId: string;
  /** How many takes are filed for this chapter. Missing ones still count. */
  filed: number;
  /** How many of those are no longer in OneDrive. */
  missing?: number;
  /** The ones that are gone — id and name together, so the delete can name it. */
  missingTakes?: MissingTake[] | null;
  /** What the badge says — "1 take · Ann Dahlia · ch 5". */
  label: string;
  className?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const takes = missingTakes ?? [];
  const allGone = filed > 0 && missing >= filed;
  const someGone = missing > 0 && !allGone;

  async function remove(t: MissingTake) {
    if (busy) return;
    setBusy(t.id);
    setError("");
    // A PLAIN RPC WITH HER OWN JWT — the same shape as every other editor
    // write. Nothing here can reach Graph: there is no route in between.
    const { error: err } = await supabase.rpc("delete_missing_upload", { p_upload_id: t.id });
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    setConfirming(null);
    startTransition(() => router.refresh());
  }

  const tone = allGone
    ? "border-alert-red/40 text-alert-red hover:bg-alert-red/10"
    : "border-capacity-light/40 text-capacity-light hover:bg-capacity-light/10";

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 ${className}`}>
      <a
        // No `target="_blank"`: a download should not leave a blank tab behind.
        // The route answers 303 to a pre-authenticated URL and the browser
        // saves the file under its own OneDrive name.
        href={`/api/pickups/file/${uploadId}?as=download`}
        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${tone}`}
      >
        <span className={allGone ? "line-through" : undefined}>{label}</span>
        <span aria-hidden className="ml-1">↓</span>
      </a>

      {allGone && <span className="text-[11px] text-alert-red">· no take on file</span>}
      {someGone && (
        // NEUTRAL, on purpose. This chapter has the audio it needs; the missing
        // row is bookkeeping, not an alarm.
        <span className="text-[11px] text-text-muted">
          · {missing} of {filed} takes missing
        </span>
      )}

      {missing > 0 && takes.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer list-none text-text-muted underline-offset-2 hover:text-text-body hover:underline">
            which?
          </summary>
          <span className="mt-0.5 block text-text-muted">
            {takes.map(t => (
              <span key={t.id} className="block py-0.5">
                {t.name || "an unnamed take"} — no longer in OneDrive
                {confirming === t.id ? (
                  // NAMED IN THE CONFIRMATION. "Delete this record?" is a
                  // question about something the reader has to go and find;
                  // naming the file is what makes it answerable.
                  <span className="ml-2 inline-flex items-center gap-2">
                    <span className="text-text-body">
                      Remove the record of {t.name || "this take"}? The file is already gone.
                    </span>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void remove(t)}
                      className="rounded border border-alert-red/50 px-1.5 py-0.5 text-alert-red hover:bg-alert-red/10 disabled:opacity-40"
                    >
                      {busy === t.id ? "…" : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="text-text-muted underline-offset-2 hover:text-text-body hover:underline"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setConfirming(t.id); setError(""); }}
                    className="ml-2 text-text-muted underline-offset-2 hover:text-alert-red hover:underline"
                  >
                    delete this record
                  </button>
                )}
              </span>
            ))}
            {error && <span className="block text-alert-red">{error}</span>}
          </span>
        </details>
      )}

      <a
        href={`/api/pickups/file/${uploadId}`}
        target="_blank"
        rel="noreferrer"
        // SECONDARY, and it looks it. Plain text, no border, muted.
        className="text-[11px] text-text-body underline-offset-2 transition-colors hover:text-text-primary hover:underline"
      >
        open in OneDrive
      </a>
    </span>
  );
}
