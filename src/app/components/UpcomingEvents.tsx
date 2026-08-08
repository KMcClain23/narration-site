import { SITE_TIMEZONE } from "@/app/tools/analytics/timezone";

export type SiteEvent = {
  id: string;
  name: string;
  starts_on: string; // YYYY-MM-DD
  venue: string | null;
  city: string | null;
  url: string | null;
};

/**
 * Appearances that have not happened yet.
 *
 * Data with a date rather than hardcoded copy, because a hardcoded event does
 * not stop being "upcoming" once it is over — it sits there advertising a date
 * that has passed, which is worse than listing nothing. The query filters on
 * today, so the strip empties itself and then disappears.
 */
function formatEventDate(ymd: string): string {
  // Parsed at noon UTC so the date cannot slip either side when formatted in
  // Pacific — the same trap the analytics day labels hit.
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: SITE_TIMEZONE,
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function UpcomingEvents({ events }: { events: SiteEvent[] }) {
  if (!events.length) return null;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] mb-4">Where to find me</p>

      <ul className="space-y-4">
        {events.map((e) => {
          const place = [e.venue, e.city].filter(Boolean).join(", ");
          const body = (
            <>
              <span className="block text-sm font-semibold text-white">{e.name}</span>
              <span className="mt-0.5 block text-xs text-white/50">{formatEventDate(e.starts_on)}</span>
              {place && <span className="mt-0.5 block text-xs text-white/40">{place}</span>}
            </>
          );

          return (
            <li key={e.id} className="border-l-2 border-[#D4AF37]/50 pl-3">
              {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="group block">
                  {body}
                  <span className="mt-1 inline-block text-xs font-semibold text-[#D4AF37] group-hover:text-[#E0C15A]">
                    Event details
                  </span>
                </a>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-xs text-white/35">
        Coming to one of these? Say hello, or get in touch beforehand and we can find time to talk.
      </p>
    </div>
  );
}
