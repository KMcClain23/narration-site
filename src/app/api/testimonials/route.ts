import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET: public fetch of approved testimonials, or all for admin
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const admin = searchParams.get("admin") === "true";

  const query = supabaseAdmin
    .from("testimonials")
    .select("*")
    .order("created_at", { ascending: false });

  if (!admin) {
    query.eq("status", "approved");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ testimonials: data });
}

// POST: public submit a new testimonial (starts as pending)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reviewer_name, reviewer_role, book_title = "", quote } = body;

    if (!reviewer_name?.trim() || !reviewer_role || !quote?.trim()) {
      return NextResponse.json({ error: "Name, role, and review are required." }, { status: 400 });
    }
    if (!["author", "narrator"].includes(reviewer_role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (quote.trim().length < 20) {
      return NextResponse.json({ error: "Review must be at least 20 characters." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("testimonials")
      .insert({ reviewer_name: reviewer_name.trim(), reviewer_role, book_title: book_title.trim(), quote: quote.trim(), status: "pending" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, testimonial: data });
  } catch (e) {
    return NextResponse.json({ error: "Failed to submit review." }, { status: 500 });
  }
}

// PATCH: admin approve or reject
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("testimonials")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, testimonial: data });
  } catch (e) {
    return NextResponse.json({ error: "Failed to update testimonial." }, { status: 500 });
  }
}

// DELETE: admin hard-delete
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const { error } = await supabaseAdmin.from("testimonials").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  }
}
