import "server-only";

import { userScopedClient } from "@/lib/supabase/session";

/**
 * Every read the editor surface makes, in one place, and all of them through
 * HER JWT.
 *
 * W2a IS THE WHOLE POINT: these call `userScopedClient()`, never `supabaseAdmin`.
 * The gates are what enforce the boundary and a gate only sees a caller when a
 * caller is passed — `assert_board_access` literally returns early for
 * service_role. A page that read as service_role and filtered in React would
 * enforce nothing while looking identical on screen, and the first sign of it
 * would be a financial figure in a payload.
 *
 * THERE IS NO FINANCIAL FILTERING HERE, deliberately. `board_for_editor` does not
 * return pfh_rate, payment_type or narrator_share_percent at all, so there is
 * nothing to strip. If one ever appears in a payload the FUNCTION is wrong;
 * hiding it here would turn a broken boundary into a cosmetic one and delete the
 * only evidence.
 */

/** Exactly the columns board_for_editor returns. No money, by construction. */
export type EditorCard = {
  id: string;
  title: string;
  author: string | null;
  co_narrator: string | null;
  cover_url: string | null;
  status: string;
  deadline: string | null;
  first15_due: string | null;
  first_15_complete: boolean | null;
  is_confidential: boolean | null;
  narration_format: string | null;
  recording_dates: unknown;
  words_recorded: number | null;
  word_count: number | null;
  total_pages: number | null;
  current_page: number | null;
  chapters_edited: number | null;
  chapters_total: number | null;
  editing_completed_at: string | null;
  created_at: string | null;

  /**
   * WHOSE BOOK IT IS, or null for unclaimed — and it is null far more often than
   * not. `status = editing` was standing in for this and meant something else
   * entirely: eight books were in editing, she had ever worked on two, and the
   * hub billed all eight as hers with overdue alarms on six deadlines that were
   * never her commitment.
   *
   * ── NOT A COLUMN OF board_for_editor, AND THAT COST A ROUND TRIP TO LEARN ──
   *
   * It was added to that function's return type first, which is the obvious
   * place for it. The Android app calls the same function, decodes it through
   * KotlinXSerializer()'s default Json, and that has ignoreUnknownKeys = false —
   * so an extra key does not widen the phone's board, it throws and EMPTIES it.
   * versionCode 49 is on Play and cannot be corrected after the fact, and the
   * editor's only screen in that app is the board.
   *
   * So it comes from `editor_assignments()`, a second function the website alone
   * calls, and `editorBoard` merges the two. A NEW FUNCTION IS ADDITIVE TO EVERY
   * CLIENT THAT DOES NOT CALL IT; a new column is not.
   */
  editor_id: string | null;
  /** Display name of the holder, for "claimed by X". Null when unclaimed. */
  editor_name: string | null;
};

/** One row of editor_assignments(). Only CLAIMED cards appear. */
export type EditorAssignment = {
  card_id: string;
  editor_id: string;
  editor_name: string;
};

/**
 * One entry in a card's chapters array.
 *
 * `number` IS NULLABLE and that is not an edge case: front matter — Prologue,
 * Dedication, Trigger Warnings, Epilogue, Acknowledgements — carries a title and
 * no number, and eleven such titles exist across the live cards. A picker that
 * assumes a number silently drops them.
 */
export type ChapterEntry = {
  title: string | null;
  number: number | null;
  pages?: number | null;
  status?: string | null;
  wordCount?: number | null;
};

export type EditorCardDetail = {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  co_narrator: string | null;
  cover_url: string | null;
  status: string;
  deadline: string | null;
  first15_due: string | null;
  first_15_complete: boolean | null;
  word_count: number | null;
  words_recorded: number | null;
  narration_format: string | null;
  is_confidential: boolean | null;
  recording_dates: unknown;
  description: string | null;
  tags: string[] | null;
  trigger_warnings: string[] | null;
  chapters: ChapterEntry[] | null;
  released_at: string | null;
  created_at: string | null;
  total_pages: number | null;
  current_page: number | null;
};

