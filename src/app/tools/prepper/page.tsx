import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PrepperClient, type ManuscriptRow } from "@/components/admin/prepper/PrepperClient";
import { countNumberedChapters } from "@/lib/unnumbered-sections";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly — always read fresh, same convention as the
// other /tools pages.
export const dynamic = "force-dynamic";

function countWords(text: string | null): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Pushes a manuscript's total word count onto its matching Board card when
 * the card doesn't have one yet — matched by title the same way the author
 * profile page matches board_cards to authors (no FK between the two
 * tables, so exact-match first, trimmed/lowercased fallback). Runs on every
 * Prepper page load; harmless to repeat since it only ever writes when
 * word_count is genuinely missing, so it self-converges to a no-op per book
 * after the first successful sync.
 */
async function syncMissingWordCountsToBoard(
  manuscripts: { id: string; title: string; status: string }[],
  wordCountByManuscript: Map<string, number>
) {
  const ready = manuscripts.filter((m) => m.status === "ready" && (wordCountByManuscript.get(m.id) ?? 0) > 0);
  if (!ready.length) return;

  const { data: boardCards } = await supabaseAdmin.from("board_cards").select("id, title, word_count");
  if (!boardCards?.length) return;

  const updates = ready.flatMap((m) => {
    const target = m.title.trim().toLowerCase();
    const match = boardCards.find((b) => b.title?.trim().toLowerCase() === target);
    if (!match || match.word_count) return [];
    return [supabaseAdmin.from("board_cards").update({ word_count: wordCountByManuscript.get(m.id) }).eq("id", match.id)];
  });

  if (updates.length) await Promise.all(updates);
}

export default async function PrepperPage() {
  await assertAdmin();
  const { data: manuscripts } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status, source_format, error_message, created_at")
    .order("created_at", { ascending: false });

  const manuscriptIds = (manuscripts ?? []).map((m) => m.id);
  const { data: chapterRows } = manuscriptIds.length
    ? await supabaseAdmin
        .from("chapters")
        .select("manuscript_id, order_index, title, summary, raw_text, extraction_error")
        .in("manuscript_id", manuscriptIds)
        .order("manuscript_id", { ascending: true })
        .order("order_index", { ascending: true })
    : { data: [] };

  // Numbered chapters and front/back matter are counted apart. Every section
  // is a chapters row, but "41 chapters" for a book with 39 of them matches
  // neither the spine nor the reader's own chapter list.
  //
  // Titles are gathered per book in reading order rather than tallied as they
  // arrive, because front matter is identified partly by what precedes the
  // first labeled chapter — a per-row test cannot see that.
  const titlesByManuscript = new Map<string, Array<string | null>>();
  const extractedCountByManuscript = new Map<string, number>();
  const wordCountByManuscript = new Map<string, number>();
  // Chapters that failed extraction. The column existed only in the database
  // until now, so a book could finish with silently unextracted chapters and
  // the only way to find out was to go and query for it.
  const failedCountByManuscript = new Map<string, number>();
  (chapterRows ?? []).forEach((c) => {
    const titles = titlesByManuscript.get(c.manuscript_id) ?? [];
    titles.push(c.title);
    titlesByManuscript.set(c.manuscript_id, titles);
    if (c.summary !== null) {
      extractedCountByManuscript.set(c.manuscript_id, (extractedCountByManuscript.get(c.manuscript_id) ?? 0) + 1);
    }
    if (c.extraction_error !== null) {
      failedCountByManuscript.set(c.manuscript_id, (failedCountByManuscript.get(c.manuscript_id) ?? 0) + 1);
    }
    wordCountByManuscript.set(c.manuscript_id, (wordCountByManuscript.get(c.manuscript_id) ?? 0) + countWords(c.raw_text));
  });

  const chapterCountByManuscript = new Map<string, number>();
  const sectionCountByManuscript = new Map<string, number>();
  titlesByManuscript.forEach((titles, manuscriptId) => {
    const numbered = countNumberedChapters(titles);
    chapterCountByManuscript.set(manuscriptId, numbered);
    sectionCountByManuscript.set(manuscriptId, titles.length - numbered);
  });

  if (manuscripts?.length) {
    await syncMissingWordCountsToBoard(manuscripts, wordCountByManuscript);
  }

  const rows: ManuscriptRow[] = (manuscripts ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    author: m.author,
    status: m.status as ManuscriptRow["status"],
    source_format: m.source_format as ManuscriptRow["source_format"],
    error_message: m.error_message ?? null,
    created_at: m.created_at,
    chapterCount: chapterCountByManuscript.get(m.id) ?? 0,
    sectionCount: sectionCountByManuscript.get(m.id) ?? 0,
    chaptersExtracted: extractedCountByManuscript.get(m.id) ?? 0,
    chaptersFailed: failedCountByManuscript.get(m.id) ?? 0,
    wordCount: wordCountByManuscript.get(m.id) ?? 0,
  }));

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1000px]">
        <PrepperClient initialManuscripts={rows} />
      </div>
    </AdminLayout>
  );
}
