import { AdminLayout } from "@/components/admin/AdminLayout";
import { assertAdmin } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ActivityEvent } from "@/lib/activity-wording";
import { ActivityClient } from "./ActivityClient";

export const dynamic = "force-dynamic";

/**
 * THE LOG. Everything that has happened to every book, newest first.
 *
 * Admin only for now — assertAdmin here, and activity_feed applies
 * assert_board_access again against the caller. Two layers because a route that
 * reads through the service key has nothing else in front of it.
 *
 * Email and push will read the same table. Neither exists yet; this page is the
 * thing that proves the log is worth reading before anything is built on it.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  await assertAdmin();
  const { book } = await searchParams;
  const cardId = book && /^[0-9a-f-]{36}$/.test(book) ? book : null;

  const [feed, books] = await Promise.all([
    supabaseAdmin.rpc("activity_feed", { p_card_id: cardId, p_limit: 300 }),
    supabaseAdmin.rpc("activity_feed_books"),
  ]);

  // A read that failed must say so. "No activity yet" for a broken query is the
  // same lie as an empty board meaning denied.
  if (feed.error) {
    return (
      <AdminLayout>
        <p className="mx-auto max-w-3xl rounded-xl border border-alert-red/50 bg-alert-red/10 px-4 py-3 text-sm text-alert-red">
          Could not read the activity log: {feed.error.message}
        </p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <ActivityClient
        events={(feed.data ?? []) as ActivityEvent[]}
        books={(books.data ?? []) as { card_id: string; book_title: string; events: number }[]}
        selected={cardId}
      />
    </AdminLayout>
  );
}
