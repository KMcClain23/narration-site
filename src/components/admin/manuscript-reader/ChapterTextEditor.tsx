"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Repair a chapter whose text came out wrong, or add one that never arrived.
 *
 * The extractor is right most of the time and unfixable when it is not: a
 * scanned PDF, one set in columns, chapter headings that are images. Retrying
 * reproduces the same result, so the only real fallback is the text itself.
 *
 * Deliberately plain. This is the thing you reach for when the clever path has
 * already failed, and it should look like a box you can paste into.
 */

type Props = {
  manuscriptId: string;
  /** Absent when adding a chapter rather than fixing one. */
  chapter?: { id: string; title: string; raw_text: string };
  /** Highlights already on this chapter, all of which an edit will discard. */
  spanCount?: number;
  onDone: () => void;
};

export function ChapterTextEditor({ manuscriptId, chapter, spanCount = 0, onDone }: Props) {
  const router = useRouter();
  const editing = Boolean(chapter);

  const [title, setTitle] = useState(chapter?.title ?? "");
  const [text, setText] = useState(chapter?.raw_text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textChanged = editing && text.trim() !== (chapter?.raw_text ?? "").trim();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  async function save() {
    if (!text.trim()) {
      setError("Paste the chapter text first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = editing
        ? `/api/admin/manuscripts/${manuscriptId}/chapters/${chapter!.id}`
        : `/api/admin/manuscripts/${manuscriptId}/chapters`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, raw_text: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not save.");
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-surface-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {editing ? "Fix this chapter's text" : "Add a chapter by hand"}
      </p>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Chapter title"
        className="mt-3 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none"
      />

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste the chapter text here."
        spellCheck={false}
        className="mt-2 min-h-[280px] w-full rounded-lg border border-surface-border bg-background px-3 py-2 font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none"
      />

      <p className="mt-1 text-[12px] text-text-muted">{words.toLocaleString()} words</p>

      {/* Warned before saving, not discovered afterwards. Highlights are
          offsets into the old text, so every one of them moves when a word
          does; leaving them would mark the wrong words. */}
      {textChanged && spanCount > 0 && (
        <p className="mt-2 text-[13px] text-accent-amber-bright">
          Saving clears the {spanCount} highlight{spanCount === 1 ? "" : "s"} on this chapter. They
          point at positions in the old text and would land on the wrong words.
        </p>
      )}

      {error && <p className="mt-2 text-[13px] text-alert-red">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-accent-amber px-3 py-2 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-40"
        >
          {busy ? "Saving…" : editing ? "Save text" : "Add chapter"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-[13px] text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