export type EditorPickup = {
  id: string;
  card_id: string;
  chapter: string;
  timestamp_at: string;
  kind: string;
  said: string | null;
  should_be: string | null;
  note: string | null;
  assigned_narrator_id: string | null;
  assigned_narrator_name: string | null;
  status: string;
  manifest_path: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  sent_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

/**
 * One narrator ON A GIVEN BOOK. Not the roster — the cast.
 *
 * `narrators_for_editor` returns all 19 people, which is a directory. Offering
 * that as the assignee list for a two-hander is how a pickup reaches someone who
 * never read the chapter.
 */
export type CastMember = {
  narrator_id: string;
  display_name: string;
  /**
   * The narrator whose book it is — NOT the viewer.
   *
   * card_cast never reads auth.uid(), so this cannot mean "you". It was called
   * is_self and the picker duly rendered "you" beside Dean's name to Marizete.
   * Do not render it in the second person.
   */
  is_owner: boolean;
};

/**
 * A refusal must reach the caller as a refusal.
 *
 * The gates raise 42501 with a marker rather than returning zero rows, precisely
 * so "you are not allowed" cannot be read as "there is nothing here". Throwing
 * here keeps that distinction all the way to the page instead of rendering an
 * empty board to someone who was refused.
 */
function unwrap<T>(data: T | null, error: { message: string } | null, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  return (data ?? []) as T;
}

/**
 * The board, with the assignment merged in.
 *
 * Two calls, because the phone shares the first one and cannot survive a new
 * column in it — see the note on EditorCard.editor_id. They are issued together;
 * the second is tiny (only claimed cards come back) and this is one render.
 *
 * A CARD WITH NO ASSIGNMENT ROW IS UNCLAIMED, explicitly. `editor_assignments`
 * returns nothing for unclaimed books rather than a row of nulls, so absence is
 * the representation and `?? null` below is where it is turned into a value.
 */
export async function editorBoard(): Promise<EditorCard[]> {
  const db = await userScopedClient();
  const [board, assigned] = await Promise.all([
    db.rpc("board_for_editor"),
    db.rpc("editor_assignments"),
  ]);
  const cards = unwrap<Omit<EditorCard, "editor_id" | "editor_name">[]>(
    board.data as Omit<EditorCard, "editor_id" | "editor_name">[],
    board.error,
    "board_for_editor",
  );
  const rows = unwrap<EditorAssignment[]>(
    assigned.data as EditorAssignment[],
    assigned.error,
    "editor_assignments",
  );
  const by = new Map(rows.map(r => [r.card_id, r]));
  return cards.map(c => ({
    ...c,
    editor_id: by.get(c.id)?.editor_id ?? null,
    editor_name: by.get(c.id)?.editor_name ?? null,
  }));
}

export async function editorCardDetail(id: string): Promise<EditorCardDetail | null> {
  const db = await userScopedClient();
  const { data, error } = await db.rpc("card_detail_for_editor", { p_id: id });
  const rows = unwrap<EditorCardDetail[]>(data as EditorCardDetail[], error, "card_detail_for_editor");
  return rows[0] ?? null;
}

export async function editorPickups(): Promise<EditorPickup[]> {
  const db = await userScopedClient();
  const { data, error } = await db.rpc("pickups_for_editor");
  return unwrap<EditorPickup[]>(data as EditorPickup[], error, "pickups_for_editor");
}

/**
 * The cast of one book: Dean first, then this card's co-narrators.
 *
 * `card_cast` RAISES rather than returning a short list — an unparseable
 * co_narrator or a name with no narrators row stops the page. `unwrap` turns
 * that into a thrown error here, deliberately: a cast quietly missing somebody
 * looks exactly like a book they are not on.
 */
export async function editorCardCast(cardId: string): Promise<CastMember[]> {
  const db = await userScopedClient();
  const { data, error } = await db.rpc("card_cast", { p_card_id: cardId });
  return unwrap<CastMember[]>(data as CastMember[], error, "card_cast");
}

/**
 * Editing state, DERIVED and never stored — the same rule the phone follows.
 *
 * There is no editing_status column on purpose: a stored status and a chapter
 * count can disagree, and "done" beside 4 of 12 is a row that cannot be true and
 * would still render. One fact, so there is nothing to contradict.
 */
export type EditingState = "not_started" | "in_progress" | "done";

export function editingStateOf(
  chaptersEdited: number | null,
  editingCompletedAt: string | null,
): EditingState {
  if (editingCompletedAt) return "done";
  return (chaptersEdited ?? 0) > 0 ? "in_progress" : "not_started";
}

export const EDITING_LABEL: Record<EditingState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/**
 * Narrator audio, per (card, chapter).
 *
 * FILED and PENDING are kept apart on purpose. Filed is in the book's folder and
 * can be played; pending is still in quarantine under a uuid name and cannot be
 * found yet. One combined number would tell her audio is ready when it is not —
 * the same reason the "filed" email fires on filed_at rather than on upload.
 *
 * FILED STILL DOES NOT MEAN STILL THERE. filed_at records that the file was
 * placed in the folder; nothing re-checks, and the one real row in the table
 * points at a file Dean has since deleted. That is why the badge links to a
 * resolving endpoint rather than to a path — see /api/pickups/file/[id].
 */
export type UploadCount = {
  card_id: string;
  chapter: string;
  /** Whose take it is. "1 audio file" never said, and a take belongs to somebody. */
  narrator_name: string;
  filed: number;
  pending: number;
  /**
   * The most recent FILED upload, for the link.
   *
   * Null when nothing in this group has been filed yet — which is exactly when
   * there is nothing to open, so the badge must not offer a link.
   */
  latest_filed_id: string | null;
};

export async function editorUploads(): Promise<UploadCount[]> {
  const db = await userScopedClient();
  const { data, error } = await db.rpc("uploads_for_editor");
  return unwrap<UploadCount[]>(data as UploadCount[], error, "uploads_for_editor");
}
