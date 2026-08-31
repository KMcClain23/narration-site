import { NextResponse } from "next/server";
import { isAdminOrInternal } from "@/lib/require-admin";
import { buildContent, extractRows, MAX_UPLOAD_BYTES, mediaTypeFor } from "@/lib/document-parse";

// Reads any money document and returns candidate payment rows for review.
//
// One endpoint rather than one per document type: a narrator has a folder of
// mixed PDFs and exports and shouldn't have to sort them first, or tell the
// app which kind each one is. The model classifies, then extracts.
//
// Nothing is written here. Rows are proposals — an extraction mistake must
// never become a financial record without a human seeing the number.

export const maxDuration = 60;

const SCHEMA = {
  type: "object" as const,
  properties: {
    document_type: {
      type: "string" as const,
      enum: ["royalty_statement", "transaction_list", "invoice", "unknown"],
    },
    rows: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          kind: {
            type: "string" as const,
            enum: ["fee", "royalty"],
            description: "royalty for royalty-share income; fee for everything else.",
          },
          client_name: {
            type: "string" as const,
            description:
              "The OTHER party: the author, rights holder, or paying customer. Never the narrator " +
              "who owns the document. Empty string if absent.",
          },
          title: { type: "string" as const, description: "Book title if stated, else empty string." },
          period: {
            type: "string" as const,
            description: 'Royalty period, e.g. "Jan 2026". Empty string for non-royalty rows.',
          },
          amount: { type: "number" as const, description: "The money figure for this row, in dollars." },
          amount_kind: {
            type: "string" as const,
            enum: ["received", "invoiced"],
            description: "received = money already paid. invoiced = billed but not necessarily paid.",
          },
          date: { type: "string" as const, description: "YYYY-MM-DD. Payment date, or invoice date. Empty if absent." },
          due_on: { type: "string" as const, description: "YYYY-MM-DD payment-due date, else empty string." },
          invoice_number: { type: "string" as const, description: "Invoice number if stated, else empty string." },
          method: { type: "string" as const, description: 'Card, "ACX", "PayPal", etc. Empty string if absent.' },
          status: {
            type: "string" as const,
            enum: ["success", "declined", "refunded", "pending", "unknown"],
            description: "Transaction outcome. Use success for a plain paid invoice or royalty payment.",
          },
          rate_pfh: { type: "number" as const, description: "Per-finished-hour rate if stated, else 0." },
          hours: { type: "number" as const, description: "Finished hours / quantity if stated, else 0." },
          confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
          notes: { type: "string" as const, description: "Anything worth keeping. Empty string if none." },
        },
        required: [
          "kind", "client_name", "title", "period", "amount", "amount_kind", "date",
          "due_on", "invoice_number", "method", "status", "rate_pfh", "hours", "confidence", "notes",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["document_type", "rows"],
  additionalProperties: false,
};

const PROMPT = `You are reading a financial document belonging to an audiobook narrator.
Classify it, then extract every payment row.

Document types:
- royalty_statement — ACX/Findaway/publisher royalty report. One row per period.
- transaction_list — a payment processor export (Stripe, Square, PayPal). One row per transaction.
- invoice — an invoice the narrator ISSUED to a client. Usually one row.

Rules that matter:
- Report EVERY transaction line including declined, failed and refunded ones,
  with the correct status. Do not silently drop them — a declined charge that
  was retried successfully appears twice in the source, and the reviewer needs
  to see both to avoid double-counting.
- amount is what the NARRATOR receives or bills. On a royalty statement take the
  producer/narrator side of the split, never gross sales and never the rights
  holder's share.
- Never treat a running total, lifetime-to-date figure, subtotal or balance as a
  payment row.

ACX-style statements carry a RUNNING BALANCE. Getting these columns wrong
double-counts income across every month, so read them precisely:
- "Net Royalties Earned" is what was earned IN THIS PERIOD. This is the figure
  to report, and the only one.
- "Payment Due" is the cumulative balance owed — this period's earnings PLUS
  everything unpaid from previous periods. It is not this period's income.
  Never report it.
- "Balance (Brought Forward)" is prior unpaid earnings. Never report it.
- "Amount Paid (Prior Period)" is a disbursement of balance already earned in
  earlier periods. It is not new income and was already reported when earned.
  Never report it.
- Prefer the per-title sheet — named "Royalties by Title" or "Royalties Earned
  by Title" depending on the month — so each row is attributable to one book.
  Fall back to the Summary only when no per-title breakdown exists, and say so
  in notes.
- A period that earned nothing produces NO rows, even when Payment Due is
  large because an unpaid balance carried forward.
- On an invoice the narrator issued, client_name is the BILL TO party, and
  amount_kind is "invoiced" unless the document says it was paid.
- Never invent a figure. If an amount is not stated, use 0 and set confidence low.
- Dates are YYYY-MM-DD. Month only means the first of that month.
- Set confidence low and explain in notes whenever a figure is internally
  inconsistent or ambiguous.
- A statement period may appear only in the filename. Use it when the cells
  do not state one, normalized to a readable form such as "Jun 2026".
- The document belongs to the narrator, so their own name appears all over it —
  in the filename, as the royalty earner, as the account holder, as the "from"
  party on an invoice they issued. client_name is never them. It is the author,
  rights holder, or paying customer on the other side of the transaction, and
  it is what the project is matched on. If the only name available is the
  narrator's, return an empty string rather than using it.
- Return an empty rows array if this is not a financial document.`;

export async function POST(req: Request) {
  // The internal bearer is accepted so import-payments can reuse this parser
  // rather than carry a second copy of it. This route WRITES NOTHING — it reads
  // a document and returns rows.
  if (!(await isAdminOrInternal(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 10MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const content = buildContent(bytes, mediaTypeFor(file.name, file.type), PROMPT, file.name);

  try {
    const result = await extractRows<{ document_type: string; rows: unknown[] }>(content, SCHEMA);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      document_type: result.data.document_type,
      rows: result.data.rows ?? [],
    });
  } catch (err) {
    console.error("parse-document failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not read that document." }, { status: 502 });
  }
}
