"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { EditorCardDetail, EditorPickup, EditorNarrator } from "@/lib/editor-data";

/**
 * Her writes — ALL of them through the gated functions, with her JWT.
 *
 * The browser client carries the anon key plus her session, so every `.rpc()`
 * below arrives at Postgres as HER. That is what makes `assert_editor_access`
 * and the ownership checks in `update_own_draft_pickup` real: they are evaluated
 * against a caller, and there is one.
 *
 * THESE ARE THE SAME FUNCTIONS THE PHONE CALLS. No web-only variants — one
 * definition, two surfaces. A second implementation of "may she edit this" is
 * how the economics formula drifted, and this is the same shape of rule.
 *
 * Buttons are drawn from `isEditableBy`, which mirrors what the server enforces.
 * IF THE TWO EVER DISAGREE, THE SERVER IS RIGHT — this only decides what is
 * offered, never what is permitted, and a refusal is surfaced rather than
 * swallowed.
 */

const KINDS = [
  { value: "misread", label: "Misread" },
  { value: "noise", label: "Noise" },
  { value: "sentence", label: "Sentence" },
  { value: "other", label: "Other" },
] as const;

/** Only a misread carries the said/should-be pair — the database refuses one half without the other. */
const needsSaidPair = (kind: string) => kind === "misread";

/** Ownership AND draft, the two conditions delete_own_draft_pickup enforces. */
function isEditableBy(p: EditorPickup, userId: string | null): boolean {
  return p.status === "draft" && !!userId && p.created_by === userId;
}

function summary(p: EditorPickup): string {
  if (p.kind === "misread") return `said "${p.said ?? ""}" — should be "${p.should_be ?? ""}"`;
  const note = (p.note ?? "").trim();
  return note || (KINDS.find(k => k.value === p.kind)?.label ?? "Other");
}

type Draft = {
  chapter: string;
  timestamp_at: string;
  kind: string;
  said: string;
  should_be: string;
  note: string;
  assigned_narrator_id: string;
};

const EMPTY: Draft = {
  chapter: "",
  timestamp_at: "",
  kind: "misread",
  said: "",
  should_be: "",
  note: "",
  assigned_narrator_id: "",
};

