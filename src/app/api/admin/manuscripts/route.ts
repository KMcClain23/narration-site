import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, internalAuthHeaders } from "@/lib/require-admin";

// The parse runs inside this invocation, after the response has been sent, so
// the box has to stay alive as long as the parse route itself may take.
export const maxDuration = 60;

// POST: register an uploaded manuscript and kick off background processing.
// The file itself is already sitting in R2 at `key` (see upload-url/route.ts) —
// this just creates the tracking row and fires the async parse job, same
// start → fire-and-forget process → poll pattern as the retired board-pdf-*
// pipeline (commit 79e497e~1).
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { title, author, itemId, path, format, pages_only } = await req.json();

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    // THE ITEM ID IS REQUIRED. A row with no locator is a manuscript nothing
    // can ever read, and it would sit in the list looking uploaded.
    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "Missing the uploaded file's id" }, { status: 400 });
    }
    const pagesOnly = pages_only === true && format === "pdf";

    if (format !== "pdf" && format !== "docx" && format !== "txt") {
      return NextResponse.json({ error: "format must be 'pdf', 'docx', or 'txt'" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("manuscripts")
      .insert({
        title,
        author: typeof author === "string" && author.trim() ? author.trim() : null,
        // THE ID, NOT THE PATH. Scripts/ is a folder Dean works in; a file
        // there gets renamed and moved, and an id survives both. The path is
        // recorded beside it for display only and is never resolved.
        source_item_id: itemId ?? null,
        source_path: typeof path === "string" ? path : null,
        source_format: format,
        // Skipping the parse means there is nothing to wait for: the book is
        // ready to mark up on the page as soon as it finishes uploading.
        status: pagesOnly ? "ready" : "processing",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Asked for at upload, for a book already known to extract as gibberish.
    // Parsing anyway would spend a minute and a model call producing chapters
    // nobody is going to read.
    if (pagesOnly) return NextResponse.json({ id: data.id, pagesOnly: true });

    // Kicked off with after(), not a floating promise.
    //
    // This was a bare fetch(...).catch(() => {}) followed immediately by the
    // return below. Nothing kept the invocation alive to see it through, so
    // whether the request ever left the box was a race against the platform
    // tearing the function down — one this won often enough to look correct and
    // then lost, leaving a manuscript sitting at "processing" with no parse ever
    // started and nothing in the log to say so. It is the same shape that
    // stalled the extraction chain three times.
    //
    // after() runs the callback once the response is sent and holds the
    // invocation open until it settles, which is exactly the guarantee that was
    // missing. The upload still returns immediately.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
    after(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/admin/manuscripts/${data.id}/process`, {
          method: "POST",
          // Without this the parse route rejects its own trigger, and the
          // manuscript sits at "processing" forever.
          headers: internalAuthHeaders(),
        });
        if (!res.ok) {
          console.error(`[manuscripts POST] parse trigger returned ${res.status} for ${data.id}`);
        }
      } catch (e) {
        // The cron's stuck-manuscript sweep is the backstop; log so the reason
        // is recoverable rather than inferred from a row that never moved.
        console.error(`[manuscripts POST] parse trigger failed for ${data.id}:`, e);
      }
    });

    return NextResponse.json({ id: data.id });
  } catch (e) {
    console.error("[manuscripts POST]", e);
    return NextResponse.json({ error: "Failed to create manuscript" }, { status: 500 });
  }
}
