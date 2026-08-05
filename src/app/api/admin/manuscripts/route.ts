import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// POST: register an uploaded manuscript and kick off background processing.
// The file itself is already sitting in R2 at `key` (see upload-url/route.ts) —
// this just creates the tracking row and fires the async parse job, same
// start → fire-and-forget process → poll pattern as the retired board-pdf-*
// pipeline (commit 79e497e~1).
export async function POST(req: Request) {
  try {
    const { title, author, key, format } = await req.json();

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }
    if (format !== "pdf" && format !== "docx") {
      return NextResponse.json({ error: "format must be 'pdf' or 'docx'" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("manuscripts")
      .insert({
        title,
        author: typeof author === "string" && author.trim() ? author.trim() : null,
        source_r2_key: key,
        source_format: format,
        status: "processing",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
    fetch(`${baseUrl}/api/admin/manuscripts/${data.id}/process`, { method: "POST" }).catch(() => {});

    return NextResponse.json({ id: data.id });
  } catch (e) {
    console.error("[manuscripts POST]", e);
    return NextResponse.json({ error: "Failed to create manuscript" }, { status: 500 });
  }
}
