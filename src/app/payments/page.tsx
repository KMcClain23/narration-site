import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PaymentsClient } from "@/components/payments/PaymentsClient";
import type { MoneyCard, PaymentRow } from "@/lib/payments";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly and staleness has zero acceptable UX here —
// same convention as /schedule and /released.
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await assertAdmin();
  const [cardsRes, paymentsRes] = await Promise.all([
    supabaseAdmin
      .from("board_cards")
      .select(
        "id, title, author, status, word_count, pfh_rate, payment_type, narration_format, narrator_share_percent, production_type, production_company, released_at, deadline"
      )
      // Archived cards (recasted/canceled) are excluded — money that was never
      // going to arrive shouldn't inflate the expected figure. Released cards
      // ARE included, unlike the board: a delivered book is exactly when
      // payment is outstanding.
      .is("archived_at", null),
    supabaseAdmin
      .from("payments")
      .select(
        "id, card_id, label, amount_expected, due_on, invoiced_on, invoice_number, amount_received, received_on, method, notes, sort_order"
      ),
  ]);

  const cards = (cardsRes.data ?? []) as MoneyCard[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];

  return (
    <AdminLayout>
      <PaymentsClient cards={cards} payments={payments} />
    </AdminLayout>
  );
}
