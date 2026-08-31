"use client";

import { useRef, useState } from "react";
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

  /**
   * ATTACHING IS OPTIONAL AND NEVER MARKS ANYTHING.
   *
   * She may have sent the audio another way entirely — WeTransfer, a shared
   * folder, email. Blocking the confirm on an upload would make this page refuse
   * work that is already done. And uploading must not itself move a pickup to
   * returned: that stays her deliberate action, because "the file arrived" and
   * "I am finished with these" are different claims and only she can make the
   * second one.
   */
  const [attached, setAttached] = useState<{ name: string; bytes: number }[]>([]);
  const [uploading, setUploading] = useState("");
  const [uploadError, setUploadError] = useState("");
  /**
   * The native file input keeps showing the chosen filename after the upload has
   * finished, so the control said "Chapter 12.wav" while the receipt below it
   * said "received" — which reads as a file still waiting to be sent. Clearing
   * it in `finally` covers BOTH directions: a stale filename beside a FAILED
   * upload is the same lie the other way round.
   */
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

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

  async function attach(list: FileList | null) {
    if (!list || list.length === 0 || uploading) return;
    const files = [...list];
    setUploadError("");
    try {
      setUploading(`Preparing ${files.length} file${files.length === 1 ? "" : "s"}…`);
      const signRes = await fetch("/api/pickup-link/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          files: files.map(f => ({ name: f.name, contentType: f.type, bytes: f.size })),
        }),
      });
      const signed = await signRes.json().catch(() => ({}));
      if (!signRes.ok) {
        setUploadError(signed.error ?? "Those files could not be accepted.");
        return;
      }

      for (let i = 0; i < signed.files.length; i++) {
        const target = signed.files[i];
        const file = files[i];
        setUploading(`Sending ${i + 1} of ${signed.files.length}: ${file.name}`);
        // A OneDrive upload session wants Content-Range even for a single PUT,
        // and answers 200/201 on the final chunk. The URL is bound to one
        // destination path and expires; it is not a general drive credential.
        const put = await fetch(target.url, {
          method: "PUT",
          headers: {
            "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
          },
          body: file,
        });
        if (!put.ok) {
          setUploadError(`${file.name} did not upload. Try again.`);
          return;
        }
      }

      setUploading("Checking the files…");
      const doneRes = await fetch("/api/pickup-link/uploaded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          files: signed.files.map((t: { path: string }, i: number) => ({
            path: t.path, name: files[i].name, contentType: files[i].type,
          })),
        }),
      });
      // NOT named `done`: that is a prop on this component, holding the
      // already-returned pickups. Shadowing it with a different type here is a
      // trap for whoever edits this next.
      const checkResult = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) {
        setUploadError(checkResult.error ?? "The files could not be checked.");
        return;
      }
      setAttached(prev => [...prev, ...(checkResult.accepted ?? [])]);
      if ((checkResult.rejected ?? []).length > 0) {
        setUploadError(
          (checkResult.rejected as { name: string; reason: string }[])
            .map(r => `${r.name}: ${r.reason}`)
            .join("; "),
        );
      }
    } catch {
      setUploadError("Something went wrong sending those files.");
    } finally {
      setUploading("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

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

      {/* ── attaching audio, entirely optional ──────────────────────────
          DEMOTED, NOT REMOVED, once nothing is outstanding. A full-size upload
          panel under "nothing else is needed from you" contradicts the sentence
          above it — but hiding it outright would send her back to email the
          moment she remembers a file, so it collapses to one quiet line she can
          open again. Attaching still marks nothing, in either state. */}
      {outstanding.length === 0 && !attachOpen ? (
        <button
          type="button"
          onClick={() => setAttachOpen(true)}
          className="mt-10 block text-sm text-white/50 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
        >
          Sent another take? Attach it
        </button>
      ) : (
      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-bold">Attach the re-recorded audio</h2>
        <p className="mt-1 text-xs text-white/50">
          Optional — if you have already sent the files another way, skip this. Up to 5
          files, 200 MB each. WAV, FLAC, MP3 or M4A.
        </p>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".wav,.flac,.mp3,.m4a,audio/*"
          disabled={!!uploading}
          onChange={e => void attach(e.target.files)}
          className="mt-4 block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15 disabled:opacity-40"
        />

        {uploading && <p className="mt-3 text-sm text-[#D4AF37]">{uploading}</p>}
        {uploadError && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {uploadError}
          </p>
        )}

        {attached.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {attached.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex items-center gap-2 text-sm text-white/80">
                <span className="text-emerald-400">received</span>
                <span className="truncate">{a.name}</span>
                <span className="text-xs text-white/40">{mb(a.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
