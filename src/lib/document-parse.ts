import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { selectMoneySheets, xlsxToSheets } from "@/lib/xlsx-text";

// Shared plumbing for reading a money document — a royalty statement, a
// processor payout export — into structured rows. The schema and prompt differ
// per document type; everything below is the same either way.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Spreadsheets are converted to text here rather than sent as a document block. */
export const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function mediaTypeFor(name: string, type: string): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "xlsx" || ext === "xlsm") return XLSX_MEDIA_TYPE;
  return "text/plain";
}

/**
 * PDFs and images are handed to the model as-is rather than text-extracted
 * first: remittances are often scanned, and tabular layouts lose their column
 * structure when flattened to plain text.
 */
export function buildContent(
  bytes: Buffer,
  mediaType: string,
  prompt: string,
  /**
   * The original filename. Royalty exports routinely carry the statement
   * period only in the filename — an ACX monthly workbook names the month
   * there and never states it in any cell — so withholding it loses the one
   * piece of information that makes the rows sortable.
   */
  filename?: string,
): Anthropic.ContentBlockParam[] {
  if (filename) prompt = prompt + `\n\nThe file is named: ${filename}`;

  // A workbook is a zip of XML — unreadable as a document block. An ACX
  // monthly statement is 13 sheets, most of them per-marketplace unit tables
  // and a glossary; only a few carry money. Convert to text and send those,
  // so the model has fewer chances to read the wrong number.
  if (mediaType === XLSX_MEDIA_TYPE) {
    const sheets = selectMoneySheets(xlsxToSheets(bytes));
    const body = sheets
      .map(s => ["=== SHEET: " + s.name + " ===", s.tsv].join("\n"))
      .join("\n\n");
    return [
      { type: "text", text: prompt + "\n\nSpreadsheet contents:\n\n" + body.slice(0, 200_000) },
    ];
  }

  if (mediaType === "application/pdf") {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
      { type: "text", text: prompt },
    ];
  }
  if (mediaType.startsWith("image/")) {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/png" | "image/jpeg",
          data: bytes.toString("base64"),
        },
      },
      { type: "text", text: prompt },
    ];
  }
  return [{ type: "text", text: `${prompt}\n\nDocument:\n\n${bytes.toString("utf8").slice(0, 200_000)}` }];
}

export type ParseOutcome<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/**
 * Structured outputs rather than "reply with only JSON": the schema is enforced
 * by the API, so a malformed response can't reach the caller. Adaptive thinking
 * is on because these documents are frequently messy — merged header rows,
 * running totals mixed in with line items, footnotes that look like data.
 */
export async function extractRows<T>(
  content: Anthropic.ContentBlockParam[],
  schema: Record<string, unknown>,
): Promise<ParseOutcome<T>> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });

  // Guard before touching content: a refusal returns HTTP 200 with an empty or
  // partial content array, so indexing straight in would throw.
  if (response.stop_reason === "refusal") {
    return { ok: false, status: 422, error: "The document could not be processed." };
  }

  const text = response.content.find(b => b.type === "text");
  if (!text || text.type !== "text") {
    return { ok: false, status: 502, error: "No data returned." };
  }

  return { ok: true, data: JSON.parse(text.text) as T };
}
