import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractChapter } from "@/lib/dialogue-extractor";
import { nextCharacterColor } from "@/lib/character-colors";

export const maxDuration = 60;

// POST: processes exactly one chapter — whichever has the lowest order_index
// among chapters for this manuscript with summary IS NULL — then fires
// itself again (fire-and-forget) for the next one. Deliberately stateless
// between calls: "next chapter to do" is always derived from summary IS
// NULL, and the rolling character list is always derived from the
// characters table, so a failed or interrupted chain resumes cleanly from
// wherever it left off on the next call, no separate job/progress row needed.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // "Not yet done" is summary IS NULL *and* no recorded failure. Without the
  // second condition a chapter that fails extraction is selected again on
  // every subsequent call, and the chain spins on it indefinitely instead of
  // moving on to the chapters after it.
  const { data: chapter, error: chapterError } = await supabaseAdmin
    .from("chapters")
    .select("id, order_index, raw_text")
    .eq("manuscript_id", id)
    .is("summary", null)
    .is("extraction_error", null)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (chapterError) return NextResponse.json({ error: chapterError.message }, { status: 500 });
  if (!chapter) return NextResponse.json({ done: true });

  try {
    const { data: existingCharacters, error: charFetchError } = await supabaseAdmin
      .from("characters")
      .select("id, name")
      .eq("manuscript_id", id);
    if (charFetchError) throw new Error(charFetchError.message);

    const characterMap = new Map<string, string>();
    (existingCharacters ?? []).forEach((c) => characterMap.set(c.name, c.id));
    let colorCount = characterMap.size;

    const result = chapter.raw_text?.trim()
      ? await extractChapter(chapter.raw_text, Array.from(characterMap.keys()))
      : { characters: [], summary: "(no extractable text)", dialogueSpans: [] };

    // Every name Claude surfaced — whether via "characters" or only as a
    // dialogue speaker — gets a roster row, matched or not: Phase 5's
    // correction UI needs the character to already exist to reassign an
    // unmatched span to it.
    const allNames = new Set<string>(result.characters);
    result.dialogueSpans.forEach((d) => allNames.add(d.speaker));

    for (const name of allNames) {
      if (!name || characterMap.has(name)) continue;
      const { data: created, error: createError } = await supabaseAdmin
        .from("characters")
        .insert({ manuscript_id: id, name, color_hex: nextCharacterColor(colorCount) })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      characterMap.set(name, created.id);
      colorCount++;
    }

    if (result.dialogueSpans.length) {
      const spanRows = result.dialogueSpans.map((d) => ({
        chapter_id: chapter.id,
        character_id: d.matched ? (characterMap.get(d.speaker) ?? null) : null,
        start_offset: d.start,
        end_offset: d.end,
        matched: d.matched,
        // Stored for every span, not just unmatched ones — cheap audit trail:
        // what Claude actually said vs. where it landed, without re-running
        // extraction to find out if a highlight ever looks wrong later.
        extracted_text: d.text,
      }));
      const { error: spanError } = await supabaseAdmin.from("dialogue_spans").insert(spanRows);
      if (spanError) throw new Error(spanError.message);
    }

    const { error: summaryError } = await supabaseAdmin
      .from("chapters")
      .update({ summary: result.summary })
      .eq("id", chapter.id);
    if (summaryError) throw new Error(summaryError.message);

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
    fetch(`${baseUrl}/api/admin/manuscripts/${id}/extract`, { method: "POST" }).catch(() => {});

    return NextResponse.json({
      done: false,
      chapterId: chapter.id,
      orderIndex: chapter.order_index,
      charactersKnown: characterMap.size,
      dialogueMatched: result.dialogueSpans.filter((d) => d.matched).length,
      dialogueUnmatched: result.dialogueSpans.filter((d) => !d.matched).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manuscripts/extract]", msg);

    // Record the failure against this chapter and carry on with the next one.
    // Previously the "fire the next chapter" call lived only on the success
    // path, so a single bad chapter halted extraction for the entire book and
    // every chapter after it stayed unprocessed with nothing explaining why.
    await supabaseAdmin
      .from("chapters")
      .update({ extraction_error: msg.slice(0, 500) })
      .eq("id", chapter.id);

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
    fetch(`${baseUrl}/api/admin/manuscripts/${id}/extract`, { method: "POST" }).catch(() => {});

    // Deliberately does NOT flip manuscripts.status to "failed" — unlike
    // Phase 2's parse (where a failure means zero chapters exist and the
    // reader has nothing to show), an extraction failure here is scoped to
    // one chapter and the design is already resumable (this chapter's
    // summary just stays null, picked up again on the next /extract call).
    // Phase 4 gates the whole reader on manuscripts.status !== "ready", so
    // setting "failed" here would hide every already-extracted chapter over
    // one transient error (e.g. a truncated Claude response) — worse than
    // just leaving this one chapter unextracted.
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
