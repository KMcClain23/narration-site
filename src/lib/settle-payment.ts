import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paymentNarratorShare, type MoneyCard, type PaymentRow } from "@/lib/payments";
import { closePaymentLinks, type PaymentLinkRow } from "@/lib/close-payment-links";
import { notifyPaymentReceived, type OwedPayee } from "@/lib/notify-payment";
import { venmoPayUrl } from "@/lib/business-identity";

/**
 * Record that a provider collected an invoice, and shut the other ways to pay.
 *
 * Shared by both webhooks so Stripe and PayPal settle a payment identically —
 * two copies of this would drift, and the one that drifted would be the one
 * that quietly recorded the wrong figure.
 */

const CARD_SELECT =
  "id, title, author, status, word_count, pfh_rate, payment_type, narration_format, " +
  "narrator_share_percent, co_narrator, production_type, production_company, released_at, deadline";

const PAYMENT_SELECT =
  "id, card_id, kind, period, label, amount_expected, due_on, invoiced_on, invoice_number, " +
  "amount_received, amount_gross, received_on, method, notes, sort_order, stripe_payment_link, " +
  "stripe_payment_link_id, paypal_payment_link, paypal_invoice_id, payment_links_closed_at, " +
  "payouts:payment_payouts(id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, paid_via, notes)";

export type SettleResult = { settled: boolean; reason: string };

/** Find the payment a provider's identifier belongs to. */
export async function findPaymentBy(
  column: "stripe_payment_link_id" | "paypal_invoice_id",
  value: string,
): Promise<string | null> {
  if (!value) return null;
  const { data } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq(column, value)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Who is still owed out of a project, with the ways to pay each of them.
 *
 * Across every payment on the card rather than the one that just settled: an
 * editor is owed for the book, not for whichever instalment happened to arrive.
 *
 * Contact details are looked up by name, the same free-text join the contacts
 * pages use, and any failure here degrades to a name and an amount. A missing
 * Venmo handle must never cost the narrator the notification itself.
 */
async function owedOnProject(rows: PaymentRow[], projectTitle: string): Promise<OwedPayee[]> {
  const byName = new Map<string, number>();
  for (const r of rows) {
    for (const p of r.payouts ?? []) {
      if (p.paid_on) continue;
      const amount = Number(p.amount) || 0;
      if (amount <= 0) continue;
      const name = p.payee_name?.trim() || "Unnamed";
      byName.set(name, (byName.get(name) ?? 0) + amount);
    }
  }
  if (byName.size === 0) return [];

  const contacts = new Map<string, { email: string; venmo: string }>();
  try {
    const [editors, coNarrators] = await Promise.all([
      supabaseAdmin.from("editors").select("name, email, venmo"),
      supabaseAdmin.from("co_narrators").select("name, email"),
    ]);
    for (const c of coNarrators.data ?? []) {
      contacts.set(String(c.name).trim().toLowerCase(), { email: c.email ?? "", venmo: "" });
    }
    // Editors last so their Venmo handle wins if a name appears in both.
    for (const e of editors.data ?? []) {
      contacts.set(String(e.name).trim().toLowerCase(), { email: e.email ?? "", venmo: e.venmo ?? "" });
    }
  } catch {
    // No contacts table yet, or the query failed. Names and amounts still send.
  }

  return [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => {
      const contact = contacts.get(name.toLowerCase());
      return {
        name,
        amount,
        venmoUrl: contact?.venmo
          ? venmoPayUrl(contact.venmo, amount, `${projectTitle} · ${name}`.trim())
          : "",
        email: contact?.email ?? "",
      };
    });
}

export async function settleFromProvider(paymentId: string, method: string): Promise<SettleResult> {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", paymentId)
    .single();

  if (!payment) return { settled: false, reason: "payment no longer exists" };

  const row = payment as unknown as PaymentRow & { card_id: string; method: string };

  // A provider can deliver the same event more than once, and PayPal will
  // resend one it thinks was not acknowledged. Settling twice would overwrite a
  // figure that may since have been corrected by hand.
  if (Number(row.amount_received) > 0) {
    return { settled: false, reason: "already recorded as received" };
  }

  const { data: card } = await supabaseAdmin
    .from("board_cards")
    .select(CARD_SELECT)
    .eq("id", row.card_id)
    .single();

  if (!card) return { settled: false, reason: "project no longer exists" };

  const { data: siblings } = await supabaseAdmin
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("card_id", row.card_id);

  const rows = (siblings ?? []) as unknown as PaymentRow[];
  // This payment, not the project. A card holding a deposit row and a delivery
  // row must not credit both when one of them is paid.
  const due = paymentNarratorShare(row, card as unknown as MoneyCard, rows);

  if (due == null) return { settled: false, reason: "no amount could be determined" };

  await supabaseAdmin
    .from("payments")
    .update({
      amount_received: Math.round(due * 100) / 100,
      received_on: new Date().toISOString().split("T")[0],
      // Only fills a blank: a method entered by hand is first-hand and outranks
      // one inferred from whichever provider happened to fire.
      ...(row.method?.trim() ? {} : { method }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  // The invoice is settled, so every remaining way to pay it is retired —
  // including, harmlessly, the one just used.
  await closePaymentLinks({
    ...(payment as unknown as PaymentLinkRow),
    method: row.method ?? "",
  });

  const project = card as unknown as { title?: string; author?: string };
  await notifyPaymentReceived({
    amount: due,
    method,
    projectTitle: project.title ?? "Untitled",
    author: project.author ?? "",
    invoiceNumber: row.invoice_number ?? "",
    owed: await owedOnProject(rows, project.title ?? ""),
  });

  return { settled: true, reason: `recorded ${due.toFixed(2)} via ${method}` };
}
