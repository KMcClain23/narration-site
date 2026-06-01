import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Table: email_subscribers (email text unique, source text, created_at timestamptz default now())

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("email_subscribers")
      .upsert({ email: normalized, source: "merch" }, { onConflict: "email", ignoreDuplicates: true });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("merch subscribe error:", err);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
