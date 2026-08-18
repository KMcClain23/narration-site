import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AcceptingProjectsToggle } from "@/components/schedule/AcceptingProjectsToggle";
import { BookingWindowPicker } from "@/components/schedule/BookingWindowPicker";
import { MonthlyScheduleGrid } from "@/components/schedule/MonthlyScheduleGrid";
import { DueSoonSection } from "@/components/schedule/DueSoonSection";
import { CapacityCalendar } from "@/components/schedule/CapacityCalendar";
import type { CapacityCard, TimeBlock } from "@/lib/capacity";
import { assertAdmin } from "@/lib/require-admin";

// Same "active work" definition /api/board-v2/cards encodes (equivalent to
// excluding released/audition given the current status set) — queried
// directly here since this page is a server component, matching the
// existing admin/stats convention rather than fetching board-v2's own
// client-oriented API route.
const ACTIVE_STATUSES = ["contracted", "prepping", "recording", "editing"] as const;

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await assertAdmin();
  const [settingsRes, cardsRes, blocksRes] = await Promise.all([
    supabaseAdmin
      .from("site_settings")
      .select("key, value")
      .in("key", ["accepting_projects", "available_months"]),
    supabaseAdmin
      .from("board_cards")
      // One string literal, not a concatenation: supabase-js infers the row
      // type from the literal, and splitting it makes every field an error type.
      .select("id, title, author, cover_url, deadline, status, word_count, narration_format, narrator_share_percent, recording_dates")
      .in("status", ACTIVE_STATUSES)
      .is("archived_at", null),
    // Only what is still ahead: the calendar starts today, so blocks behind it
    // would be fetched and thrown away.
    supabaseAdmin
      .from("time_blocks")
      .select("id, on_date, hours, label, card_id")
      .gte("on_date", new Date().toISOString().slice(0, 10)),
  ]);

  const blocks: TimeBlock[] = ((blocksRes.data ?? []) as TimeBlock[]).map(b => ({
    ...b,
    hours: Number(b.hours) || 0,
  }));

  const settingsByKey = new Map((settingsRes.data ?? []).map(r => [r.key, r.value]));
  const acceptingProjects = settingsByKey.get("accepting_projects") !== "false";
  let availableMonths: number[] = [];
  try {
    const raw = settingsByKey.get("available_months");
    if (raw) availableMonths = JSON.parse(raw);
  } catch {
    availableMonths = [];
  }

  type BoardCardRow = {
    id: string;
    title: string;
    author: string;
    cover_url: string | null;
    deadline: string | null;
    status: string;
    word_count: number | null;
    narration_format: string | null;
    narrator_share_percent: number | null;
    recording_dates: string[] | null;
  };

  // Every active book, deadline or not: one with chosen recording days occupies
  // the booth whether or not anyone has written down when it is due.
  const capacityCards: CapacityCard[] = ((cardsRes.data ?? []) as BoardCardRow[]).map(c => ({
    id: c.id,
    title: c.title,
    word_count: c.word_count,
    narration_format: c.narration_format,
    narrator_share_percent: c.narrator_share_percent,
    deadline: c.deadline,
    recording_dates: Array.isArray(c.recording_dates) ? c.recording_dates : [],
  }));

  // Cards with no deadline don't factor into the monthly grid or Due Soon —
  // they're already surfaced in Pipeline's "Later" subgroup on the Board.
  const datedCards = ((cardsRes.data ?? []) as BoardCardRow[]).filter(
    (c): c is BoardCardRow & { deadline: string } => Boolean(c.deadline)
  );

  return (
    <AdminLayout>
      {/* Single column again. Today's agenda moved into the sidebar, where it
          is visible on every page rather than only on the one page that
          already tells you what today holds. */}
      <div className="mx-auto max-w-[1200px]">
        <h1 className={adminType.titleLg}>Schedule</h1>

        {/* Section 1: Availability */}
        <section className="mt-8">
          <div className="flex flex-col gap-4 md:flex-row">
            <AcceptingProjectsToggle initial={acceptingProjects} />
            <BookingWindowPicker initial={availableMonths} />
          </div>
        </section>

        {/* Section 2: Capacity. Deliberately above the monthly grid, which
            says when books are due; this says whether there is room for
            another one, which is the question asked far more often. */}
        <section className="mt-8">
          <h2 className={adminType.titleLg}>Where the time is</h2>
          <div className="mt-4">
            <CapacityCalendar cards={capacityCards} initialBlocks={blocks} />
          </div>
        </section>

        {/* Section 3: Monthly Schedule */}
        <section className="mt-8">
          <h2 className={adminType.titleLg}>Monthly Schedule</h2>
          <div className="mt-4">
            <MonthlyScheduleGrid cards={datedCards} />
          </div>
        </section>

        {/* Section 4: Due Soon */}
        <section className="mt-8">
          <h2 className={adminType.titleLg}>Due Soon</h2>
          <div className="mt-4">
            <DueSoonSection cards={datedCards} />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
