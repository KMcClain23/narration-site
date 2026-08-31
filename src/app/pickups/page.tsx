import { assertAdmin } from "@/lib/require-admin";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PickupsClient, type AdminPickup } from "./PickupsClient";

export const dynamic = "force-dynamic";

/**
 * DEAN'S PICKUPS VIEW — every re-record request, where he works.
 *
 * THE READ may go through service_role, consistent with the rest of his admin,
 * and it does. THE RESOLVE MAY NOT: it calls `resolve_pickup()` with his own
 * session, from the client.
 *
 * That asymmetry is the whole design of this page. service_role could update
 * `pickups` directly and it would work — and it would be a SECOND enforcement
 * path for a rule the database already owns: only 'sent' pickups can be
 * resolved, only into 'resolved' or 'dismissed', and `resolved_by` is whoever
 * did it. Two implementations of one rule is exactly how the economics formula
 * drifted, and that took days to find because both halves looked right.
 *
 * One rule, one implementation, and the site is a caller of it like the phone is.
 */
export default async function PickupsPage() {
  await assertAdmin();

  // Titles come from a join because a pickup that says only "chapter 12" is not
  // actionable — he needs to know which book before anything else.
  const { data, error } = await supabaseAdmin
    .from("pickups")
    .select(
      "id, card_id, chapter, timestamp_at, kind, said, should_be, note, status, " +
        "assigned_narrator_id, created_at, sent_at, resolved_at, " +
        "board_cards(title), narrators(display_name)",
    )
    .order("created_at", { ascending: false });

  // A read that failed must say so. Rendering "no pickups" here would be the
  // same lie as an empty board meaning "denied".
  if (error) {
    return (
      <AdminLayout>
        <p className="mx-auto max-w-3xl rounded-xl border border-alert-red/50 bg-alert-red/10 px-4 py-3 text-sm text-alert-red">
          Could not read pickups: {error.message}
        </p>
      </AdminLayout>
    );
  }

  type Row = {
    id: string;
    card_id: string;
    chapter: string;
    timestamp_at: string;
    kind: string;
    said: string | null;
    should_be: string | null;
    note: string | null;
    status: string;
    assigned_narrator_id: string | null;
    created_at: string | null;
    sent_at: string | null;
    resolved_at: string | null;
    board_cards: { title: string } | { title: string }[] | null;
    narrators: { display_name: string } | { display_name: string }[] | null;
  };

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  const pickups: AdminPickup[] = ((data ?? []) as unknown as Row[]).map(r => ({
    id: r.id,
    cardId: r.card_id,
    cardTitle: one(r.board_cards)?.title ?? "Unknown book",
    chapter: r.chapter,
    timestampAt: r.timestamp_at,
    kind: r.kind,
    said: r.said,
    shouldBe: r.should_be,
    note: r.note,
    status: r.status,
    narratorName: one(r.narrators)?.display_name ?? null,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    resolvedAt: r.resolved_at,
  }));

  // AdminShell already provides <main className="flex-1 min-w-0 p-8">, so the
  // page brings no min-h-screen and no padding of its own — a second one nested
  // inside the first is how a page ends up scrolling twice.
  return (
    <AdminLayout>
      <PickupsClient pickups={pickups} />
    </AdminLayout>
  );
}
