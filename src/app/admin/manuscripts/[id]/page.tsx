import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ChapterWithSpans } from "@/components/admin/manuscript-reader/ManuscriptReader";
import { ManuscriptWorkspace } from "@/components/admin/manuscript-reader/ManuscriptWorkspace";
import type { PageHighlight } from "@/components/admin/manuscript-reader/PageHighlighter";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly — always read fresh, same convention as the
// contacts profile pages.
export const dynamic = "force-dynamic";

/**
 * Every dialogue span for a manuscript, fetched in pages.
 *
 * PostgREST caps a response at a fixed number of rows — a thousand by default
 * — and returns the first page silently rather than erroring. A single
 * unbounded select therefore looked correct on a book with fewer spans than
 * the cap and quietly dropped most of them on a longer one: two of three books
 * here are over it. With no ordering imposed, the surviving rows arrived in
 * arbitrary order, so highlighting vanished from nearly every chapter while
 * the data itself was perfectly intact.
 *
 * Ordered by id purely so the pages tile without gaps or repeats.
 */
async function fetchAllSpans(chapterIds: string[]) {
  const PAGE_SIZE = 1000;
  type SpanRow = {
    id: string;
    chapter_id: string;
    character_id: string | null;
    start_offset: number;
    end_offset: number;
    matched: boolean;
  };

  const all: SpanRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("dialogue_spans")
      .select("id, chapter_id, character_id, start_offset, end_offset, matched")
      .in("chapter_id", chapterIds)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[manuscript-reader] failed to load dialogue spans:", error.message);
      break;
    }
    if (!data?.length) break;
    all.push(...(data as SpanRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export default async function ManuscriptReaderPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();
  const { id } = await params;

  const { data: manuscript } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status, source_format")
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
      .select("id, name, color_hex, voice_sample_url")
      .eq("manuscript_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const chapterIds = (chapters ?? []).map((c) => c.id);
  const spans = chapterIds.length ? await fetchAllSpans(chapterIds) : [];

  const spansByChapter = new Map<string, ChapterWithSpans["spans"]>();
  spans.forEach((s) => {
    const list = spansByChapter.get(s.chapter_id) ?? [];
    list.push({
      id: s.id,
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

  // Only for PDFs: the page view has nothing to render for a .docx or .txt.
  const hasPdf = manuscript.source_format === "pdf";
  const { data: pageHighlights } = hasPdf
    ? await supabaseAdmin
        .from("page_highlights")
        .select("id, character_id, page, x, y, w, h, note")
        .eq("manuscript_id", id)
    : { data: [] };

  return (
    <AdminLayout>
      {/* A dedicated light "page" for the reading surface itself — long-form
          prose on the admin shell's dark navy is hard on the eyes over a
          real reading session, so this floats a paper-toned page on the
          dark chrome rather than reusing the dark admin tokens. */}
      <div className="mx-auto max-w-[820px] rounded-2xl bg-[#f1eee3] p-8 shadow-2xl sm:p-12">
        <ManuscriptWorkspace
          manuscriptId={manuscript.id}
          title={manuscript.title}
          author={manuscript.author}
          characters={characters ?? []}
          chapters={chaptersWithSpans}
          hasPdf={hasPdf}
          initialHighlights={((pageHighlights ?? []) as PageHighlight[]).map(h => ({
            ...h,
            x: Number(h.x), y: Number(h.y), w: Number(h.w), h: Number(h.h),
          }))}
        />
      </div>
    </AdminLayout>
  );
}
