import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { extractRows } from "@/lib/document-parse";
import { findMailFolder, graphGet, graphToken } from "@/lib/microsoft-graph";
import { EXPENSE_LABELS } from "@/lib/expenses";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The Outlook folder receipts are filed into. */
const FOLDER = "Business Expense";

type Message = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  bodyPreview?: string;
  body?: { content?: string };
};

type Extracted = {
  receipts: {
    email_id: string;
    incurred_on: string;
    vendor: string;
    description: string;
    amount: number;
    label: string;
    confidence: "high" | "medium" | "low";
    reason: string;
  }[];
};

const schema = {
  type: "object",
  properties: {
    receipts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The id given with the email." },
          incurred_on: { type: "string", description: "Purchase date, YYYY-MM-DD." },
          vendor: { type: "string", description: "Who was paid." },
          description: { type: "string", description: "What was bought, briefly." },
          amount: { type: "number", description: "Total charged, in dollars." },
          label: {
            type: "string",
            enum: EXPENSE_LABELS.map(e => e.label),
            description: "The closest category from the list.",
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string", description: "Why, when confidence is not high. Empty otherwise." },
        },
        required: ["email_id", "incurred_on", "vendor", "description", "amount", "label", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["receipts"],
  additionalProperties: false,
} as const;

const PROMPT = `You are reading emails from a US audiobook narrator's "Business Expense" folder to
turn them into bookkeeping entries.

For each email that is genuinely a receipt, invoice or purchase confirmation, return one entry.

Rules:
- Use the TOTAL actually charged, after discounts and including tax. Not a subtotal, not a
  pre-tax figure, not a list price.
- Use the purchase or charge date from the receipt itself. Only fall back to the email's
  received date when the body gives none.
- Skip anything that is not money already spent: shipping notices, order confirmations with
  no charge, marketing, renewal reminders for a future date, receipts for refunds.
- A refund or credit is not an expense. Skip it.
- Choose the closest label from the enum. When a purchase spans categories, choose the one the
  largest part of it belongs to.
- Mark confidence low or medium and say why when the total is ambiguous, the date is missing,
  the currency is not USD, or the email might not be a receipt at all.

Return an empty array if none of these are receipts.`;

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const token = await graphToken();
  if (!token) {
    return NextResponse.json(
      { error: "Outlook isn't connected. Connect Microsoft 365 in Settings first." },
      { status: 503 },
    );
  }

  const folder = await findMailFolder(FOLDER, token);
  if (!folder) {
    return NextResponse.json(
      { error: `No mail folder called "${FOLDER}" was found.` },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => null);
  const limit = Math.min(Number(body?.limit) || 40, 100);

  const mail = await graphGet<{ value: Message[] }>(
    `/me/mailFolders/${folder.id}/messages` +
      `?$top=${limit}&$orderby=receivedDateTime desc` +
      `&$select=id,subject,receivedDateTime,from,bodyPreview,body`,
    token,
  );

  const messages = mail?.value ?? [];
  if (!messages.length) {
    return NextResponse.json({ receipts: [], scanned: 0, alreadyImported: 0 });
  }

  // Anything imported before is dropped before it reaches the model: a folder
  // is rescanned to find what is new, and paying to re-read a year of receipts
  // every time would be the main cost of using this.
  const { data: seen } = await supabaseAdmin
    .from("expenses")
    .select("email_id")
    .in("email_id", messages.map(m => m.id));

  const already = new Set((seen ?? []).map(r => (r as { email_id: string }).email_id));
  const fresh = messages.filter(m => !already.has(m.id));

  if (!fresh.length) {
    return NextResponse.json({ receipts: [], scanned: messages.length, alreadyImported: already.size });
  }

  // HTML stripped and truncated: a receipt's useful content is a few hundred
  // characters buried in a few hundred kilobytes of table markup.
  const digest = fresh
    .map(m => {
      const text = (m.body?.content ?? m.bodyPreview ?? "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);

      return [
        `--- email_id: ${m.id}`,
        `from: ${m.from?.emailAddress?.name ?? ""} <${m.from?.emailAddress?.address ?? ""}>`,
        `subject: ${m.subject ?? ""}`,
        `received: ${m.receivedDateTime ?? ""}`,
        text,
      ].join("\n");
    })
    .join("\n\n");

  const outcome = await extractRows<Extracted>(
    [{ type: "text", text: `${PROMPT}\n\nEmails:\n\n${digest}` }],
    schema as unknown as Record<string, unknown>,
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  // Nothing is saved here. These are candidates for review, the same contract
  // the royalty importer keeps: money records are not written by a model
  // without someone having looked.
  return NextResponse.json({
    receipts: outcome.data.receipts ?? [],
    scanned: messages.length,
    alreadyImported: already.size,
    folder: folder.displayName,
  });
}
