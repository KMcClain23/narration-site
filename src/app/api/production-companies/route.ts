// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.
// See ContactsClient's /api/contacts pattern for isAdmin() reference.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// production_contacts predates this admin redesign and stores the company
// name under `company`, not `name` — this route maps that one field so the
// rest of the app can treat it like every other PersonForm-backed type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPerson(r: any) {
  return {
    id: String(r.id),
    name: r.company ?? "",
    label: r.label ?? "",
    status: r.status ?? "",
    website: r.website ?? "",
    preferred_contact: r.preferred_contact ?? "",
    address: r.address ?? "",
    contact_info: r.contact_info ?? "",
    finding_source: r.finding_source ?? "",
    genres: r.genres ?? [],
    notes: r.notes ?? "",
    date_contacted: r.date_contacted ?? "",
    next_contact_date: r.next_contact_date ?? "",
    job_titles: r.job_titles ?? [],
    contact_names: r.contact_names ?? [],
  };
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await supabaseAdmin
    .from("production_contacts")
    .select("*")
    .order("company", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ production_companies: (data ?? []).map(rowToPerson) });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const {
      name, label = "", status = "", website = "", preferred_contact = "",
      address = "", contact_info = "", finding_source = "", genres = [], notes = "",
      date_contacted = null, next_contact_date = null, job_titles = [], contact_names = [],
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_contacts")
      .insert({
        company: name.trim(), label, status, website, preferred_contact,
        address, contact_info, finding_source,
        genres: Array.isArray(genres) ? genres : [],
        notes, date_contacted: date_contacted || null, next_contact_date: next_contact_date || null,
        job_titles: Array.isArray(job_titles) ? job_titles : [],
        contact_names: Array.isArray(contact_names) ? contact_names : [],
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/production-companies Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, production_company: rowToPerson(data) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("POST /api/production-companies exception:", msg);
    return NextResponse.json({ error: msg || "Failed to create company." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "Company id is required." }, { status: 400 });

    const payload: Record<string, string | string[] | null> = {};
    if ("name" in fields) payload.company = (fields.name ?? "").trim();
    for (const key of ["label", "status", "website", "preferred_contact", "address", "contact_info", "finding_source", "notes"]) {
      if (key in fields) payload[key] = fields[key] ?? "";
    }
    for (const key of ["date_contacted", "next_contact_date"] as const) {
      if (key in fields) payload[key] = fields[key] || null;
    }
    if ("genres" in fields) payload.genres = Array.isArray(fields.genres) ? fields.genres : [];
    if ("job_titles" in fields) payload.job_titles = Array.isArray(fields.job_titles) ? fields.job_titles : [];
    if ("contact_names" in fields) payload.contact_names = Array.isArray(fields.contact_names) ? fields.contact_names : [];

    if ("name" in fields && !payload.company) {
      return NextResponse.json({ error: "Company name cannot be empty." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_contacts")
      .update(payload)
      .eq("id", Number(id))
      .select()
      .single();

    if (error) {
      console.error("PUT /api/production-companies Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, production_company: rowToPerson(data) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("PUT /api/production-companies exception:", msg);
    return NextResponse.json({ error: msg || "Failed to update company." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Company id is required." }, { status: 400 });
    const { error } = await supabaseAdmin.from("production_contacts").delete().eq("id", Number(id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ error: msg || "Failed to delete company." }, { status: 500 });
  }
}
