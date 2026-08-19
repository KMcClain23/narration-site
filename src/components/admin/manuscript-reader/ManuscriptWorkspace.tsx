"use client";

import { useMarkupMode, setMarkupMode } from "./useMarkupMode";
import { ManuscriptReader, type ChapterWithSpans } from "./ManuscriptReader";
import { PageHighlighter, type PageHighlight } from "./PageHighlighter";
import type { CharacterLite } from "./ParagraphText";

/**
 * The two ways to mark up a book, and the choice between them.
 *
 * Text is the better one when the text is good: dialogue is matched
 * automatically, corrections are a selection away, and the result carries into
 * the prep PDF. It needs a trustworthy text layer, which a print PDF typeset
 * with subsetted fonts does not have — the glyphs draw correctly and extract
 * as gibberish, so names come out mangled and nothing matches.
 *
 * Pages is the fallback for exactly that case. Nothing is read from the file
 * except the picture of each page, so a broken text layer cannot spoil it.
 */
export function ManuscriptWorkspace({
  manuscriptId,
  title,
  author,
  characters,
  chapters,
  hasPdf,
  initialHighlights,
}: {
  manuscriptId: string;
  title: string;
  author: string | null;
  characters: CharacterLite[];
  chapters: ChapterWithSpans[];
  hasPdf: boolean;
  initialHighlights: PageHighlight[];
}) {
  // Text unless there is nothing readable to fall back on. Beyond that the
  // choice is deliberate and per book, so it is remembered: a manuscript whose
  // text extracts as gibberish should not reopen in the view that cannot show
  // it, every time.
  const fallback = hasPdf && chapters.length === 0 ? "pages" : "text";
  const mode = useMarkupMode(manuscriptId, fallback);
  const setMode = (m: "text" | "pages") => setMarkupMode(manuscriptId, m);

  return (
    <>
      {hasPdf && (
        <div className="mb-6 flex gap-1 border-b border-black/10 pb-3">
          {(["text", "pages"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                mode === m ? "bg-black/10 font-medium text-[#1a1a1a]" : "text-[#1a1a1a]/50 hover:text-[#1a1a1a]"
              }`}
            >
              {m === "text" ? "Text" : "Pages"}
            </button>
          ))}
          <span className="ml-auto self-center text-[12px] text-[#1a1a1a]/50">
            {mode === "text"
              ? "Select dialogue to assign it"
              : "Drag across a line to mark it"}
          </span>
        </div>
      )}

      {mode === "text" ? (
        <ManuscriptReader
          manuscriptId={manuscriptId}
          title={title}
          author={author}
          characters={characters}
          chapters={chapters}
        />
      ) : (
        <PageHighlighter
          manuscriptId={manuscriptId}
          characters={characters}
          initialHighlights={initialHighlights}
          pdfUrl={`/api/admin/manuscripts/${manuscriptId}/file`}
        />
      )}
    </>
  );
}
