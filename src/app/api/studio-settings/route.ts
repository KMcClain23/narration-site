import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import {
  describeIssue,
  parseSetting,
  SETTING_KEYS,
  type StudioSettingField,
} from "@/lib/studio-settings";
import { getStudioSettings } from "@/lib/studio-settings-server";

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
      // Parsed through the same rule the reader uses, so a value that would be
      // rejected on the way out is refused on the way in rather than stored and
      // silently overridden.
      //
      // This is the most valuable of the four rules and the only one that is
      // preventive: it stops the bad value existing at all. A validator that
      // quietly normalises out-of-range input is the same disease as a loader
      // that quietly defaults it, moved to the entry point.
      //
      // The refusal now quotes the stored value and what it was measured
      // against, using the same sentence Settings and Android show, instead of
      // a generic "outside the range this figure allows".
      const { value, issue } = parseSetting(field, String(body[field]));
      if (issue || value === null) {
        return NextResponse.json(
          {
            error: issue
              ? `${field}: ${describeIssue(issue)}`
              : `${field} could not be read as a number.`,
          },
          { status: 400 },
        );
      }
      rows.push({ key: SETTING_KEYS[field], value: String(value), updated_at: now });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const saved = await getStudioSettings();
    if (saved.failure) return NextResponse.json({ error: saved.failure }, { status: 500 });
    return NextResponse.json({ settings: saved });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
