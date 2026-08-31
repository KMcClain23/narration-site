import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, requireAdminOrInternal } from "@/lib/require-admin";
import { SETTING_KEYS, type StudioSettingField } from "@/lib/studio-settings";
import { getStudioSettings } from "@/lib/studio-settings-server";

// All five studio numbers in one call. /api/site-settings answers one key per
// request, which would be five round trips every time a board card wants to
// know how fast its owner reads.
//
// Admin-only both ways: these are not public facts about the business, and a
// writable rate would let anyone rewrite every estimate on the site.

export const dynamic = "force-dynamic";

export async function GET() {
  // GET also accepts the internal bearer: check-payments-costed exists because
  // calling getStudioSettings directly proves the LOADER reads the rate and
  // says nothing about the shape THIS route serves it in. It has to come
  // through here. PATCH is unchanged and stays session-only — a writable rate
  // would rewrite every estimate on the site.
  const denied = await requireAdminOrInternal();
  if (denied) return denied;

  // Through the one loader, so the failure semantics are the same here as on
  // every server surface. A read that did not happen now travels as a read that
  // did not happen, rather than as five numbers nobody chose.
  const read = await getStudioSettings();
  if (read.failure) return NextResponse.json({ error: read.failure }, { status: 500 });
  return NextResponse.json({ settings: read });
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json();
    const now = new Date().toISOString();
    const rows: { key: string; value: string; updated_at: string }[] = [];

    for (const field of Object.keys(SETTING_KEYS) as StudioSettingField[]) {
      if (!(field in body)) continue;
      // No validation here any more. The rule lives in the database, in
      // check_site_setting(), and this route DEFERS to it.
      //
      // It used to hold the only copy — which was never actually true:
      // /api/site-settings accepts any key with any value and validates
      // nothing, so a bad rate could already be stored from the web without
      // passing through here. Two write paths, one validated. Adding a phone
      // would have made three.
      //
      // A trigger fires for every writer: this route, that one, the phone, and
      // psql. The refusal it raises is the sentence every client displays, so
      // "both clients say the same thing" is a property rather than a habit.
      rows.push({ key: SETTING_KEYS[field], value: String(body[field]), updated_at: now });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(rows, { onConflict: "key" });
    // 22023 is invalid_parameter_value, which is what check_site_setting()
    // raises. It is the seam that lets a refusal be answered as a 400 the user
    // can act on rather than a 500 that reads as the server being broken —
    // and the message is passed through untouched, because rewording it here
    // would be the second copy of the rule coming back by the side door.
    if (error) {
      const status = error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const saved = await getStudioSettings();
    if (saved.failure) return NextResponse.json({ error: saved.failure }, { status: 500 });
    return NextResponse.json({ settings: saved });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
