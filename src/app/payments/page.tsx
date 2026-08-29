import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PaymentsClient } from "@/components/payments/PaymentsClient";
import type { CardEconomics, MoneyCard, PaymentRow } from "@/lib/payments";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly and staleness has zero acceptable UX here —
// same convention as /schedule and /released.
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await assertAdmin();
  // THIS ADDS A THIRD QUERY, run in parallel with the two that were already
  // here, so the wall-clock cost is bounded by the slowest of three rather than
  // of two. It is a real extra round trip and it buys one definition of what a
  // card is worth: card_economics_for_session() is the same formula the six
  // remaining TypeScript surfaces implement, and check-card-economics pins them
  // to each other.
  const [cardsRes, paymentsRes, econRes] = await Promise.all([
    supabaseAdmin
      .from("board_cards")
      .select(
        "id, title, author, status, word_count, pfh_rate, payment_type, narration_format, narrator_share_percent, royalty_split_percent, co_narrator, production_type, production_company, released_at, deadline"
      )
      // Archived cards are excluded — money that was never going to arrive
      // shouldn't inflate the expected figure. Released cards ARE included,
      // unlike the board: a delivered book is exactly when payment is
      // outstanding. So are recast ones — the contract ends but the
      // partial project fee still has to be billed, so archiving a recast card
      // would hide the one invoice you still need to raise.
      .is("archived_at", null),
    supabaseAdmin
      .from("payments")
      .select(
        "id, card_id, kind, period, label, amount_expected, due_on, invoiced_on, invoice_number, amount_received, amount_gross, received_on, method, notes, sort_order, stripe_payment_link, paypal_payment_link, " +
          "payouts:payment_payouts(id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, paid_via, notes)"
      ),
    supabaseAdmin.rpc("card_economics_for_session"),
  ]);

  const cards = (cardsRes.data ?? []) as MoneyCard[];
  // Cast through unknown: supabase-js can't infer the shape of an embedded
  // relation from a string select, so it widens the result to an error type.
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[];
  // Null rather than an empty array when the read failed, so the client can
  // tell "no economics" from "economics that say nothing" — an empty list
  // meaning "the call failed" is the ambiguity this project keeps paying for.
  const economics = econRes.error ? null : ((econRes.data ?? []) as CardEconomics[]);

  return (
    <AdminLayout>
      <PaymentsClient cards={cards} payments={payments} economics={economics} />
    </AdminLayout>
  );
}
