import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { key, bucket } = await req.json();
  if (!key || !bucket) return NextResponse.json({ error: "Missing key or bucket." }, { status: 400 });

  const { data, error } = await supabase
    .from("pdf_jobs")
    .insert({ status: "pending" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Kick off processing in background — fire and forget
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
  fetch(`${baseUrl}/api/board-pdf-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: data.id, key, bucket }),
  }).catch(() => {});

  return NextResponse.json({ jobId: data.id });
}