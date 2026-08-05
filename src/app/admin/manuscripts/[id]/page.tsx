import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ManuscriptReader, type ChapterWithSpans } from "@/components/admin/manuscript-reader/ManuscriptReader";

// Admin data changes constantly — always read fresh, same convention as the
// contacts profile pages.
export const dynamic = "force-dynamic";

export default async function ManuscriptReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: manuscript } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status")
    .eq("id", id)
    .single();

  if (!manuscript) notFound();

  if (manuscript.status !== "ready") {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-[1200px]">
          <h1 className={adminType.titleLg}>{manuscript.title}</h1>
          <div className="mt-6 rounded-xl border border-surface-border bg-surface p-6 text-sm text-text-muted">
            {manuscript.status === "processing"
              ? "Still parsing chapters — check back once processing finishes."
              : "Chapter parsing failed for this manuscript. Check the server logs and re-run Phase 2 before extraction can proceed."}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const [{ data: chapters }, { data: characters }] = await Promise.all([
    supabaseAdmin
      .from("chapters")
      .select("id, order_index, title, pov_character, summary, raw_text")
      .eq("manuscript_id", id)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("characters")
      .select("id, name, color_hex")
      .eq("manuscript_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const chapterIds = (chapters ?? []).map((c) => c.id);
  const { data: spans } = chapterIds.length
    ? await supabaseAdmin
        .from("dialogue_spans")
        .select("chapter_id, character_id, start_offset, end_offset, matched")
        .in("chapter_id", chapterIds)
    : { data: [] };

  const spansByChapter = new Map<string, ChapterWithSpans["spans"]>();
  (spans ?? []).forEach((s) => {
    const list = spansByChapter.get(s.chapter_id) ?? [];
    list.push({
      character_id: s.character_id,
      start_offset: s.start_offset,
      end_offset: s.end_offset,
      matched: s.matched,
    });
    spansByChapter.set(s.chapter_id, list);
  });

  const chaptersWithSpans: ChapterWithSpans[] = (chapters ?? []).map((ch) => ({
    id: ch.id,
    order_index: ch.order_index,
    title: ch.title,
    pov_character: ch.pov_character,
    summary: ch.summary,
    raw_text: ch.raw_text,
    spans: spansByChapter.get(ch.id) ?? [],
  }));

  return (
    <AdminLayout>
      {/* A dedicated light "page" for the reading surface itself — long-form
          prose on the admin shell's dark navy is hard on the eyes over a
          real reading session, so this floats a paper-toned page on the
          dark chrome rather than reusing the dark admin tokens. */}
      <div className="mx-auto max-w-[820px] rounded-2xl bg-[#f1eee3] p-8 shadow-2xl sm:p-12">
        <ManuscriptReader
          manuscriptId={manuscript.id}
          title={manuscript.title}
          author={manuscript.author}
          characters={characters ?? []}
          chapters={chaptersWithSpans}
        />
      </div>
    </AdminLayout>
  );
}
