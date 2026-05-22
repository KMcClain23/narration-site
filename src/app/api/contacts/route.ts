import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const COOKIE_NAME = "dmn_admin_key";

async function isAdmin() {
  const cookieStore = await cookies();
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const key    = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();
  return key && key === secret;
}

// snake_case row → camelCase Contact
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToContact(r: any) {
  return {
    id:               r.id               as number,
    company:          r.company          as string,
    label:            r.label            as string,
    status:           r.status           as string,
    jobTitles:        (r.job_titles       as string[]) ?? [],
    contactNames:     (r.contact_names   as string[]) ?? [],
    contactInfo:      r.contact_info     as string,
    address:          r.address          as string,
    website:          r.website          as string,
    findingSource:    r.finding_source   as string,
    preferredContact: r.preferred_contact as string,
    dateContacted:    r.date_contacted   as string,
    nextContactDate:  r.next_contact_date as string,
    genres:           (r.genres          as string[]) ?? [],
    notes:            r.notes            as string,
    updatedAt:        r.updated_at       as string,
  };
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("production_contacts")
    .select("*")
    .order("company", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: (data ?? []).map(rowToContact) });
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("production_contacts")
    .insert({
      company:          String(body.company          ?? ""),
      label:            String(body.label            ?? ""),
      status:           String(body.status           ?? ""),
      job_titles:       Array.isArray(body.jobTitles)    ? body.jobTitles    : [],
      contact_names:    Array.isArray(body.contactNames) ? body.contactNames : [],
      contact_info:     String(body.contactInfo      ?? ""),
      address:          String(body.address          ?? ""),
      website:          String(body.website          ?? ""),
      finding_source:   String(body.findingSource    ?? ""),
      preferred_contact:String(body.preferredContact ?? ""),
      date_contacted:   String(body.dateContacted    ?? ""),
      next_contact_date:String(body.nextContactDate  ?? ""),
      genres:           Array.isArray(body.genres)   ? body.genres   : [],
      notes:            String(body.notes            ?? ""),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: rowToContact(data) });
}
