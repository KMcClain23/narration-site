import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Rewrites every demo's file_url so its base matches R2_DEMOS_PUBLIC_BASE_URL.
// Keeps the path component (key) intact — only the hostname is changed.
export async function POST() {
  const correctBase = process.env.R2_DEMOS_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!correctBase) {
    return NextResponse.json(
      { error: "R2_DEMOS_PUBLIC_BASE_URL is not set" },
      { status: 500 },
    );
  }

  const { data: demos, error: fetchErr } = await supabaseAdmin
    .from("demos")
    .select("id, file_url");

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let fixed = 0;
  const errors: string[] = [];

  for (const demo of demos ?? []) {
    if (!demo.file_url) continue;

    // Already using the correct base — nothing to do
    if (demo.file_url.startsWith(correctBase)) continue;

    try {
      // Extract just the path (/demos/file.mp3 or /file.mp3)
      const pathname = new URL(demo.file_url).pathname;
      const newUrl   = `${correctBase}${pathname}`;

      const { error: updateErr } = await supabaseAdmin
        .from("demos")
        .update({ file_url: newUrl })
        .eq("id", demo.id);

      if (updateErr) {
        errors.push(`${demo.id}: ${updateErr.message}`);
      } else {
        fixed++;
      }
    } catch {
      errors.push(`${demo.id}: could not parse URL "${demo.file_url}"`);
    }
  }

  // Return the full updated list so the client can refresh state
  const { data: updated } = await supabaseAdmin
    .from("demos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return NextResponse.json({ fixed, errors, demos: updated ?? [] });
}
