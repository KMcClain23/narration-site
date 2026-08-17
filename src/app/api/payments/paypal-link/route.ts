import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { grossUp, PAYPAL_FEE } from "@/lib/business-identity";
import { paypalConfigured, paypalFetch, paypalErrorMessage } from "@/lib/paypal";

export const dynamic = "force-dynamic";

type InvoiceBody = {
  id?: string;
  href?: string;
  detail?: { metadata?: { recipient_view_url?: string } };
};

/**
 * Creating an invoice answers with a self link, not an id — `{ rel, href,
 * method }` — so the id has to come off the end of the URL. Later reads do
 * return `id`, hence both.
 */
function invoiceIdFrom(body: unknown): string | null {
  const b = body as InvoiceBody | null;
  if (b?.id) return b.id;
  const tail = b?.href?.split("/").filter(Boolean).pop();
  return tail || null;
}

/** The id of an invoice already raised under this number, if there is one. */
async function findInvoiceByNumber(invoiceNumber: string): Promise<string | null> {
  if (!invoiceNumber) return null;
  const res = await paypalFetch("/v2/invoicing/search-invoices?page_size=2", {
    method: "POST",
    json: { invoice_number: invoiceNumber },
  });
  if (!res.ok) return null;
  const items = (res.body as { items?: InvoiceBody[] } | null)?.items ?? [];
  return items.length === 1 ? invoiceIdFrom(items[0]) : null;
}

/**
 * The payer-facing URL, sending the invoice first if it is still a draft.
 *
 * Sending is what makes an invoice payable; both delivery flags are false so
 * PayPal emails nobody. This app sends its own branded email, and a second
 * PayPal-branded invoice for the same money in the same inbox is how a client
 * ends up paying twice or paying neither.
 */
async function payableLink(invoiceId: string): Promise<{ url?: string; error?: string }> {
  const read = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}`, { method: "GET" });
  if (!read.ok) return { error: paypalErrorMessage(read.status, read.body) };

  const viewUrl = (b: unknown) => (b as InvoiceBody | null)?.detail?.metadata?.recipient_view_url;

  if ((read.body as { status?: string } | null)?.status !== "DRAFT") {
    return { url: viewUrl(read.body) };
  }

  const sent = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    json: { send_to_recipient: false, send_to_invoicer: false },
  });
  // Reported rather than swallowed. Returning null here sent the caller on to
  // create a second invoice, which then failed as a duplicate — reporting the
  // duplicate instead of the real reason the first one never became payable.
  if (!sent.ok) return { error: paypalErrorMessage(sent.status, sent.body) };

  const reread = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}`, { method: "GET" });
  return { url: viewUrl(reread.body) };
}

/**
 * Raise a PayPal-hosted invoice for one payment and return its payable link.
 *
 * Create the draft, send it with delivery suppressed, then read back the
 * recipient view URL — PayPal has no single "make me a payable link" endpoint.
 * Suppressing delivery matters: this app sends its own branded email, and
 * letting PayPal also email would put two invoices for the same money in one
 * inbox.
 *
 * The stored link is returned unchanged if one exists, for the same reason as
 * the Stripe route: two live links for one debt is one too many.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!paypalConfigured()) {
    return NextResponse.json(
      { error: "PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const paymentId: string | undefined = body?.payment_id;
  const amountDue = Number(body?.amount_due);
  const title: string = String(body?.title ?? "Audiobook narration").slice(0, 200);
  const invoiceNumber: string = String(body?.invoice_number ?? "").slice(0, 60);
  const billToEmail: string = String(body?.bill_to_email ?? "").trim();
  const billToName: string = String(body?.bill_to_name ?? "").trim();

  if (!paymentId || !Number.isFinite(amountDue) || amountDue <= 0) {
    return NextResponse.json(
      { error: "A payment id and a positive amount are required." },
      { status: 400 },
    );
  }

  const { data: existing, error: readErr } = await supabaseAdmin
    .from("payments")
    .select("id, paypal_payment_link")
    .eq("id", paymentId)
    .single();

  if (readErr || !existing) {
    return NextResponse.json({ error: "That payment no longer exists." }, { status: 404 });
  }

  const { total, fee } = grossUp(amountDue, PAYPAL_FEE);

  if (existing.paypal_payment_link) {
    return NextResponse.json({ url: existing.paypal_payment_link, total, fee, reused: true });
  }

  try {
    // Recover an invoice this app already raised before trying to raise
    // another. Creating the draft can succeed and a later step still fail —
    // which burns the invoice number, since PayPal rejects a duplicate — and
    // without this the retry could never succeed. Searching by our own number
    // makes the whole route idempotent rather than only its happy path.
    const existingId = await findInvoiceByNumber(invoiceNumber);
    if (existingId) {
      const recovered = await payableLink(existingId);
      if (recovered.error) {
        return NextResponse.json({ error: recovered.error }, { status: 502 });
      }
      if (recovered.url) {
        await supabaseAdmin
          .from("payments")
          .update({ paypal_payment_link: recovered.url, paypal_invoice_id: existingId })
          .eq("id", paymentId);
        return NextResponse.json({ url: recovered.url, total, fee, reused: true });
      }
    }

    // The client is billed the grossed-up figure as a single line, so the
    // PayPal invoice and this app's PDF agree on one number. Splitting the fee
    // onto its own line would invite the client to query it there instead.
    const draft = await paypalFetch("/v2/invoicing/invoices", {
      method: "POST",
      json: {
        detail: {
          // Same identity as our own document, so a payment can be traced back
          // without matching on amount and date.
          invoice_number: invoiceNumber || undefined,
          currency_code: "USD",
          note: `Payment for ${title}.`,
        },
        // No invoicer block. PayPal derives it from the credentials, and
        // naming an email here fails with USER_NOT_FOUND whenever it isn't the
        // one on the authenticated account — which is always true in sandbox,
        // and would be true in live the day the business email changes.
        primary_recipients: billToEmail
          ? [
              {
                billing_info: {
                  email_address: billToEmail,
                  ...(billToName ? { name: { full_name: billToName } } : {}),
                },
              },
            ]
          : undefined,
        items: [
          {
            name: title.slice(0, 200),
            quantity: "1",
            unit_amount: { currency_code: "USD", value: total.toFixed(2) },
          },
        ],
      },
    });

    if (!draft.ok) {
      return NextResponse.json(
        { error: paypalErrorMessage(draft.status, draft.body) },
        { status: 502 },
      );
    }

    const invoiceId = invoiceIdFrom(draft.body);
    if (!invoiceId) {
      return NextResponse.json({ error: "PayPal did not return an invoice id." }, { status: 502 });
    }

    const made = await payableLink(invoiceId);
    if (made.error) {
      return NextResponse.json({ error: made.error }, { status: 502 });
    }
    const url = made.url;

    if (!url) {
      return NextResponse.json(
        { error: "PayPal created the invoice but returned no payable link." },
        { status: 502 },
      );
    }

    await supabaseAdmin
      .from("payments")
      .update({ paypal_payment_link: url, paypal_invoice_id: invoiceId })
      .eq("id", paymentId);

    return NextResponse.json({ url, total, fee, reused: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create the PayPal invoice.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
