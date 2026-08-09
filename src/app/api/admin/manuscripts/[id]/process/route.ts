import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseManuscript, PARSE_BUDGET_MS, toStorableText } from "@/lib/manuscript-parser";
import { nextCharacterColor } from "@/lib/character-colors";

export const maxDuration = 60;

/**
 * A parse that outruns this is abandoned so the row can be marked failed.
 *
 * The failure this exists for is not a slow parse — it is a silent one. When a
 * parse runs past maxDuration the platform kills the invocation outright, and
 * none of the code below ever runs: no catch, no status write, no error
 * message. The manuscript stays at "processing" indefinitely, and from the UI
 * there is no way to tell that apart from a parse still in progress. Every
 * report of an upload "stuck in parsing" is this.
 *
 * So the work is raced against a deadline comfortably inside maxDuration,
 * leaving room to write the failure and respond. The parser also enforces its
 * own budget between stages (PARSE_BUDGET_MS) and names the stage it stopped
 * at, which is the more useful error of the two — this is the backstop for a
 * stage that hangs internally and never returns to be checked.
 */
const PARSE_DEADLINE_MS = PARSE_BUDGET_MS + 5_000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Parsing timed out after ${Math.round(ms / 1000)}s and was abandoned. ` +
              `Check the function log for the last "[parser …]" stage line — that names ` +
              `the step that did not finish.`
          )
        ),
      ms
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

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

    const started = Date.now();
    console.log(`[manuscripts/process] ${id} — parsing ${bytes.length} bytes`);
    const { chapters, quality, povRoster, warnings } = await withDeadline(
      parseManuscript(Buffer.from(bytes)),
      PARSE_DEADLINE_MS
    );
    console.log(
      `[manuscripts/process] ${id} — parsed ${chapters.length} chapters in ${Date.now() - started}ms`
    );
    if (!chapters.length) throw new Error("No chapters detected in the document");

    // A parse can succeed structurally and still be unreadable if the source
    // PDF's text layer is corrupt. That is worth surfacing on the row rather
    // than only in the log — it looks identical to a good parse in the UI, and
    // the chapters are the thing that gets read aloud.
    //
    // Parser warnings join it: a chapter placed by arithmetic because its
    // heading could not be confirmed is exactly the kind of thing that reads
    // fine and is quietly wrong, so it belongs where someone will see it.
    // Any garbled page is worth naming, not just a quarter of them. The
    // threshold used to be 25%, which is above where real damage starts:
    // "Devils of Seattle" measured 11.5% and said nothing, while the pages it
    // had already identified were unreadable prose that would have gone
    // straight into a recording script. A minority of bad pages is harder to
    // notice than a majority, not easier.
    const judgeable = quality?.pageRatios.filter((r) => r !== null).length ?? 0;
    const notes = [
      quality && quality.suspectPages.length > 0
        ? `Parsed, but ${quality.suspectPages.length} of ${judgeable} pages look garbled ` +
          `(likely a corrupt text layer needing OCR)` +
          (quality.suspectRatio > 0.25 ? "." : `: ${quality.suspectPages.slice(0, 12).join(", ")}` +
            (quality.suspectPages.length > 12 ? ` and ${quality.suspectPages.length - 12} more.` : "."))
        : null,
      ...(warnings ?? []),
    ].filter(Boolean);
    const qualityNote = notes.length ? notes.join(" ").slice(0, 1000) : null;

    const rows = chapters.map((ch, i) => ({
      manuscript_id: id,
      order_index: i,
      title: toStorableText(ch.title),
      pov_character: ch.povCharacter ? toStorableText(ch.povCharacter) : ch.povCharacter,
      raw_text: toStorableText(ch.rawText),
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

    // The source is kept, not deleted.
    //
    // It used to be deleted the moment its bytes were read, before parsing even
    // began. That made every parse a one-shot: a failure destroyed its own
    // evidence, and a parse that succeeded but produced wrong boundaries could
    // not be re-run against a fixed parser without a fresh upload by hand.
    // Both have cost real time — a book had to be re-uploaded to answer "why
    // was the table of contents rejected", and the answer was lost again the
    // moment the next parse succeeded.
    //
    // A manuscript PDF is a couple of megabytes and there are a handful of
    // them. Keeping it until the manuscript itself is deleted (see the DELETE
    // handler, which now removes it) is far cheaper than the alternative.

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
