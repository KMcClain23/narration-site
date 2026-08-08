import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAmazonBook } from "@/lib/amazon-scrape";

function isAmazonUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\/(www\.)?amazon\.com\//i.test(url.trim());
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// GET: admin gets all cards
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Single card by ID
  const cardId = searchParams.get("id");
  if (cardId) {
    const { data, error } = await supabaseAdmin
      .from("board_cards").select("*").eq("id", cardId).single();
    if (error) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    return NextResponse.json({ card: data });
  }

  // Admin: get all cards. Archived cards are hidden from the main board by
  // default; pass ?archived=1 to fetch only the archived ones (Archive view).
  const showArchived = searchParams.get("archived") === "1";
  let query = supabaseAdmin.from("board_cards").select("*");
  query = showArchived
    ? query.not("archived_at", "is", null).order("archived_at", { ascending: false })
    : query.is("archived_at", null).order("status").order("sort_order");
  let { data, error } = await query;

  // archived_at column may not exist yet (migration not run) — retry unfiltered
  // rather than let the whole board fail to load.
  if (error && error.message?.includes("archived_at")) {
    const fallback = await supabaseAdmin.from("board_cards").select("*").order("status").order("sort_order");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

function makeSlug(title: string): string {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// POST: create card (admin)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title, author = "", cover_url = "",
      status = "contracted",          // default to contracted (not audition) so card is visible
      deadline, notes = "",
      links = [], co_narrator = "", sort_order = 0, chapters = [],
      subtitle = "", tags = [], description = "",
      audible_link = "", ar_link = "", spotify_link = "",
      word_count = 0, first15_due,
      pfh_rate = 0, payment_type = "pfh", first_15_complete = false,
      slug = "",
      trigger_warnings = [], is_confidential = false, narration_format = null,
      production_type = null, production_company = null,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });

    // Build a clean insert — only include nullable fields when they have a value
    // so we never pass undefined and never violate NOT NULL constraints.
    const insertData: Record<string, unknown> = {
      title:             title.trim(),
      author:            author || "",
      cover_url:         cover_url || "",
      status:            status || "contracted",
      notes:             notes || "",
      links:             Array.isArray(links)    ? links    : [],
      co_narrator:       co_narrator || "",
      sort_order:        sort_order  ?? 0,
      chapters:          Array.isArray(chapters) ? chapters : [],
      subtitle:          subtitle    || "",
      tags:              Array.isArray(tags)     ? tags     : [],
      description:       description || "",
      audible_link:      audible_link  || "",
      ar_link:           ar_link       || "",
      spotify_link:      spotify_link  || "",
      word_count:        word_count   ?? 0,
      pfh_rate:          pfh_rate     ?? 0,
      payment_type:      payment_type || "pfh",
      first_15_complete: first_15_complete ?? false,
      slug:              slug || makeSlug(title.trim()),
      trigger_warnings:  Array.isArray(trigger_warnings) ? trigger_warnings : [],
      is_confidential:   Boolean(is_confidential),
      narration_format:  narration_format || null,
      production_type:   production_type || null,
      production_company: production_type === "company" ? (production_company || null) : null,
    };
    // Date columns must be null (not "") when empty — Supabase rejects empty strings for date/timestamptz
    insertData.deadline    = deadline    || null;
    insertData.first15_due = first15_due || null;

    let { data, error } = await supabaseAdmin
      .from("board_cards")
      .insert(insertData)
      .select()
      .single();

    // If trigger_warnings column doesn't exist yet (migration not run), retry without it
    if (error && error.message?.includes("trigger_warnings")) {
      delete insertData.trigger_warnings;
      ({ data, error } = await supabaseAdmin.from("board_cards").insert(insertData).select().single());
    }
    if (error && error.message?.includes("is_confidential")) {
      delete insertData.is_confidential;
      ({ data, error } = await supabaseAdmin.from("board_cards").insert(insertData).select().single());
    }
    if (error && error.message?.includes("narration_format")) {
      delete insertData.narration_format;
      ({ data, error } = await supabaseAdmin.from("board_cards").insert(insertData).select().single());
    }
    if (error && (error.message?.includes("production_type") || error.message?.includes("production_company"))) {
      delete insertData.production_type;
      delete insertData.production_company;
      ({ data, error } = await supabaseAdmin.from("board_cards").insert(insertData).select().single());
    }

    if (error) {
      // Supabase errors are plain objects — never use String(error) or throw them
      console.error("POST /api/board Supabase error:", JSON.stringify(error));
      return NextResponse.json(
        { error: error.message || JSON.stringify(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    // Non-Supabase exceptions (network, JSON parse, etc.)
    const msg = e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : JSON.stringify(e);
    console.error("POST /api/board exception:", msg);
    return NextResponse.json({ error: msg || "Failed to create card." }, { status: 500 });
  }
}

// PUT: update card (admin)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    // Admin full update — only columns that actually exist on board_cards.
    // Keep this list in sync with the DB schema; do NOT add speculative columns.
    // Migration needed: ALTER TABLE board_cards ADD COLUMN spotify_link text;
    const allowed = [
      "title", "author", "cover_url", "status", "deadline", "notes",
      "links", "co_narrator", "sort_order", "chapters",
      "subtitle", "tags", "description", "audible_link", "ar_link", "spotify_link",
      "word_count", "first15_due", "pfh_rate", "payment_type",
      "first_15_complete", "script_url", "trigger_warnings", "released_at",
      "is_confidential", "narration_format", "narrator_share_percent", "production_type", "production_company",
      "archived_at", "archived_reason", "archived_notes",
    ];
    const DATE_FIELDS = new Set(["deadline", "first15_due", "first_15_due", "released_at", "archived_at"]);

    // A date input sends "2026-07-17", which Postgres stores as midnight UTC in
    // a timestamptz. The public book page formats that month-and-year, so a
    // date one hour the wrong side of a month boundary would print the previous
    // month. Noon has no such edge in any timezone.
    const atNoonUTC = (v: unknown) =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00.000Z` : v;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in fields) {
        // Date columns must be null (not "") — Supabase rejects empty strings for date/timestamptz
        update[key] = DATE_FIELDS.has(key)
          ? (key === "released_at" ? (atNoonUTC(fields[key]) || null) : (fields[key] || null))
          : fields[key];
      }
    }

    // Snapshot the current row — needed to auto-stamp released_at and check
    // Amazon-fill eligibility (which requires knowing the CURRENT
    // description/tags/trigger_warnings, not just this payload).
    const { data: cur } = await supabaseAdmin
      .from("board_cards")
      .select("released_at, audible_link, description, tags, trigger_warnings")
      .eq("id", id)
      .single();
    const existingReleasedAt: string | null = (cur as Record<string, unknown>)?.released_at as string ?? null;

    // Auto-stamp released_at when transitioning to "released" and not already set.
    // Fires when: key absent from payload OR payload value is empty/null (i.e. the
    // manual date picker was left blank). Never fires when existingReleasedAt is
    // already set — that protects manually-entered dates from being overwritten.
    if (
      fields.status === "released" &&
      existingReleasedAt === null &&
      (!("released_at" in fields) || !fields.released_at)
    ) {
      update.released_at = new Date().toISOString();
    }

    // Amazon auto-fill: opportunistic, best-effort fetch to fill in an empty
    // description/tags/trigger_warnings when this card links to amazon.com.
    // Fill-empty-only — never overwrites a field that already has content,
    // whether that content came from this payload or was already saved.
    let amazonFill: { description: boolean; tags: number; triggerWarnings: number } | null = null;
    const effectiveLink = "audible_link" in fields ? fields.audible_link : cur?.audible_link;
    if (isAmazonUrl(effectiveLink)) {
      const descriptionEligible = isEmptyValue("description" in fields ? fields.description : undefined) && isEmptyValue(cur?.description);
      const tagsEligible        = isEmptyValue("tags" in fields ? fields.tags : undefined) && isEmptyValue(cur?.tags);
      const twEligible          = isEmptyValue("trigger_warnings" in fields ? fields.trigger_warnings : undefined) && isEmptyValue(cur?.trigger_warnings);

      if (descriptionEligible || tagsEligible || twEligible) {
        const scraped = await fetchAmazonBook(effectiveLink);
        if (scraped) {
          amazonFill = { description: false, tags: 0, triggerWarnings: 0 };
          if (descriptionEligible && scraped.description) {
            update.description = scraped.description;
            amazonFill.description = true;
          }
          if (tagsEligible && scraped.tags.length) {
            update.tags = scraped.tags;
            amazonFill.tags = scraped.tags.length;
          }
          if (twEligible && scraped.triggerWarnings.length) {
            update.trigger_warnings = scraped.triggerWarnings;
            amazonFill.triggerWarnings = scraped.triggerWarnings.length;
          }
        }
      }
    }

    let { data, error } = await supabaseAdmin
      .from("board_cards").update(update).eq("id", id).select().single();

    // Retry shims for columns that may not exist yet (migration not run)
    if (error && error.message?.includes("trigger_warnings")) {
      delete update.trigger_warnings;
      ({ data, error } = await supabaseAdmin
        .from("board_cards").update(update).eq("id", id).select().single());
    }
    if (error && error.message?.includes("released_at")) {
      delete update.released_at;
      ({ data, error } = await supabaseAdmin
        .from("board_cards").update(update).eq("id", id).select().single());
    }
    if (error && error.message?.includes("is_confidential")) {
      delete update.is_confidential;
      ({ data, error } = await supabaseAdmin
        .from("board_cards").update(update).eq("id", id).select().single());
    }
    if (error && error.message?.includes("narration_format")) {
      delete update.narration_format;
      ({ data, error } = await supabaseAdmin
        .from("board_cards").update(update).eq("id", id).select().single());
    }
    if (error && (error.message?.includes("production_type") || error.message?.includes("production_company"))) {
      delete update.production_type;
      delete update.production_company;
      ({ data, error } = await supabaseAdmin
        .from("board_cards").update(update).eq("id", id).select().single());
    }
    if (error && (error.message?.includes("archived_at") || error.message?.includes("archived_reason") || error.message?.includes("archived_notes"))) {
      delete update.archived_at;
      delete update.archived_reason;
      delete update.archived_notes;
      ({ data, error } = await supabaseAdmin
        .from("board_cards").update(update).eq("id", id).select().single());
    }

    if (error) {
      console.error("PUT /api/board Supabase error:", JSON.stringify(error), "update keys:", Object.keys(update));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, card: data, amazonFill });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("PUT /api/board exception:", msg);
    return NextResponse.json({ error: msg || "Failed to update card." }, { status: 500 });
  }
}

// DELETE: admin only
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
    const { error } = await supabaseAdmin.from("board_cards").delete().eq("id", id);
    if (error) {
      console.error("DELETE /api/board Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("DELETE /api/board exception:", msg);
    return NextResponse.json({ error: msg || "Failed to delete." }, { status: 500 });
  }
}
