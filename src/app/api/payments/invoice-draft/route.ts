import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/**
 * The invoice as last edited, kept between visits.
 *
 * Everything except the number and the dates was regenerated on every open, so
 * corrected hours, hand-adjusted lines, a rewritten note and the whole-project
 * choice all vanished the moment the panel closed. An invoice is usually
 * assembled over more than one sitting; losing it between them is not a
 * reasonable thing to ask of anyone.
 *
 * Read and written through its own endpoint rather than the payments select, so
 * that a missing column degrades to "no saved draft" instead of breaking the
 * page that lists every payment.
 */

/**
 * Whether the failure is simply that the migration hasn't run.
 *
 * Two codes, because the two verbs fail differently: a read reaches Postgres
 * and gets 42703 ("column does not exist"), while a write is rejected earlier
 * by PostgREST against its cached schema, as PGRST204.
 *
 * REMOVAL CONDITION: delete this guard and its call sites once the
 * `invoice_draft` column exists in every environment that reads this table.
 * Until then a missing column is a migration window, not a fault; afterwards it
 * is a fault and should be allowed to look like one.
 *
 * Recorded because the eleven shims deleted in Stage 2B accumulated exactly for
 * want of this line: each was reasonable when written and none had an expiry.
 */
function migrationMissing(error: { code?: string; message?: string } | null): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    Boolean(error?.message?.includes("invoice_draft"))
  );
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const paymentId = req.nextUrl.searchParams.get("payment_id");
  if (!paymentId) return NextResponse.json({ draft: null });

  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("invoice_draft")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    if (migrationMissing(error)) return NextResponse.json({ draft: null, unavailable: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ draft: (data as { invoice_draft?: unknown } | null)?.invoice_draft ?? null });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const paymentId: string | undefined = body?.payment_id;
  if (!paymentId) {
    return NextResponse.json({ error: "A payment id is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("payments")
    .update({ invoice_draft: body?.draft ?? null })
    .eq("id", paymentId);

  if (error) {
    // Saving a draft must never be the thing that stops an invoice being sent,
    // so a missing column is reported as unavailable rather than as a failure.
    if (migrationMissing(error)) return NextResponse.json({ saved: false, unavailable: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
