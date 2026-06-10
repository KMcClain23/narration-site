import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Correct public URLs for the original 6 demos (files live at bucket root).
// These are the authoritative URLs — used by Fix URLs regardless of env vars.
const LEGACY_URL_MAP: Record<string, string> = {
  "LGBTQ+ Romance":
    "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20%28BrightPlayful%29%2C%20Confident%2C%20Sex-Positive%2CFlirtatious.mp3",
  "Romantasy":
    "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20%28PossessiveHaunted%29%2C%20Harsh%20Control%2C%20Dark%20Romance%2CDeeep%20Loss.mp3",
  "Feminine Voice":
    "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Female%20Voice%202.mp3",
  "Romance Duet":
    "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/British%20-%20Romance%20Duet.mp3",
  "Child POV Drama":
    "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Child%20%285-year-old%20boy%29%2C%20Emotional%20TraumaWitnessing%20Violence%2C%20-%20Sample.mp3",
  "Multi-Character Dialogue":
    "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3",
};

const CORRECT_BASE = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev";

export async function POST() {
  const { data: demos, error: fetchErr } = await supabaseAdmin
    .from("demos")
    .select("id, title, file_url");

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let fixed = 0;
  const errors: string[] = [];

  for (const demo of demos ?? []) {
    // Determine the correct URL:
    // 1. If the title matches a known legacy demo, use the exact mapped URL.
    // 2. Otherwise rewrite the base to CORRECT_BASE, keeping the file path.
    let newUrl: string | null = null;

    const mapped = LEGACY_URL_MAP[demo.title];
    if (mapped) {
      newUrl = mapped;
    } else if (demo.file_url) {
      try {
        const parsed = new URL(demo.file_url);
        if (!demo.file_url.startsWith(CORRECT_BASE)) {
          newUrl = `${CORRECT_BASE}${parsed.pathname}`;
        }
      } catch {
        errors.push(`${demo.id}: could not parse URL "${demo.file_url}"`);
        continue;
      }
    }

    // Skip if URL is already correct
    if (!newUrl || newUrl === demo.file_url) continue;

    const { error: updateErr } = await supabaseAdmin
      .from("demos")
      .update({ file_url: newUrl })
      .eq("id", demo.id);

    if (updateErr) {
      errors.push(`${demo.id} (${demo.title}): ${updateErr.message}`);
    } else {
      fixed++;
    }
  }

  // Return the full updated list
  const { data: updated } = await supabaseAdmin
    .from("demos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return NextResponse.json({ fixed, errors, demos: updated ?? [] });
}
