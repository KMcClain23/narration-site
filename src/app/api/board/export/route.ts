import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Every board_cards column, in a sensible reading order. Kept as an explicit
// list (rather than Object.keys) so column order is stable and each gets a
// human-readable header regardless of what the DB column is actually named.
const COLUMNS: { key: string; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "author", label: "Author" },
  { key: "co_narrator", label: "Co-Narrator(s)" },
  { key: "status", label: "Status" },
  { key: "archived_at", label: "Archived At" },
  { key: "archived_reason", label: "Archived Reason" },
  { key: "archived_notes", label: "Archived Notes" },
  { key: "is_confidential", label: "Confidential (NDA)" },
  { key: "narration_format", label: "Narration Format" },
  { key: "production_type", label: "Production Type" },
  { key: "production_company", label: "Production Company" },
  { key: "cover_url", label: "Cover URL" },
  { key: "audible_link", label: "Amazon/Audible Link" },
  { key: "ar_link", label: "Author's Republic Link" },
  { key: "spotify_link", label: "Spotify Link" },
  { key: "description", label: "Description" },
  { key: "tags", label: "Tags" },
  { key: "trigger_warnings", label: "Trigger Warnings" },
  { key: "word_count", label: "Word Count" },
  { key: "deadline", label: "Deadline" },
  { key: "first15_due", label: "First 15 Due" },
  { key: "first_15_complete", label: "First 15 Complete" },
  { key: "released_at", label: "Released At" },
  { key: "pfh_rate", label: "PFH Rate" },
  { key: "payment_type", label: "Payment Type" },
  { key: "notes", label: "Private Notes" },
  { key: "author_notes", label: "Note To Author" },
  { key: "dean_message", label: "Message From Dean" },
  { key: "author_email", label: "Author Email" },
  { key: "email_updates_enabled", label: "Author Email Updates Enabled" },
  { key: "author_token", label: "Author Portal Token" },
  { key: "slug", label: "Slug" },
  { key: "links", label: "Extra Links" },
  { key: "chapters", label: "Chapters (JSON)" },
  { key: "script_url", label: "Script URL (OneDrive)" },
  { key: "books_table_id", label: "Legacy Books Table ID" },
  { key: "sort_order", label: "Sort Order" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
];

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// co_narrator is stored as either a JSON-array string or a plain string.
function parseMaybeJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [raw];
    }
  }
  return [];
}

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";

  switch (key) {
    case "co_narrator":
      return parseMaybeJsonArray(value).join("; ");
    case "tags":
    case "trigger_warnings":
      return Array.isArray(value) ? value.join("; ") : String(value);
    case "links":
      return Array.isArray(value)
        ? (value as { label: string; url: string }[]).map(l => `${l.label}: ${l.url}`).join("; ")
        : "";
    case "chapters":
      return Array.isArray(value) && value.length ? JSON.stringify(value) : "";
    case "is_confidential":
    case "first_15_complete":
    case "email_updates_enabled":
      return value ? "Yes" : "No";
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

// GET: full CSV export of every board_cards row (active + archived) — every
// column, admin-only detail. Same auth posture as the rest of /api/board:
// gated by the /board page's cookie check, not by this endpoint itself.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("*")
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const header = COLUMNS.map(c => csvEscape(c.label)).join(",");
  const lines = rows.map(row =>
    COLUMNS.map(c => csvEscape(formatCell(c.key, row[c.key]))).join(",")
  );
  // Leading BOM so Excel opens the UTF-8 file correctly instead of mangling
  // curly quotes/em dashes in descriptions.
  const csv = String.fromCharCode(0xfeff) + [header, ...lines].join("\r\n");

  const filename = `narration-books-export-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
