import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createUploadSession, graphAppToken } from "@/lib/pickup-graph";
import { sanitiseSegment } from "@/lib/pickup-paths";

/**
 * Where a manuscript upload goes. OneDrive's Scripts/, not R2.
 *
 * ── WHY THIS CHANGED ───────────────────────────────────────────────────────
 *
 * It minted a presigned PUT into R2_BUCKETS.media — the bucket that serves
 * book covers and branding, and which has R2_MEDIA_PUBLIC_BASE_URL configured.
 * An uncredentialed GET on that base URL returned 206 and the real PDF bytes;
 * it was measured before the existing objects were removed. Every manuscript
 * uploaded through here was readable by anyone who had the key, and the proxy
 * that "kept the bucket private" only ever hid the key.
 *
 * Deleting those objects without changing this route would have closed the hole
 * until the next upload.
 *
 * ── AND WHY AN UPLOAD SESSION, NOT A SERVER FORWARD ────────────────────────
 *
 * Manuscripts run to 18 MB and Vercel caps a serverless request body far below
 * that, so the bytes must not pass through this app. A Graph upload session is
 * the same shape as a presigned PUT — bound to ONE path, short-lived, write-only
 * — and it is the machinery the narrator's audio upload already uses for files
 * up to 200 MB. Reusing it is one mechanism rather than two.
 *
 * ── THE NAME IS THE BOOK ───────────────────────────────────────────────────
 *
 * Scripts/ is flat with one file per book, and the link to a card is made by
 * matching the FILENAME to a card title. So the destination is named from the
 * title the uploader gave, not from whatever the file on their disk is called —
 * "manuscript-final-v3.pdf" would be unlinkable forever.
 */

const ALLOWED_TYPES: Record<string, "pdf" | "docx" | "txt"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { filename, contentType, title } = await req.json();

    // Browsers are inconsistent about the MIME type they report for .txt —
    // some send text/plain, others fall back to application/octet-stream or an
    // empty string. Content type alone would reject perfectly valid files, so
    // a .txt extension is accepted as its own signal. PDF and DOCX still go by
    // content type, which browsers report reliably for both.
    const format =
      ALLOWED_TYPES[contentType] ??
      (typeof filename === "string" && filename.toLowerCase().endsWith(".txt") ? "txt" : undefined);
    if (!format) {
      return NextResponse.json({ error: "Only PDF, DOCX, or TXT files are allowed" }, { status: 400 });
    }
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    // The book's title decides the name, because the title is what links it to
    // a card later. Falling back to the file's own name keeps an upload with no
    // title from failing outright, but it will need linking by hand.
    const base =
      typeof title === "string" && title.trim()
        ? sanitiseSegment(title.trim())
        : sanitiseSegment(filename.replace(/\.[^.]+$/, "")) || "manuscript";
    const path = `Scripts/${base}.${format}`;

    const token = await graphAppToken();
    // REPLACE: a re-upload is a corrected draft of the same book, and a
    // "Book (1).pdf" beside it would break the one-file-per-book convention
    // that the whole Scripts/ folder and its card matching rest on.
    const uploadUrl = await createUploadSession(token, path, "replace");

    return NextResponse.json({ uploadUrl, path, format });
  } catch (e) {
    console.error("[manuscripts/upload-url]", e);
    return NextResponse.json({ error: "Failed to start the upload" }, { status: 500 });
  }
}
