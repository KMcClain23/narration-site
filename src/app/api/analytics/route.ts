import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { event, page, metadata } = await req.json();
    if (!event) return NextResponse.json({ error: "event required" }, { status: 400 });
    await supabaseAdmin.from("analytics_events").insert({ event, page, metadata });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
