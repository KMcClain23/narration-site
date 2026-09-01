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
 * ── MISSING IS MARKED, NOT HIDDEN ──────────────────────────────────────────
 *
 * A take whose file has been deleted keeps both controls and stays clickable.
 * Removing them would erase the one fact worth acting on, and the resolver's
 * page explains the state far better than a badge can — it is also what
 * re-checks the file and clears the mark if it has been restored. The download
 * lands on the same explanation as the open, because it goes through the same
 * resolver with the same three outcomes.
 */

export function TakeLinks({
  uploadId,
  label,
  gone = false,
  className = "",
}: {
  uploadId: string;
  /** What the badge says — "1 take · Ann Dahlia · ch 5". */
  label: string;
  gone?: boolean;
  className?: string;
}) {
  const tone = gone
    ? "border-rose-400/40 text-rose-300 hover:bg-rose-400/10"
    : "border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        // No `target="_blank"`: a download should not leave a blank tab behind.
        // The route answers 303 to a pre-authenticated URL and the browser
        // saves the file under its own OneDrive name.
        href={`/api/pickups/file/${uploadId}?as=download`}
        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${tone}`}
      >
        <span className={gone ? "line-through" : undefined}>{label}</span>
        {gone && <span className="ml-1 no-underline"> · missing</span>}
        <span aria-hidden className="ml-1">↓</span>
      </a>
      <a
        href={`/api/pickups/file/${uploadId}`}
        target="_blank"
        rel="noreferrer"
        // SECONDARY, and it looks it. Plain text, no border, muted.
        className="text-[11px] text-white/35 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
      >
        open in OneDrive
      </a>
    </span>
  );
}
