"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type {
  EditorCardDetail, EditorPickup, CastMember, UploadCount, PickupNote, ChapterProgress,
} from "@/lib/editor-data";
import { ChapterField, chapterOptions, defaultChapter } from "./ChapterField";
import { FreshLinkButtons, type PickupBatch } from "@/components/pickups/FreshLinkButtons";

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

/**
 * A message ABOUT a pickup, from whoever sent it back or closed it.
 *
 * VISUALLY DISTINCT FROM THE CORRECTION, deliberately and at some cost to
 * tidiness. The correction is the line to re-record; a note is somebody talking
 * about the fix. Rendering them alike would let "I edited the spliced file and
 * saved over it" be read as a line to perform, which is the one confusion this
 * whole feature must not create.
 *
 * So: a left rule, an attribution, a different weight, and never the
 * quotation-mark treatment the said/should-be pair gets.
 */
function NoteBlock({ notes }: { notes: PickupNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {notes.map(n => (
        <div key={n.id} className="border-l-2 border-sky-400/50 bg-sky-400/[0.06] px-3 py-2">
          <p className="text-[11px] text-sky-200/70">
            {n.author_name}
            <span className="text-white/30"> · {n.author_kind} · </span>
            {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-white/85">{n.body}</p>
        </div>
      ))}
    </div>
  );
}

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

/**
 * Who a new pickup is for, before she touches anything.
 *
 * A solo book has exactly one possible answer, so it is filled in and no control
 * is drawn. A two-hander defaults to the CO-NARRATOR: a pickup is usually about
 * the other person's read, and on the rare occasion it is not, correcting it is
 * one tap. Three or more and there is no defensible guess, so it stays empty and
 * she chooses.
 */
function defaultAssignee(cast: CastMember[]): string {
  if (cast.length === 1) return cast[0].narrator_id;
  if (cast.length === 2) return (cast.find(c => !c.is_owner) ?? cast[0]).narrator_id;
  return "";
}

/**
 * mm:ss(.d), typed as digits.
 *
 * It is a coordinate off her DAW — there is nothing to pick — so the keyboard
 * stays. What goes is the FORMAT being her problem: she types 432 and gets
 * 04:32. Live rows were inconsistently padded (4:32 beside 04:32), which makes
 * ordering within a chapter unreliable because the sort is on the string; the
 * two existing rows were normalised in the same change.
 */
export function maskTimestamp(raw: string): string {
  const d = (raw ?? "").replace(/[^0-9]/g, "").slice(0, 5);
  if (d.length === 0) return "";
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, d.length - 2).padStart(2, "0")}:${d.slice(-2)}`;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}.${d.slice(4)}`;
}