export function EditorCardClient({
  card,
  chaptersEdited,
  chaptersTotal,
  editingCompletedAt,
  pickups,
  narrators,
  userId,
}: {
  card: EditorCardDetail;
  /** From board_for_editor — card_detail_for_editor does not return these. */
  chaptersEdited: number | null;
  chaptersTotal: number | null;
  editingCompletedAt: string | null;
  pickups: EditorPickup[];
  narrators: EditorNarrator[];
  userId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [edited, setEdited] = useState(String(chaptersEdited ?? ""));
  const [total, setTotal] = useState(String(chaptersTotal ?? ""));
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * One place where a refusal becomes visible.
   *
   * The gates raise rather than returning zero rows precisely so a refusal
   * cannot read as "nothing happened". Swallowing the error here would undo
   * that at the last possible moment.
   */
  async function run(what: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: e } = await fn();
      if (e) {
        setError(`${what}: ${e.message}`);
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  const saveProgress = () =>
    run("Saving progress", () =>
      supabase.rpc("set_editing_progress", {
        p_card_id: card.id,
        p_chapters_edited: edited === "" ? null : Number(edited),
        p_chapters_total: total === "" ? null : Number(total),
      }),
    );

  const setComplete = (complete: boolean) =>
    run(complete ? "Marking complete" : "Reopening", () =>
      supabase.rpc("set_editing_complete", { p_card_id: card.id, p_complete: complete }),
    );

  async function submitPickup() {
    const payload = {
      p_chapter: draft.chapter.trim(),
      p_timestamp_at: draft.timestamp_at.trim(),
      p_kind: draft.kind,
      p_said: needsSaidPair(draft.kind) ? draft.said.trim() : "",
      p_should_be: needsSaidPair(draft.kind) ? draft.should_be.trim() : "",
      p_note: draft.note.trim(),
      p_assigned_narrator_id: draft.assigned_narrator_id || null,
    };
    const okDone = editingId
      ? await run("Saving pickup", () =>
          supabase.rpc("update_own_draft_pickup", { p_id: editingId, ...payload }),
        )
      : await run("Raising pickup", () =>
          supabase.rpc("create_pickup", { p_card_id: card.id, ...payload }),
        );
    if (okDone) {
      setDraft(EMPTY);
      setEditingId(null);
    }
  }

  const removePickup = (id: string) =>
    run("Deleting pickup", () => supabase.rpc("delete_own_draft_pickup", { p_id: id }));

  const sendChapter = (chapter: string) =>
    run("Sending chapter", () =>
      supabase.rpc("send_chapter_pickups", { p_card_id: card.id, p_chapter: chapter }),
    );

  // Grouped by chapter, because that is the unit that gets sent.
  const byChapter = new Map<string, EditorPickup[]>();
  for (const p of pickups) {
    const list = byChapter.get(p.chapter) ?? [];
    list.push(p);
    byChapter.set(p.chapter, list);
  }

  const field =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#D4AF37]/50 focus:outline-none";

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}

      {/* ---------------------------------------------------------- progress */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-bold">Editing progress</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-white/50">
            Chapters edited
            <input
              inputMode="numeric"
              value={edited}
              onChange={e => setEdited(e.target.value.replace(/[^0-9]/g, ""))}
              className={`${field} mt-1 w-28`}
            />
          </label>
          <label className="text-xs text-white/50">
            Chapters total
            <input
              inputMode="numeric"
              value={total}
              onChange={e => setTotal(e.target.value.replace(/[^0-9]/g, ""))}
              className={`${field} mt-1 w-28`}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveProgress()}
            className="rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setComplete(!editingCompletedAt)}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white/80 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            {editingCompletedAt ? "Reopen" : "Mark complete"}
          </button>
        </div>
      </section>

      {/* ----------------------------------------------------------- new/edit */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-bold">{editingId ? "Edit pickup" : "Raise a pickup"}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Chapter"
            value={draft.chapter}
            onChange={e => setDraft({ ...draft, chapter: e.target.value })}
            className={field}
          />
          <input
            placeholder="Timestamp (04:32.1)"
            value={draft.timestamp_at}
            onChange={e => setDraft({ ...draft, timestamp_at: e.target.value })}
            className={field}
          />
          <select
            value={draft.kind}
            onChange={e => setDraft({ ...draft, kind: e.target.value })}
            className={field}
          >
            {KINDS.map(k => (
              <option key={k.value} value={k.value} className="bg-[#0A0D3A]">
                {k.label}
              </option>
            ))}
          </select>
          <select
            value={draft.assigned_narrator_id}
            onChange={e => setDraft({ ...draft, assigned_narrator_id: e.target.value })}
            className={field}
          >
            <option value="" className="bg-[#0A0D3A]">
              Unassigned
            </option>
            {narrators.map(n => (
              <option key={n.id} value={n.id} className="bg-[#0A0D3A]">
                {n.display_name}
              </option>
            ))}
          </select>

          {/* The pair the database refuses one half of, so the form asks for both. */}
          {needsSaidPair(draft.kind) && (
            <>
              <input
                placeholder="Said"
                value={draft.said}
                onChange={e => setDraft({ ...draft, said: e.target.value })}
                className={field}
              />
              <input
                placeholder="Should be"
                value={draft.should_be}
                onChange={e => setDraft({ ...draft, should_be: e.target.value })}
                className={field}
              />
            </>
          )}

          <input
            placeholder="Note"
            value={draft.note}
            onChange={e => setDraft({ ...draft, note: e.target.value })}
            className={`${field} sm:col-span-2`}
          />
        </div>

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitPickup()}
            className="rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
          >
            {editingId ? "Save changes" : "Raise pickup"}
          </button>
          {editingId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(EMPTY);
                setEditingId(null);
              }}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ pickups */}
      <section className="space-y-4">
        {[...byChapter.entries()].map(([chapter, list]) => {
          const sendableCount = list.filter(p => isEditableBy(p, userId)).length;
          return (
            <div key={chapter} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Chapter {chapter || "—"}</h3>
                {sendableCount > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendChapter(chapter)}
                    className="rounded-lg border border-[#D4AF37]/50 px-3 py-1.5 text-xs font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10 disabled:opacity-40"
                  >
                    Send {sendableCount} draft{sendableCount === 1 ? "" : "s"}
                  </button>
                )}
              </div>

              <ul className="mt-3 space-y-2">
                {list.map(p => {
                  const editable = isEditableBy(p, userId);
                  return (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/90">{summary(p)}</p>
                        <p className="text-[11px] text-white/40">
                          {p.timestamp_at} · {p.status}
                          {p.assigned_narrator_name ? ` · ${p.assigned_narrator_name}` : ""}
                        </p>
                      </div>
                      {editable && (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(p.id);
                              setDraft({
                                chapter: p.chapter,
                                timestamp_at: p.timestamp_at,
                                kind: p.kind,
                                said: p.said ?? "",
                                should_be: p.should_be ?? "",
                                note: p.note ?? "",
                                assigned_narrator_id: p.assigned_narrator_id ?? "",
                              });
                            }}
                            className="text-xs text-white/50 hover:text-white"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removePickup(p.id)}
                            className="text-xs text-rose-300/70 hover:text-rose-300"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
