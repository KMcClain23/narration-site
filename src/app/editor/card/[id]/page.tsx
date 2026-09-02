import Link from "next/link";
import { notFound } from "next/navigation";
import { currentSession } from "@/lib/supabase/session";
import {
  editorBoard, editorCardDetail, editorPickups, editorCardCast, editorUploads, editorNotes, editorChapterProgress,
  editorPickupBatches, editorNoiseTypes,
} from "@/lib/editor-data";
import { EditorCardClient } from "./EditorCardClient";

export const dynamic = "force-dynamic";

/**
 * One book, as she sees it.
 *
 * `card_detail_for_editor` with her session — the same treatment as the board,
 * and the same reason. No financial column is selected by the function, so none
 * can arrive here to be hidden.
 *
 * The pickups are filtered to this card AFTER reading, which is a display
 * decision and not a security one: `pickups_for_editor` is already gated, and
 * every row it returns is one she is allowed to see.
 */
export default async function EditorCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, card, board, allPickups, cast, uploads, allNotes, allProgress, allBatches, noiseTypes] =
    await Promise.all([
    currentSession(),
    editorCardDetail(id),
    // THE EDITING COLUMNS COME FROM THE BOARD FUNCTION, not the detail one.
    // card_detail_for_editor does not return chapters_edited, chapters_total or
    // editing_completed_at — board_for_editor does. Widening the detail function
    // would mean a DROP+CREATE (42P13 refuses adding a column to RETURNS TABLE),
    // which resets its ACL and comment, and the phone shares that definition. A
    // second gated read is the cheaper correctness.
    editorBoard(),
    editorPickups(),
    // THIS CARD'S cast, not the roster. card_cast raises rather than returning a
    // short list, so a book whose co_narrator has drifted fails loudly here
    // instead of quietly offering the wrong people.
    editorCardCast(id),
    editorUploads(),
    // Replies ABOUT the pickups, in either direction — distinct from
    // pickups.note, which is the raiser's correction text.
    editorNotes(),
    // The per-chapter SET. Its own read, because board_for_editor is frozen.
    editorChapterProgress(),
    // Which (chapter, narrator) pairs have ever had a link, so "send a fresh
    // link" can only ever REPLACE one. Read from pickup_links, not from
    // pickups — see pickup_batches_for_editor.
    editorPickupBatches(),
    // Its own read — pickups_for_editor is frozen by the shipped Android DTO.
    editorNoiseTypes(),
  ]);
  const progress = board.find(c => c.id === id) ?? null;

  // A card the function did not return is not visible to this account. 404 and
  // not an empty page: "there is nothing here" is the honest answer either way,
  // and it does not confirm the id exists.
  if (!card) notFound();

  return (
    <>
      <Link href="/editor" className="text-xs text-text-body hover:text-text-primary">
        ← All books
      </Link>

      <h1 className="mt-3 text-lg font-bold">{card.title}</h1>
      <p className="text-sm text-text-muted">{card.author ?? "—"}</p>

      <EditorCardClient
        card={card}
        chaptersEdited={progress?.chapters_edited ?? null}
        chaptersTotal={progress?.chapters_total ?? null}
        editingCompletedAt={progress?.editing_completed_at ?? null}
        pickups={allPickups.filter(p => p.card_id === card.id)}
        cast={cast}
        uploads={uploads.filter(u => u.card_id === id)}
        notes={allNotes.filter(n => n.card_id === id)}
        chapterProgress={allProgress.filter(c => c.card_id === id)}
        batches={allBatches.filter(b => b.card_id === id)}
        noiseTypes={noiseTypes}
        userId={session?.userId ?? null}
      />
    </>
  );
}
