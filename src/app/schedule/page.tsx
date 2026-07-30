import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AcceptingProjectsToggle } from "@/components/schedule/AcceptingProjectsToggle";
import { BookingWindowPicker } from "@/components/schedule/BookingWindowPicker";
import { MonthlyScheduleGrid } from "@/components/schedule/MonthlyScheduleGrid";
import { DueSoonSection } from "@/components/schedule/DueSoonSection";

// Same "active work" definition /api/board-v2/cards encodes (equivalent to
// excluding released/audition given the current status set) — queried
// directly here since this page is a server component, matching the
// existing admin/stats convention rather than fetching board-v2's own
// client-oriented API route.
const ACTIVE_STATUSES = ["contracted", "prepping", "recording", "editing"] as const;

export default async function SchedulePage() {
  const [settingsRes, cardsRes] = await Promise.all([
    supabaseAdmin
      .from("site_settings")
      .select("key, value")
      .in("key", ["accepting_projects", "available_months"]),
    supabaseAdmin
      .from("board_cards")
      .select("id, title, author, cover_url, deadline, status")
      .in("status", ACTIVE_STATUSES)
      .is("archived_at", null),
  ]);

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
  };

  // Cards with no deadline don't factor into the monthly grid or Due Soon —
  // they're already surfaced in Pipeline's "Later" subgroup on the Board.
  const datedCards = ((cardsRes.data ?? []) as BoardCardRow[]).filter(
    (c): c is BoardCardRow & { deadline: string } => Boolean(c.deadline)
  );

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <h1 className={adminType.titleLg}>Schedule</h1>

        {/* Section 1: Availability */}
        <section className="mt-8">
          <div className="flex flex-col gap-4 md:flex-row">
            <AcceptingProjectsToggle initial={acceptingProjects} />
            <BookingWindowPicker initial={availableMonths} />
          </div>
        </section>

        {/* Section 2: Monthly Schedule */}
        <section className="mt-8">
          <h2 className={adminType.titleLg}>Monthly Schedule</h2>
          <div className="mt-4">
            <MonthlyScheduleGrid cards={datedCards} />
          </div>
        </section>

        {/* Section 3: Due Soon */}
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
