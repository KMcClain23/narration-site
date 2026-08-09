import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// Trimmed, curated column set (not every board_cards column) — order matches
// the exact spec given for this export, not DB column order.
const COLUMNS: { key: string; label: string }[] = [
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
  { key: "audible_link", label: "Amazon/Audible Link" },
  { key: "ar_link", label: "Author's Republic Link" },
  { key: "spotify_link", label: "Spotify Link" },
  { key: "word_count", label: "Word Count" },
  { key: "released_at", label: "Released At" },
  { key: "pfh_rate", label: "PFH Rate" },
  { key: "payment_type", label: "Payment Type" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
];

const DATETIME_UTC_KEYS = new Set(["archived_at", "released_at", "created_at", "updated_at"]);

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

function formatDateTimeUTC(value: unknown): string {
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (DATETIME_UTC_KEYS.has(key)) return formatDateTimeUTC(value);

  switch (key) {
    case "co_narrator":
      return parseMaybeJsonArray(value).join(", ");
    case "is_confidential":
      return value ? "Yes" : "No";
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

// GET: curated CSV export of every board_cards row (active + archived), 21
// columns per product spec, sorted by created_at descending.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("*")
    .order("created_at", { ascending: false });

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

  const filename = `dmn-board-export-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