/** What is stored: padded, so string ordering is time ordering. */
export function normaliseTimestamp(v: string): string {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d))?$/.exec((v ?? "").trim());
  if (!m) return (v ?? "").trim();
  return `${m[1].padStart(2, "0")}:${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

function emptyDraft(cast: CastMember[], chapter = ""): Draft {
  return {
    chapter,
    timestamp_at: "",
    kind: "misread",
    said: "",
    should_be: "",
    note: "",
    assigned_narrator_id: defaultAssignee(cast),
  };
}

/**
 * Who the pickup is for — SIZED TO THE BOOK, not to the roster.
 *
 * Rendered by how many people are actually on this card, because that is what
 * changes the question being asked. It is deliberately NOT keyed on
 * narration_format: the format says how a book was produced, the cast says who
 * is on it, and they are not the same fact.
 *
 *   1  a solo book has no question. Say whose it is and draw no control — a
 *      select with one option is a decision she has to make that has one answer.
 *   2  27 of 33 books. Two large named buttons: answering a question, not
 *      filling in a field.
 *   3+ chips, for THIS card's cast only.
 */
function NarratorPicker({
  cast,
  value,
  onChange,
}: {
  cast: CastMember[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (cast.length === 0) {
    // card_cast always returns at least Dean, so this is unreachable unless the
    // function changed. Say so rather than rendering an empty row.
    return <p className="text-sm text-red-300">No cast for this book.</p>;
  }

  // NO SECOND PERSON ANYWHERE IN HERE. `is_owner` marks whose book it is, and
  // this page is read by Marizete as often as by Dean — "you" beside his name
  // told her she was him. "primary narrator" is true for every viewer.
  if (cast.length === 1) {
    return (
      <p className="text-sm text-white/60">
        This pickup is for <span className="font-semibold text-white">{cast[0].display_name}</span>
        <span className="text-white/40"> — the only narrator on this book.</span>
      </p>
    );
  }

  if (cast.length === 2) {
    return (
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Whose read?</p>
        <div className="grid grid-cols-2 gap-3">
          {cast.map(c => {
            const on = value === c.narrator_id;
            return (
              <button
                key={c.narrator_id}
                type="button"
                onClick={() => onChange(c.narrator_id)}
                className={[
                  "rounded-xl border px-4 py-3 text-left transition-colors",
                  on
                    ? "border-[#D4AF37] bg-[#D4AF37]/15 text-white"
                    : "border-white/15 bg-white/5 text-white/70 hover:border-white/30",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{c.display_name}</span>
                <span className="block text-[11px] text-white/40">
                  {c.is_owner ? "primary narrator" : "co-narrator"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Whose read?</p>
      <div className="flex flex-wrap gap-2">
        {cast.map(c => {
          const on = value === c.narrator_id;
          return (
            <button
              key={c.narrator_id}
              type="button"
              onClick={() => onChange(c.narrator_id)}
              className={[
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                on
                  ? "border-[#D4AF37] bg-[#D4AF37]/15 font-semibold text-white"
                  : "border-white/15 bg-white/5 text-white/70 hover:border-white/30",
              ].join(" ")}
            >
              {c.display_name}
              {c.is_owner && (
                <span className="ml-1.5 text-[11px] text-white/40">primary</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EditorCardClient({
  card,
  chaptersEdited,
  chaptersTotal,
  editingCompletedAt,
  pickups,
  cast,
  uploads,
  notes,
  chapterProgress,
  batches,
  userId,
}: {
  card: EditorCardDetail;
  /** From board_for_editor — card_detail_for_editor does not return these. */
  chaptersEdited: number | null;
  chaptersTotal: number | null;
  editingCompletedAt: string | null;
  pickups: EditorPickup[];
  /** THIS book's cast, from card_cast — never the 19-name roster. */
  cast: CastMember[];
  /** Narrator audio for this card, per chapter. Filed and pending kept apart. */
  uploads: UploadCount[];
  notes: PickupNote[];
  chapterProgress: ChapterProgress[];
  /** (chapter, narrator) pairs that already have a link. Never an address. */
  batches: PickupBatch[];
  userId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** A send that partly worked: some emailed, some not. Neither an error nor a success. */
  const [notice, setNotice] = useState("");
  const [edited, setEdited] = useState(String(chaptersEdited ?? ""));

  /*
    THE SET, held locally so a toggle can be optimistic.

    Seeded from the server on every render of the page; a toggle updates it
    immediately and then RECONCILES against what the function returns. A failed
    toggle puts the button back rather than leaving it looking set — a button
    that says "done" for a chapter the database does not think is done is the
    worst outcome available here, because she will not click it again.
  */
  const [doneSet, setDoneSet] = useState<Set<string>>(
    () => new Set(chapterProgress.map(c => c.chapter)),
  );
  const [progressError, setProgressError] = useState("");
  const [total, setTotal] = useState(String(chaptersTotal ?? ""));
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(
      cast,
      defaultChapter(
        chapterOptions(card.chapters, chaptersTotal),
        chaptersEdited,
        [...pickups]
          .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
          .pop()?.chapter ?? null,
      ),
    ),
  );
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

  /** Every chapter this book can show, by the SAME rule the picker uses. */
  const chapterKeys = chapterOptions(card.chapters, total === "" ? null : Number(total));
  const doneCount = doneSet.size;
  const allDone = chapterKeys.length > 0 && chapterKeys.every(k => doneSet.has(k));

  /**
   * One click, optimistic, reconciled on the response.
   *
   * The function returns BOTH the new state and the recomputed count, so the
   * client never has to derive "how many are done" for itself — deriving it is
   * how a count and a set drift apart in the first place.
   */
  async function toggleChapter(key: string) {
    if (busy) return;
    const wasDone = doneSet.has(key);
    setProgressError("");
    setDoneSet(prev => {
      const next = new Set(prev);
      if (wasDone) next.delete(key); else next.add(key);
      return next;
    });

    const { data, error: e } = await supabase.rpc("toggle_chapter_done", {
      p_card_id: card.id,
      p_chapter: key,
    });

    if (e) {
      // VISIBLY REVERT. Silently leaving the optimistic state would show her a
      // chapter as done that is not.
      setDoneSet(prev => {
        const next = new Set(prev);
        if (wasDone) next.add(key); else next.delete(key);
        return next;
      });
      setProgressError(`${key}: ${e.message}`);
      return;
    }

    // Reconcile against the server's answer rather than trusting the guess.
    const row = (data as { done: boolean; chapters_edited: number }[] | null)?.[0];
    if (row) {
      setDoneSet(prev => {
        const next = new Set(prev);
        if (row.done) next.add(key); else next.delete(key);
        return next;
      });
      setEdited(String(row.chapters_edited));
    }
    startTransition(() => router.refresh());
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
      p_timestamp_at: normaliseTimestamp(draft.timestamp_at),
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
      // KEEP CHAPTER, KIND AND NARRATOR. Consecutive pickups are nearly always
      // the same book, chapter and narrator — a different line. Clearing them
      // would make her re-answer three questions she has already answered.
      setDraft(d => ({
        ...emptyDraft(cast, d.chapter),
        kind: d.kind,
        assigned_narrator_id: d.assigned_narrator_id,
      }));
      setEditingId(null);
    }
  }

  const removePickup = (id: string) =>
    run("Deleting pickup", () => supabase.rpc("delete_own_draft_pickup", { p_id: id }));

  /**
   * VERIFICATION, and it is hers.
   *
   * P1 gave her resolve_pickup and no way to use it; without this control
   * `returned` is a dead end — the narrator says "re-recorded" and the row sits
   * there forever. The database already refuses `resolved` from anything but
   * `returned`, so this button only appears where the server would accept it.
   */
  /**
   * Close or dismiss, optionally recording why.
   *
   * PER LINE, unlike the note on Re-recorded: "closing this, the fix is in" is
   * about the correction just closed, not about the chapter's file. Skippable —
   * Cancel abandons the whole action, an empty note simply writes no row.
   */
  const closePickup = (id: string, status: "resolved" | "dismissed") => {
    const note = window.prompt(
      status === "resolved"
        ? "Anything to record about this fix? (optional)"
        : "Why are you dismissing this? (optional)",
      "",
    );
    if (note === null) return Promise.resolve();
    return run(status === "resolved" ? "Closing pickup" : "Dismissing pickup", () =>
      supabase.rpc("resolve_pickup", { p_id: id, p_status: status, p_note: note || null }),
    );
  };

  /**
   * SEND GOES THROUGH THE EDGE FUNCTION, and only through it.
   *
   * This used to call send_chapter_pickups directly, which skipped the sender
   * entirely: the rows went to 'sent' and no narrator was ever emailed. The
   * function calls that same RPC itself, AFTER Resend has accepted the mail —
   * that ordering is the whole guarantee that "sent" means an email went, and
   * calling the RPC from here destroys it while looking like it worked.
   *
   * There is deliberately no fallback to the RPC. A fallback would restore the
   * exact failure this replaces, on the days the function is unavailable, and
   * those are precisely the days nobody would notice.
   */
  async function sendChapter(chapter: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: e } = await supabase.functions.invoke("send-pickups", {
        body: { cardId: card.id, chapter },
      });
      if (e) {
        // invoke() reports a non-2xx as a bare "non-2xx status code". The reason
        // is in the function's own body, and the reason is the useful part.
        let detail = e.message;
        const ctx = (e as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) detail = String(body.error);
          } catch {
            /* a body that will not parse leaves the original message standing */
          }
        }
        setError(`Sending chapter: ${detail}`);
        return;
      }

      // A 2xx IS NOT "IT WENT".
      //
      // The function answers 200 when it did the right thing with a chapter it
      // could not deliver — every narrator skipped for having no address on file
      // is a successful, correct, empty send. Treating that as success is the
      // exact failure the function's own ordering exists to prevent, moved up one
      // layer into the UI: she would press Send, see nothing, and believe the
      // narrator had been told.
      const r = (data ?? {}) as {
        emailed?: { narrator: string; count: number }[];
        skipped?: { narrator: string; reason: string }[];
        failed?: { narrator: string; reason: string }[];
      };
      const emailed = r.emailed ?? [];
      const skipped = r.skipped ?? [];
      const failed = r.failed ?? [];
      const problems = [...skipped, ...failed]
        .map(x => `${x.narrator} — ${x.reason}`)
        .join("; ");

      if (emailed.length === 0) {
        setError(
          problems
            ? `Nothing was sent. ${problems}`
            : "Nothing was sent, and the sender gave no reason.",
        );
        return;
      }
      if (problems) {
        setNotice(
          `Sent to ${emailed.map(x => x.narrator).join(", ")}. Not sent: ${problems}`,
        );
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

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
      {notice && (
        <p className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-2.5 text-sm text-[#E0C15A]">
          {notice}
        </p>
      )}

      {/* ── WAITING ON HER, ABOVE EVERYTHING ELSE ─────────────────────────
          Returned means the narrator has re-recorded and it is her turn. This
          sits above the chapter list because it is the only part of this page
          that is actionable right now, and because the email announcing it will
          often have been missed — the page she opens anyway has to carry the
          signal on its own. */}
      {pickups.some(p => p.status === "returned") && (
        <section className="rounded-2xl border border-[#D4AF37]/50 bg-[#D4AF37]/[0.08] p-4">
          <h2 className="text-sm font-bold text-[#E0C15A]">
            {pickups.filter(p => p.status === "returned").length} re-recorded, waiting on you
          </h2>
          <p className="mt-0.5 text-xs text-white/50">
            Listen, then close each one.
          </p>
          <ul className="mt-3 space-y-2">
            {pickups
              .filter(p => p.status === "returned")
              .map(p => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-white/50">
                      {/^\d/.test(p.chapter.trim()) ? `Chapter ${p.chapter}` : p.chapter} ·{" "}
                      {p.timestamp_at}
                      {p.assigned_narrator_name ? ` · ${p.assigned_narrator_name}` : ""}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-white/90">{summary(p)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePickup(p.id, "resolved")}
                      className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
                    >
                      Verify &amp; close
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePickup(p.id, "dismissed")}
                      className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* ── progress, as a GRID OF CHAPTERS ───────────────────────────────
          A COUNT MEANT "THE FIRST N", and that was the problem. The stepper
          could only say how many were done, never WHICH — so a chapter blocked
          on a pickup forced her to either lie about the number or leave the
          ones after it uncounted. The stored fact is a set now; the count is
          derived from it and still feeds the hub bar and the phone. */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">Editing progress</h2>
          <span className="text-xs text-white/40">
            {doneCount}
            {chapterKeys.length > 0 ? ` of ${chapterKeys.length}` : ""} done
            {editingCompletedAt && <span className="ml-2 text-emerald-300">· complete</span>}
          </span>
        </div>

        {progressError && (
          <p className="mt-2 text-xs text-rose-300">{progressError}</p>
        )}

        {chapterKeys.length > 0 ? (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chapterKeys.map(key => {
                const isDone = doneSet.has(key);
                /*
                  FRONT MATTER IS A CHAPTER HERE. Dedication, Trigger Warnings
                  and Prologue carry no number and every array card has two or
                  three of them — they are real things to edit, and a grid that
                  showed only numbers would silently drop them.
                */
                const numeric = /^\d+$/.test(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleChapter(key)}
                    aria-pressed={isDone}
                    title={isDone ? `${key} — done, click to undo` : `${key} — mark done`}
                    className={
                      (isDone
                        ? "border-[#D4AF37] bg-[#D4AF37] text-black "
                        : "border-white/15 text-white/60 hover:border-white/35 hover:text-white/90 ") +
                      "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 " +
                      (numeric ? "min-w-[2.4rem] tabular-nums" : "")
                    }
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            {/*
              ASKED ONCE, NEVER AUTOMATIC. Filling the last chapter does not
              complete the book — she may want a final pass, and a page that
              decided for her would be wrong exactly when it mattered.
            */}
            {allDone && !editingCompletedAt && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2">
                <span className="text-xs text-[#E0C15A]">
                  All {chapterKeys.length} chapters done — mark the book complete?
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setComplete(true)}
                  className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#E0C15A] disabled:opacity-40"
                >
                  Mark complete
                </button>
              </div>
            )}
          </>
        ) : (
          /*
            TWO THIRDS OF THE CATALOGUE HAVE NO CHAPTER DATA AT ALL — 22 of 33
            cards. There is nothing to draw a grid from, so the number field
            stays and the page says what would make a grid possible, rather
            than rendering an empty row that reads as a book with no chapters.
          */
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-white/50">
                Chapters edited
                <input
                  inputMode="numeric"
                  value={edited}
                  onChange={e => setEdited(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => void saveProgress()}
                  className={`${field} mt-1 w-20 text-center text-base font-semibold`}
                />
              </label>
              <span className="pt-4 text-sm text-white/40">of —</span>
            </div>
            <p className="text-[11px] text-white/40">
              Set the chapter count to track chapters individually.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
          <label className="text-[11px] text-white/40">
            Chapters in the book
            <input
              inputMode="numeric"
              value={total}
              onChange={e => setTotal(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => void saveProgress()}
              placeholder="—"
              className={`${field} mt-1 w-20 text-center`}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setComplete(!editingCompletedAt)}
            className="mt-4 rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            {editingCompletedAt ? "Reopen" : "Mark complete"}
          </button>
        </div>
      </section>

      {/* ── raise a pickup, COLLAPSED WHEN UNUSED ─────────────────────────
          It filled half the viewport and pushed her chapters below the fold, so
          the page opened on a form rather than on her work. */}
      {!formOpen && !editingId ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full rounded-2xl border border-dashed border-white/20 py-3 text-sm text-white/60 transition-colors hover:border-[#D4AF37]/50 hover:text-white/85"
        >
          + Raise a pickup
        </button>
      ) : (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold">{editingId ? "Edit pickup" : "Raise a pickup"}</h2>
          {!editingId && (
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-xs text-white/40 hover:text-white/70"
            >
              Close
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ChapterField
            chapters={card.chapters}
            chaptersTotal={chaptersTotal}
            value={draft.chapter}
            onChange={v => setDraft({ ...draft, chapter: v })}
          />
          <input
            placeholder="Timestamp 04:32"
            value={draft.timestamp_at}
            inputMode="numeric"
            onChange={e => setDraft({ ...draft, timestamp_at: maskTimestamp(e.target.value) })}
            className={field}
            aria-label="Timestamp"
          />

          {/* FOUR BUTTONS, NOT A SELECT. A native select opens a scroll wheel on
              her phone to choose between four things. And the kind drives the
              form below it. */}
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs uppercase tracking-wide text-white/40">What kind?</p>
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map(k => {
                const on = draft.kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, kind: k.value })}
                    className={[
                      "rounded-xl border px-2 py-2.5 text-sm transition-colors",
                      on
                        ? "border-[#D4AF37] bg-[#D4AF37]/15 font-semibold text-white"
                        : "border-white/15 bg-white/5 text-white/70 hover:border-white/30",
                    ].join(" ")}
                  >
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:col-span-2">
            <NarratorPicker
              cast={cast}
              value={draft.assigned_narrator_id}
              onChange={id => setDraft({ ...draft, assigned_narrator_id: id })}
            />
          </div>

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
                setDraft(emptyDraft(cast, draft.chapter));
                setEditingId(null);
              }}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          )}
        </div>
      </section>
      )}

      {/* ------------------------------------------------------------ pickups */}
      <section className="space-y-4">
        {[...byChapter.entries()].map(([chapter, list]) => {
          const sendableCount = list.filter(p => isEditableBy(p, userId)).length;
          return (
            <div key={chapter} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  Chapter {chapter || "—"}
                  {/* AGAINST THE CHAPTER IT BELONGS TO. Filed means it is in the
                      book's folder and she can play it; pending means it is
                      still in quarantine under a uuid name, so it is said
                      differently rather than counted together. */}
                  {(() => {
                    const u = uploads.find(x => x.chapter === chapter);
                    if (!u) return null;
                    return (
                      <>
                        {u.filed > 0 && (
                          <span className="ml-2 rounded-full border border-emerald-400/40 px-2 py-0.5 text-[11px] font-normal text-emerald-300">
                            {u.filed} audio file{u.filed === 1 ? "" : "s"}
                          </span>
                        )}
                        {u.pending > 0 && (
                          <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-normal text-white/40">
                            {u.pending} still filing
                          </span>
                        )}
                      </>
                    );
                  })()}
                </h3>
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

              {/* REPLACING A LINK, NOT SENDING ONE. Rendered from the link table,
                  so a chapter that was never sent shows nothing here at all and
                  the only way to reach a narrator for the first time stays the
                  Send button above. Per narrator, because the token is. */}
              <FreshLinkButtons
                batches={batches.filter(b => b.chapter === chapter)}
                className="mt-2"
              />

              {/* ONCE, AGAINST THE CHAPTER — not repeated under every line.
                  A note about the spliced file is one fact about the chapter,
                  and five copies of it would read as five findings. */}
              <NoteBlock notes={notes.filter(n => n.link_id && n.chapter === chapter)} />

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
                        {/* Notes about THIS line — "I could not hear that one",
                            "closing it, the fix is in". */}
                        <NoteBlock notes={notes.filter(n => n.pickup_id === p.id)} />
                      </div>
                      {p.status === "returned" && (
                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void closePickup(p.id, "resolved")}
                            className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
                          >
                            Verify &amp; close
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void closePickup(p.id, "dismissed")}
                            className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {editable && (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(p.id);
                              setDraft({
                                chapter: p.chapter,
                                timestamp_at: maskTimestamp(p.timestamp_at),
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
