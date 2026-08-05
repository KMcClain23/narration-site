"use client";

import { useState } from "react";

// Extracted from CardEditModal (Mobile Redesign Stage 2) so the swipe-to-
// archive gesture and the board's long-press action menu can show this same
// full dialog directly, without opening the whole Edit modal first.
export const ARCHIVE_REASONS = ["recasted", "canceled", "other"] as const;
export const ARCHIVE_REASON_LABEL: Record<string, string> = {
  recasted: "Recasted",
  canceled: "Canceled",
  other: "Other",
};

export function ArchiveConfirmDialog({
  card,
  onArchived,
  onCancel,
}: {
  card: { id: string; title: string };
  // Raw API response row — callers map it to whatever shape they need
  // (CardEditModal maps it to FullBoardCard; the board page just drops the
  // card from its list, the same way it already does for Release).
  onArchived: (rawCard: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [archiveReason, setArchiveReason] = useState<(typeof ARCHIVE_REASONS)[number]>("recasted");
  const [archiveNotes, setArchiveNotes] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: card.id,
          archived_at: new Date().toISOString(),
          archived_reason: archiveReason,
          archived_notes: archiveNotes.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to archive project.");
      onArchived(d.card);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive project.");
      setArchiving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[310] flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-6">
        <h3 className="mb-2 text-base font-bold text-text-primary">Archive &ldquo;{card.title}&rdquo;?</h3>
        <p className="mb-4 text-sm text-text-muted">
          This will be hidden from the board and public site, but kept in the Archive.
        </p>
        <div className="mb-4 flex gap-4 text-sm text-text-body">
          {ARCHIVE_REASONS.map(r => (
            <label key={r} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="archive-reason"
                checked={archiveReason === r}
                onChange={() => setArchiveReason(r)}
                className="accent-accent-amber"
              />
              {ARCHIVE_REASON_LABEL[r]}
            </label>
          ))}
        </div>
        <textarea
          value={archiveNotes}
          onChange={e => setArchiveNotes(e.target.value)}
          rows={3}
          placeholder="Notes (optional)…"
          className="mb-3 w-full rounded-lg border border-surface-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none resize-none"
        />
        {error && <p className="mb-3 text-[13px] text-alert-red">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving}
            className="flex-1 rounded-full bg-surface-raised py-2.5 text-sm font-bold text-text-primary transition hover:brightness-110 disabled:opacity-50"
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}
