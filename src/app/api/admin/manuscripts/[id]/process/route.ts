import { NextResponse } from "next/server";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseManuscript } from "@/lib/manuscript-parser";

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

    const { chapters } = await parseManuscript(Buffer.from(bytes));
    if (!chapters.length) throw new Error("No chapters detected");

    const rows = chapters.map((ch, i) => ({
      manuscript_id: id,
      order_index: i,
      title: ch.title,
      pov_character: ch.povCharacter,
      raw_text: ch.rawText,
    }));

    const { error: insertError } = await supabaseAdmin.from("chapters").insert(rows);
    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin.from("manuscripts").update({ status: "ready" }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manuscripts/process]", msg);
    await supabaseAdmin.from("manuscripts").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
