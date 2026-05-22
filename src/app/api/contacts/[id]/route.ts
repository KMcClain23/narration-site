import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rowToContact } from "../route";

const COOKIE_NAME = "dmn_admin_key";

async function isAdmin() {
  const cookieStore = await cookies();
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const key    = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();
  return key && key === secret;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // Build update object — only include fields present in the payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if ("company"          in body) update.company           = String(body.company);
  if ("label"            in body) update.label             = String(body.label);
  if ("status"           in body) update.status            = String(body.status);
  if ("jobTitles"        in body) update.job_titles        = Array.isArray(body.jobTitles)    ? body.jobTitles    : [];
  if ("contactNames"     in body) update.contact_names     = Array.isArray(body.contactNames) ? body.contactNames : [];
  if ("contactInfo"      in body) update.contact_info      = String(body.contactInfo);
  if ("address"          in body) update.address           = String(body.address);
  if ("website"          in body) update.website           = String(body.website);
  if ("findingSource"    in body) update.finding_source    = String(body.findingSource);
  if ("preferredContact" in body) update.preferred_contact = String(body.preferredContact);
  if ("dateContacted"    in body) update.date_contacted    = String(body.dateContacted);
  if ("nextContactDate"  in body) update.next_contact_date = String(body.nextContactDate);
  if ("genres"           in body) update.genres            = Array.isArray(body.genres) ? body.genres : [];
  if ("notes"            in body) update.notes             = String(body.notes);

  const { data, error } = await supabaseAdmin
    .from("production_contacts")
    .update(update)
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: rowToContact(data) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("production_contacts")
    .delete()
    .eq("id", Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
