"use client";

import { adminType } from "@/lib/design-tokens";
import { useIsDesktop } from "@/components/admin/useIsDesktop";
import { MonthlyScheduleGrid } from "./MonthlyScheduleGrid";
import { QuarterlySchedule } from "./QuarterlySchedule";
import type { ScheduleGridCard } from "@/lib/schedule-capacity";

/**
 * The one section of Schedule that renders differently on a phone.
 *
 * The page itself stays a server component — it queries Supabase directly and
 * is force-dynamic, so useIsDesktop cannot live there the way it does on the
 * Board, whose whole page is a client component. Confining the split to this
 * wrapper keeps Availability, capacity and Due Soon server-rendered and
 * untouched; those three already collapse to a single column below their
 * breakpoints and needed nothing.
 *
 * The heading differs because both views are honestly named: twelve months
 * rolling forward on desktop, one calendar quarter at a time on mobile.
 */
export function ScheduleMonths({ cards }: { cards: ScheduleGridCard[] }) {
  const isDesktop = useIsDesktop();

  return (
    <section className="mt-8">
      <h2 className={adminType.titleLg}>{isDesktop ? "Monthly Schedule" : "Quarterly Schedule"}</h2>
      <div className="mt-4">
        {isDesktop ? <MonthlyScheduleGrid cards={cards} /> : <QuarterlySchedule cards={cards} />}
      </div>
    </section>
  );
}
