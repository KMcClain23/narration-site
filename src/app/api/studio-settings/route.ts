import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import {
  parseSetting,
  settingsFromRows,
  SETTING_KEYS,
  type StudioSettings,
} from "@/lib/studio-settings";

// All five studio numbers in one call. /api/site-settings answers one key per
// request, which would be five round trips every time a board card wants to
// know how fast its owner reads.
//
// Admin-only both ways: these are not public facts about the business, and a
// writable rate would let anyone rewrite every estimate on the site.

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(SETTING_KEYS));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: settingsFromRows(data ?? []) });
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json();
    const now = new Date().toISOString();
    const rows: { key: string; value: string; updated_at: string }[] = [];

    for (const field of Object.keys(SETTING_KEYS) as (keyof StudioSettings)[]) {
      if (!(field in body)) continue;
      // Parsed through the same clamp the reader uses, so a value that would
      // be ignored on the way out is refused on the way in rather than stored
      // and silently overridden.
      const cleaned = parseSetting(field, String(body[field]));
      if (cleaned !== Number(body[field])) {
        return NextResponse.json(
          { error: `${field} is outside the range this figure allows.` },
          { status: 400 },
        );
      }
      rows.push({ key: SETTING_KEYS[field], value: String(cleaned), updated_at: now });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("key, value")
      .in("key", Object.values(SETTING_KEYS));

    return NextResponse.json({ settings: settingsFromRows(data ?? []) });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
