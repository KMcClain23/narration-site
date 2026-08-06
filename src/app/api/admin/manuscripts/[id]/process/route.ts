import { NextResponse } from "next/server";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseManuscript } from "@/lib/manuscript-parser";
import { nextCharacterColor } from "@/lib/character-colors";

export const maxDuration = 60;

// POST: the actual parse job, fired-and-forgotten by /api/admin/manuscripts.
// Downloads the source file from R2, deletes it (it's a temp upload, not a
// permanent asset), parses chapters, writes them, and flips manuscripts.status.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: manuscript, error: fetchError } = await supabaseAdmin
    .from("manuscripts")
    .select("id, source_r2_key")
    .eq("id", id)
    .single();

  if (fetchError || !manuscript) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: manuscript.source_r2_key })
    );
    const bytes = await obj.Body!.transformToByteArray();
    r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: manuscript.source_r2_key })).catch(() => {});

    const { chapters, quality, povRoster, warnings } = await parseManuscript(Buffer.from(bytes));
    if (!chapters.length) throw new Error("No chapters detected in the document");

    // A parse can succeed structurally and still be unreadable if the source
    // PDF's text layer is corrupt. That is worth surfacing on the row rather
    // than only in the log — it looks identical to a good parse in the UI, and
    // the chapters are the thing that gets read aloud.
    //
    // Parser warnings join it: a chapter placed by arithmetic because its
    // heading could not be confirmed is exactly the kind of thing that reads
    // fine and is quietly wrong, so it belongs where someone will see it.
    const notes = [
      quality && quality.suspectRatio > 0.25
        ? `Parsed, but ${quality.suspectPages.length} of ${quality.pageRatios.filter((r) => r !== null).length} pages ` +
          `look garbled (likely a corrupt text layer needing OCR).`
        : null,
      ...(warnings ?? []),
    ].filter(Boolean);
    const qualityNote = notes.length ? notes.join(" ").slice(0, 1000) : null;

    const rows = chapters.map((ch, i) => ({
      manuscript_id: id,
      order_index: i,
      title: ch.title,
      pov_character: ch.povCharacter,
      raw_text: ch.rawText,
    }));

    const { error: insertError } = await supabaseAdmin.from("chapters").insert(rows);
    if (insertError) throw new Error(insertError.message);

    // Seed the character roster from the TOC's POV names before extraction
    // starts. These are authored by the publisher rather than inferred, so
    // they're the most reliable spellings in the book — and having them in
    // place for chapter one means the very first extraction call already knows
    // the leads, instead of the roster only becoming useful partway through.
    if (povRoster?.length) {
      const seedRows = povRoster.map((name, i) => ({
        manuscript_id: id,
        name,
        color_hex: nextCharacterColor(i),
      }));
      const { error: seedError } = await supabaseAdmin.from("characters").insert(seedRows);
      // Non-fatal: extraction creates any character it needs anyway, so a
      // failure here costs match quality on early chapters, not the parse.
      if (seedError) console.warn("[manuscripts/process] POV roster seed failed:", seedError.message);
      else console.log(`[manuscripts/process] seeded ${seedRows.length} POV characters from TOC`);
    }

    await supabaseAdmin
      .from("manuscripts")
      .update({ status: "ready", error_message: qualityNote })
      .eq("id", id);

    // Chain straight into Phase 3 — a manuscript with chapters but no
    // dialogue extraction is a confusing dead end for anyone using Prepper
    // normally (no highlighting, no reason visible why). Extraction is its
    // own resumable per-chapter chain (see extract/route.ts), so this just
    // fires the first hop; nothing here waits on it.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
    fetch(`${baseUrl}/api/admin/manuscripts/${id}/extract`, { method: "POST" }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manuscripts/process]", msg, e);
    // Persisted, not just logged: a failed row that can't say why is a dead
    // end for whoever uploaded it, and the server log isn't reachable from the
    // app. Truncated because this is display text, not a place for a stack.
    await supabaseAdmin
      .from("manuscripts")
      .update({ status: "failed", error_message: msg.slice(0, 500) })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
