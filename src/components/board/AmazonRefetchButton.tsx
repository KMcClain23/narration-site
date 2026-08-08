"use client";

import { useState } from "react";
import { adminType } from "@/lib/design-tokens";

export type AmazonPreview = {
  description: string;
  tags: string[];
  triggerWarnings: string[];
};

/**
 * Pull the current Amazon copy into the open card, without saving it.
 *
 * The auto-fill on save is fill-empty-only, which is right — it populates
 * blanks and never overwrites something written by hand. The gap is that there
 * was then no way to say "replace this deliberately", so a description typed
 * as a one-line placeholder stayed that way permanently no matter how many
 * times the card was saved.
 *
 * This fills the form rather than the database. What comes back is visible and
 * editable before saving, and Cancel discards it, so a refetch can never
 * clobber a card on its own.
 */
export function AmazonRefetchButton({
  url,
  onResult,
}: {
  url: string;
  onResult: (result: AmazonPreview) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Only amazon.com can be read. Saying so on the disabled button beats a
  // button that looks available and then explains itself in an alert.
  const canFetch = /^https?:\/\/(www\.)?amazon\.com\//i.test((url ?? "").trim());

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/board/amazon-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote(json.error ?? "Could not read that page.");
        return;
      }
      onResult(json as AmazonPreview);

      const filled = [
        json.description ? "description" : null,
        json.tags?.length ? `${json.tags.length} tags` : null,
        json.triggerWarnings?.length ? `${json.triggerWarnings.length} warnings` : null,
      ].filter(Boolean);
      setNote(filled.length ? `Loaded ${filled.join(", ")}. Not saved yet.` : "Amazon returned nothing usable.");
    } catch {
      setNote("Could not reach Amazon.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {note && <span className={`${adminType.small} text-right`}>{note}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy || !canFetch}
        title={
          canFetch
            ? "Replace description, tags and warnings with Amazon's current copy"
            : "Needs an amazon.com link on this card. Audible links cannot be read."
        }
        className="shrink-0 rounded-full border border-surface-border px-3 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
      >
        {busy ? "Fetching…" : "Refetch from Amazon"}
      </button>
    </div>
  );
}
