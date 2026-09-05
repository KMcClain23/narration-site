"use client";

import { useState, useTransition, useMemo} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type {
  EditorCardDetail, EditorPickup, CastMember, UploadCount, PickupNote, ChapterProgress,
} from "@/lib/editor-data";
import { ChapterField, chapterOptions, defaultChapter } from "./ChapterField";
import { FreshLinkButtons, type PickupBatch } from "@/components/pickups/FreshLinkButtons";
import { CompleteBookDialog } from "@/components/pickups/CompleteBookDialog";
import { CorrectionDiff } from "@/components/pickups/CorrectionDiff";
import { NOISE_TYPES, noiseLabel } from "@/lib/noise-types";
import { TakeLinks } from "@/components/pickups/TakeLinks";

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
        <div key={n.id} className="border-l-2 border-status-prepping/50 bg-status-prepping/[0.06] px-3 py-2">
          <p className="text-[11px] text-status-prepping/70">
            {n.author_name}
            <span className="text-text-muted"> · {n.author_kind} · </span>
            {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-text-primary">{n.body}</p>
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

function summary(p: EditorPickup, noise?: string): string {
  if (p.kind === "misread") return `said "${p.said ?? ""}" — should be "${p.should_be ?? ""}"`;
  const note = (p.note ?? "").trim();
  const label = KINDS.find(k => k.value === p.kind)?.label ?? "Other";
  /*
    THE NOISE TYPE LEADS, and the note follows it.

    "Noise · plosive" then whatever she wrote. A note is optional and often
    empty, so putting the type inside it would lose it exactly when it is the
    only thing there is.
  */
  if (p.kind === "noise" && noise) {
    const head = `${label} · ${noiseLabel(noise)}`;
    return note ? `${head} — ${note}` : head;
  }
  return note || label;
}

type Draft = {
  chapter: string;
  /** Only meaningful when kind is "noise"; cleared by the server otherwise. */
  noise_type: string;
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
  const text = raw ?? "";
  const d = text.replace(/[^0-9]/g, "").slice(0, 5);
  if (d.length === 0) return "";

  /*
    ── SHE TYPED A SEPARATOR; HONOUR IT ─────────────────────────────────────

    A typed ":" was thrown away and the shape re-derived from the digit count,
    which is what made "13:47" unrecoverable. "1:05" is unambiguous — the
    minutes are what precede the colon — and needs no guessing at all.

    A typed "." opens the tenths slot on its own, so "1:01." accepts one more
    digit rather than needing a fifth.
  */
  const typed = /^(\d{1,2}):(\d{0,2})(?:\.(\d?))?$/.exec(text.trim());
  if (typed) {
    const [, mm, ss, tenths] = typed;
    return `${mm}:${ss}${tenths !== undefined ? `.${tenths}` : ""}`;
  }
  // A trailing separator mid-type: "13:" and "1:01." are both legitimate
  // half-finished states and must survive the keystroke that made them.
  const trailing = /^(\d{1,2}):$/.exec(text.trim());
  if (trailing) return `${trailing[1]}:`;
  const trailingDot = /^(\d{1,2}):(\d{2})\.$/.exec(text.trim());
  if (trailingDot) return `${trailingDot[1]}:${trailingDot[2]}.`;

  if (d.length <= 2) return d;
  /*
    ── AND NO PADDING WHILE TYPING ──────────────────────────────────────────

    This was `.padStart(2, "0")`, and the zero it inserted at three digits
    became part of the input on the NEXT keystroke: "134" rendered "01:34", so
    the fourth digit landed in the tenths slot and "13:47" was stored as
    "01:34.7". Every timestamp of ten minutes or more was wrong, and a wrong
    timestamp cuts the clip from the wrong part of the chapter — the narrator
    then re-records a line that was never wrong.

    Padding is normaliseTimestamp's job and it already does it on save. A mask
    that edits what it has already produced cannot be idempotent, and this one
    was not.
  */
  if (d.length <= 4) return `${d.slice(0, d.length - 2)}:${d.slice(-2)}`;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}.${d.slice(4)}`;
}

/**
 * What is stored: padded, so string ordering is time ordering.
 *
 * RETURNS NULL FOR A TIME THAT CANNOT EXIST. Seconds were matched as `(\d{2})`
 * with no range check, so the mask's own "02:63.0" stored happily — and 63
 * seconds is not a place in a chapter. The caller refuses the save and says so
 * rather than coercing it to something she did not type.
 */
export function normaliseTimestamp(v: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d))?$/.exec((v ?? "").trim());
  if (!m) return (v ?? "").trim() === "" ? "" : null;
  if (Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

function emptyDraft(cast: CastMember[], chapter = ""): Draft {
  return {
    chapter,
    timestamp_at: "",
    kind: "misread",
    noise_type: "",
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
    return <p className="text-sm text-alert-red">No cast for this book.</p>;
  }

  // NO SECOND PERSON ANYWHERE IN HERE. `is_owner` marks whose book it is, and
  // this page is read by Marizete as often as by Dean — "you" beside his name
  // told her she was him. "primary narrator" is true for every viewer.
  if (cast.length === 1) {
    return (
      <p className="text-sm text-text-muted">
        This pickup is for <span className="font-semibold text-text-primary">{cast[0].display_name}</span>
        <span className="text-text-muted"> — the only narrator on this book.</span>
      </p>
    );
  }

  if (cast.length === 2) {
    return (
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">Whose read?</p>
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
                    ? "border-accent-amber bg-accent-amber/15 text-text-primary"
                    : "border-surface-border bg-surface text-text-body hover:border-surface-border",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{c.display_name}</span>
                <span className="block text-[11px] text-text-muted">
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
      <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">Whose read?</p>
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
                  ? "border-accent-amber bg-accent-amber/15 font-semibold text-text-primary"
                  : "border-surface-border bg-surface text-text-body hover:border-surface-border",
              ].join(" ")}
            >
              {c.display_name}
              {c.is_owner && (
                <span className="ml-1.5 text-[11px] text-text-muted">primary</span>
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
  noiseTypes: noiseTypeRows,
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
  /** pickup id -> noise type, read separately because the pickup RPC is frozen. */
  noiseTypes: { pickup_id: string; noise_type: string }[];
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

  /*
    COMPLETING ASKS FIRST; REOPENING DOES NOT.

    They are not symmetrical. "Ready to submit to the rights holder" is a claim
    that leaves this app — reopening only takes it back, and a confirmation on
    the undo would be friction on the safe direction.
  */
  const noiseTypes = useMemo(
    () => new Map(noiseTypeRows.map(r => [r.pickup_id, r.noise_type])),
    [noiseTypeRows],
  );

  const [confirmingComplete, setConfirmingComplete] = useState(false);

  const setComplete = (complete: boolean) =>
    run(complete ? "Marking complete" : "Reopening", () =>
      supabase.rpc("set_editing_complete", { p_card_id: card.id, p_complete: complete }),
    );

  /*
    The facts the dialog states, read at the moment of pressing.

    OPEN MEANS sent OR returned — everything not yet resolved or dismissed.
    `returned` counts: the narrator has re-recorded it but nobody has verified
    it, so it is still outstanding work on this book and the whole point of the
    warning is that it is not visible from up here.
  */
  const completionFacts = {
    title: card.title,
    chaptersDone: doneSet.size,
    chaptersTotal: total === "" ? null : Number(total),
    openPickups: pickups.filter(p => p.status === "sent" || p.status === "returned").length,
  };

  async function submitPickup() {
    /*
      REFUSED, NOT COERCED.

      normaliseTimestamp returns null for a time that cannot exist — 63 seconds
      is not a place in a chapter, and it used to store happily because seconds
      were matched as two digits with no range check. Silently correcting it
      would put the pickup somewhere she did not choose, and the clip would be
      cut from there.
    */
    const at = normaliseTimestamp(draft.timestamp_at);
    if (at === null) {
      setError(
        `"${draft.timestamp_at}" is not a time in the chapter. ` +
          `Use mm:ss, with seconds under 60 — for example 13:47.`,
      );
      return;
    }

    const payload = {
      p_chapter: draft.chapter.trim(),
      p_timestamp_at: at,
      p_kind: draft.kind,
      p_said: needsSaidPair(draft.kind) ? draft.said.trim() : "",
      p_should_be: needsSaidPair(draft.kind) ? draft.should_be.trim() : "",
      p_note: draft.note.trim(),
      p_assigned_narrator_id: draft.assigned_narrator_id || null,
      // Sent always; the server clears it for any kind that is not noise, so a
      // draft switched away from Noise cannot carry an invisible value.
      p_noise_type: draft.kind === "noise" ? draft.noise_type || "other" : null,
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
    "w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-faint focus:border-accent-amber/50 focus:outline-none";

  /*
    ── THREE GROUPS, IN THE ORDER THEY NEED HER ──────────────────────────

    Needs review is the narrator's work come back and is the only group asking
    for anything. Pending is out with her and is the largest — making it loud is
    what produced the original "everything is shouting". Already verified is
    history, and starts collapsed: it is what Dean did not want to scroll past.
  */
  /*
    ── THE FOURTH GROUP, AND WHY IT WAS MISSING ────────────────────────────

    These three predicates — returned, sent, resolved-or-dismissed — replaced a
    single map built from EVERY pickup when the editor surface was restructured
    on 2026-09-01. `draft` matches none of them, so a raised pickup went
    nowhere: no group, and therefore no chapter card, and therefore no send
    button — because `sendableCount` below counts drafts across lists that by
    construction hold none, and could only ever be zero.

    Six real corrections sat written, stored and invisible from 2 September.
    Marizete could not see them; Dean could see them on /pickups and could not
    send them, because send_chapter_pickups scopes to `created_by = auth.uid()`
    and they are hers. Neither person could act.

    Drafts first, above the rest: they are the only group asking the person
    looking at them to do something.
  */
  const drafts = pickups.filter(p => p.status === "draft");
  const needsReview = pickups.filter(p => p.status === "returned");
  const pendingList = pickups.filter(p => p.status === "sent");
  const verifiedList = pickups.filter(p => p.status === "resolved" || p.status === "dismissed");

  /*
    ONE RENDERER FOR ALL THREE, fed a filtered map. Three copies of the chapter
    markup would be three places for the send button, the take badges, the
    fresh-link controls and the note blocks to drift apart.
  */
  function ChapterGroups({ only, remind = false }: { only: (p: EditorPickup) => boolean; remind?: boolean }) {
    const groups = new Map<string, EditorPickup[]>();
    for (const p of pickups.filter(only)) {
      const list = groups.get(p.chapter) ?? [];
      list.push(p);
      groups.set(p.chapter, list);
    }
    if (groups.size === 0) return null;
    return (
      <section className="space-y-4">
        {[...groups.entries()].map(([chapter, list]) => {
          const sendableCount = list.filter(p => isEditableBy(p, userId)).length;
          return (
            <div key={chapter} className="rounded-2xl border border-divider bg-surface p-4">
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
                        {u.filed > 0 && u.latest_filed_id && (
                          /* DOWNLOAD, not preview. She is putting this into a
                             DAW; OneDrive's preview page is three clicks from
                             the file. The missing mark rides along, and a
                             deleted take still lands on the explanation. */
                          <TakeLinks
                            className="ml-2 align-middle font-normal"
                            uploadId={u.latest_filed_id}
                            filed={u.filed}
                            missing={u.missing}
                            missingTakes={u.missing_takes}
                            label={`${u.filed} audio file${u.filed === 1 ? "" : "s"}`}
                          />
                        )}
                        {u.pending > 0 && (
                          <span className="ml-2 rounded-full border border-surface-border px-2 py-0.5 text-[11px] font-normal text-text-muted">
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
                    className="rounded-lg border border-accent-amber/50 px-3 py-1.5 text-xs font-bold text-accent-amber transition-colors hover:bg-accent-amber/10 disabled:opacity-40"
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
                showReminder={remind}
              />

              {/* ONCE, AGAINST THE CHAPTER — not repeated under every line.
                  A note about the spliced file is one fact about the chapter,
                  and five copies of it would read as five findings. */}
              <NoteBlock notes={notes.filter(n => n.link_id && n.chapter === chapter)} />

              <ul className="mt-3 space-y-2">
                {list.map(p => {
                  const editable = isEditableBy(p, userId);
                  return (
                    /* Same rule as the panel above: the text column shrinks,
                       the actions do not, and they only stack on a narrow
                       viewport. */
                    <li
                      key={p.id}
                      className="flex flex-col items-start justify-between gap-3 rounded-xl border border-divider px-3 py-2 sm:flex-row"
                    >
                      <div className="min-w-0 flex-1">
                        {p.kind === "misread" ? (
                          <CorrectionDiff
                            said={p.said}
                            shouldBe={p.should_be}
                            clamp
                            labelClass="w-20 shrink-0 text-[10px] uppercase tracking-wide text-text-muted"
                            saidClass="text-sm text-text-muted"
                            shouldBeClass="text-sm font-semibold text-text-primary"
                          />
                        ) : (
                          /* WAS `truncate` — a one-line ellipsis, which on a
                             note-only pickup cut off the instruction itself.
                             Two lines and an expand control instead. */
                          <p className="line-clamp-2 break-words text-sm text-text-primary">{summary(p, noiseTypes.get(p.id))}</p>
                        )}
                        <p className="text-[11px] text-text-muted">
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
                            className="rounded-lg bg-accent-amber px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-accent-amber-bright disabled:opacity-40"
                          >
                            Verify &amp; close
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void closePickup(p.id, "dismissed")}
                            className="text-xs text-text-body underline-offset-2 hover:text-text-primary hover:underline"
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
                                noise_type: noiseTypes.get(p.id) ?? "",
                                said: p.said ?? "",
                                should_be: p.should_be ?? "",
                                note: p.note ?? "",
                                assigned_narrator_id: p.assigned_narrator_id ?? "",
                              });
                            }}
                            className="text-xs text-text-muted hover:text-text-primary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removePickup(p.id)}
                            className="text-xs text-alert-red/70 hover:text-alert-red"
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
    );
  }

  return (
    <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6">
      {/*
        ── PROGRESS IS REFERENCE, NOT THE TASK ──────────────────────────────

        The chapter grid, the count and "Complete and mastered" used to sit at
        the TOP of the page, above the work — so the first thing she saw was a
        summary of what she had already done, and the pickups she came to work
        on started below the fold.

        It is now a column that STICKS while she works down the list. Sticky
        rather than fixed, so on a short viewport it scrolls with the page
        instead of covering it, and the whole thing reverts to a normal block
        below lg — a 288px panel beside a phone-width list would leave neither
        usable.
      */}
      <aside className="order-first mb-6 lg:sticky lg:top-20 lg:order-last lg:mb-0 lg:self-start">
    <section className="rounded-2xl border border-divider bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">Editing progress</h2>
        <span className="text-xs text-text-muted">
          {doneCount}
          {chapterKeys.length > 0 ? ` of ${chapterKeys.length}` : ""} done
          {editingCompletedAt && <span className="ml-2 text-capacity-light">· complete</span>}
        </span>
      </div>

      {progressError && (
        <p className="mt-2 text-xs text-alert-red">{progressError}</p>
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
                      ? "border-accent-amber bg-accent-amber text-black "
                      : "border-surface-border text-text-muted hover:border-surface-border hover:text-text-primary ") +
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
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-accent-amber/40 bg-accent-amber/10 px-3 py-2">
              <span className="text-xs text-accent-amber-bright">
                All {chapterKeys.length} chapters done — mark the book complete?
              </span>
              {/* THE SAME DIALOG. Filling the last chapter still only
                  prompts — it does not complete — and the prompt must lead to
                  the same confirmation as the button below, or there would be
                  a path to completion that never shows the open pickups. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingComplete(true)}
                className="rounded-lg bg-accent-amber px-3 py-1.5 text-xs font-bold text-black hover:bg-accent-amber-bright disabled:opacity-40"
              >
                Complete and mastered
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
            <label className="text-xs text-text-muted">
              Chapters edited
              <input
                inputMode="numeric"
                value={edited}
                onChange={e => setEdited(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => void saveProgress()}
                className={`${field} mt-1 w-20 text-center text-base font-semibold`}
              />
            </label>
            <span className="pt-4 text-sm text-text-muted">of —</span>
          </div>
          <p className="text-[11px] text-text-muted">
            Set the chapter count to track chapters individually.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-divider pt-3">
        <label className="text-[11px] text-text-muted">
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
        {/*
          THE BUTTON NAMES THE BUSINESS EVENT, not the database one.
          "Mark complete" is what the column is called; "complete and
          mastered" is what Dean is actually declaring, and it is the sentence
          he uses. Given the weight of a milestone rather than sitting at the
          same size as the number field beside it.
        */}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            editingCompletedAt ? void setComplete(false) : setConfirmingComplete(true)
          }
          className={
            editingCompletedAt
              ? "mt-4 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-text-body transition-colors hover:bg-surface disabled:opacity-40"
              : "mt-4 rounded-xl bg-accent-amber px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-accent-amber-bright disabled:opacity-40"
          }
        >
          {editingCompletedAt ? "Reopen" : "Complete and mastered"}
        </button>
      </div>
    </section>
      </aside>

      <div className="min-w-0 space-y-6">
      {error && (
        <p className="rounded-xl border border-alert-red/40 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-accent-amber/40 bg-accent-amber/10 px-4 py-2.5 text-sm text-accent-amber-bright">
          {notice}
        </p>
      )}

      {/* ── WAITING ON HER, ABOVE EVERYTHING ELSE ─────────────────────────
          Returned means the narrator has re-recorded and it is her turn. This
          sits above the chapter list because it is the only part of this page
          that is actionable right now, and because the email announcing it will
          often have been missed — the page she opens anyway has to carry the
          signal on its own. */}
      {/*
        THE OLD "waiting on you" PANEL IS GONE, not moved.

        It listed exactly the returned pickups that "Needs review" below now
        carries, so after the restructure the same corrections appeared twice on
        one screen — once in a gold box at the top and once in their chapter.
        Needs review keeps them, because it keeps them WITH their chapter, the
        take badge and the fresh-link controls, which the panel never had.
      */}

      {/* ── progress, as a GRID OF CHAPTERS ───────────────────────────────
          A COUNT MEANT "THE FIRST N", and that was the problem. The stepper
          could only say how many were done, never WHICH — so a chapter blocked
          on a pickup forced her to either lie about the number or leave the
          ones after it uncounted. The stored fact is a set now; the count is
          derived from it and still feeds the hub bar and the phone. */}
      {/* ── raise a pickup, COLLAPSED WHEN UNUSED ─────────────────────────
          It filled half the viewport and pushed her chapters below the fold, so
          the page opened on a form rather than on her work. */}
      {!formOpen && !editingId ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full rounded-2xl border border-dashed border-surface-border py-3 text-sm text-text-body transition-colors hover:border-accent-amber/50 hover:text-text-primary"
        >
          + Raise a pickup
        </button>
      ) : (
      <section className="rounded-2xl border border-divider bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold">{editingId ? "Edit pickup" : "Raise a pickup"}</h2>
          {!editingId && (
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-xs text-text-muted hover:text-text-body"
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
            <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">What kind?</p>
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
                        ? "border-accent-amber bg-accent-amber/15 font-semibold text-text-primary"
                        : "border-surface-border bg-surface text-text-body hover:border-surface-border",
                    ].join(" ")}
                  >
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            WHAT SORT OF NOISE — chosen, not typed.

            Only when Noise is selected, and presented the same way the kinds
            above are, because it is the same question one level down. Ann is
            being asked to re-record something: a plosive is her mouth, a bump
            is her room, sibilance is usually a de-esser. "Noise" alone makes
            her guess which.
          */}
          {draft.kind === "noise" && (
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">What sort of noise?</p>
              <div className="grid grid-cols-3 gap-2">
                {NOISE_TYPES.map(v => {
                  const on = draft.noise_type === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDraft({ ...draft, noise_type: v })}
                      className={[
                        "rounded-xl border px-2 py-2.5 text-sm transition-colors",
                        on
                          ? "border-accent-amber bg-accent-amber/15 font-semibold text-text-primary"
                          : "border-surface-border bg-surface text-text-body hover:border-surface-border",
                      ].join(" ")}
                    >
                      {noiseLabel(v)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
            className="rounded-xl bg-accent-amber px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-accent-amber-bright disabled:opacity-40"
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
              className="rounded-xl border border-surface-border px-4 py-2 text-sm text-text-body transition-colors hover:bg-surface"
            >
              Cancel
            </button>
          )}
        </div>
      </section>
      )}

      {confirmingComplete && (
        <CompleteBookDialog
          facts={completionFacts}
          busy={busy}
          onCancel={() => setConfirmingComplete(false)}
          onConfirm={() => {
            setConfirmingComplete(false);
            void setComplete(true);
          }}
        />
      )}

      {/* 0. DRAFTS — raised and not yet sent. The one group whose reader is
             the person who can clear it. */}
      {drafts.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold">
            Not sent yet
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              {drafts.length} raised, waiting to go to the narrator
            </span>
          </h2>
          <div className="rounded-2xl border border-surface-border bg-surface p-1">
            <ChapterGroups only={p => p.status === "draft"} />
          </div>
        </section>
      )}

      {/* 1. NEEDS REVIEW — the only amber on the page. */}
      {needsReview.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-accent-amber">
            Needs review
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              {needsReview.length} re-recorded, waiting on you
            </span>
          </h2>
          <div className="rounded-2xl border border-surface-border border-l-2 border-l-accent-amber bg-surface p-1">
            <ChapterGroups only={p => p.status === "returned"} />
          </div>
        </section>
      )}

      {/* 2. PENDING — out with the narrator. Neutral: waiting on somebody else
          is not a problem, and this is the largest group. */}
      {pendingList.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-text-body">
            Pending
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              {pendingList.length} out with the narrator
            </span>
          </h2>
          <ChapterGroups only={p => p.status === "sent"} remind />
        </section>
      )}

      {/* 3. ALREADY VERIFIED — history. Collapsed, and deliberately NOT
          remembered across reloads: Dean did not ask for that, and a section
          that reopens because of a choice made last week is worse than one
          that always starts shut. */}
      {verifiedList.length > 0 && (
        <details className="mb-6 rounded-2xl border border-divider bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-text-muted hover:text-text-primary">
            Already verified — {verifiedList.length} closed
          </summary>
          <div className="border-t border-divider p-1">
            <ChapterGroups only={p => p.status === "resolved" || p.status === "dismissed"} />
          </div>
        </details>
      )}
      </div>
    </div>
  );
}
