import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { grossUp, PAYPAL_FEE, BUSINESS } from "@/lib/business-identity";
import { paypalConfigured, paypalFetch, paypalErrorMessage } from "@/lib/paypal";

export const dynamic = "force-dynamic";

type InvoiceBody = { id?: string; detail?: { metadata?: { recipient_view_url?: string } } };

/**
 * Raise a PayPal-hosted invoice for one payment and return its payable link.
 *
 * Three calls, because PayPal has no single "make me a payable link" endpoint:
 * create the draft, send it with delivery suppressed, then read back the
 * recipient view URL. Suppressing delivery matters — this app sends its own
 * email with its own branding, and letting PayPal also email the client would
 * put two different invoices for the same money in their inbox.
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
        invoicer: {
          business_name: BUSINESS.company,
          email_address: BUSINESS.email,
        },
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

    const invoiceId = (draft.body as InvoiceBody)?.id;
    if (!invoiceId) {
      return NextResponse.json({ error: "PayPal did not return an invoice id." }, { status: 502 });
    }

    // Sending is what makes an invoice payable; the flags stop PayPal emailing
    // anyone, so the only delivery is this app's own.
    const sent = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}/send`, {
      method: "POST",
      json: { send_to_recipient: false, send_to_invoicer: false },
    });

    if (!sent.ok) {
      return NextResponse.json(
        { error: paypalErrorMessage(sent.status, sent.body) },
        { status: 502 },
      );
    }

    const read = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}`, { method: "GET" });
    const url = (read.body as InvoiceBody)?.detail?.metadata?.recipient_view_url;

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
