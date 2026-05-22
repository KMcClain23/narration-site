import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import rawContacts from "@/data/contacts.json";

const COOKIE_NAME = "dmn_admin_key";

async function isAdmin() {
  const cookieStore = await cookies();
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const key    = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();
  return key && key === secret;
}

export async function POST() {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch existing company names to avoid duplicates
  const { data: existing } = await supabaseAdmin
    .from("production_contacts")
    .select("company");

  const existingNames = new Set((existing ?? []).map((r: { company: string }) => r.company.toLowerCase()));

  const toInsert = (rawContacts as {
    company: string; label: string; status: string;
    jobTitles: string[]; contactNames: string[]; contactInfo: string;
    address: string; website: string; findingSource: string;
    preferredContact: string; dateContacted: string; nextContactDate: string;
    genres: string[]; notes: string;
  }[])
    .filter(c => !existingNames.has(c.company.toLowerCase()))
    .map(c => ({
      company:          c.company,
      label:            c.label            ?? "",
      status:           c.status           ?? "",
      job_titles:       c.jobTitles        ?? [],
      contact_names:    c.contactNames     ?? [],
      contact_info:     c.contactInfo      ?? "",
      address:          c.address          ?? "",
      website:          c.website          ?? "",
      finding_source:   c.findingSource    ?? "",
      preferred_contact:c.preferredContact ?? "",
      date_contacted:   c.dateContacted    ?? "",
      next_contact_date:c.nextContactDate  ?? "",
      genres:           c.genres           ?? [],
      notes:            c.notes            ?? "",
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ message: "All contacts already seeded.", inserted: 0 });
  }

  const { error } = await supabaseAdmin.from("production_contacts").insert(toInsert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: `Seeded ${toInsert.length} contacts.`, inserted: toInsert.length });
}
