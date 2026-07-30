import { adminType } from "@/lib/design-tokens";

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES = {
  open: { label: "Open", textClass: "text-text-muted", barClass: "bg-text-dim/50" },
  light: { label: "Light", textClass: "text-capacity-light", barClass: "bg-capacity-light" },
  busy: { label: "Busy", textClass: "text-accent-amber-bright", barClass: "bg-accent-amber-bright" },
  full: { label: "Full", textClass: "text-alert-red", barClass: "bg-alert-red" },
} as const;

type StatusKey = keyof typeof STATUS_STYLES;

// Thresholds are purely visual (per design decision) — never gate any action.
function statusKeyFor(count: number): StatusKey {
  if (count === 0) return "open";
  if (count === 1) return "light";
  if (count <= 3) return "busy";
  return "full";
}

const BAR_SEGMENTS = 5;

export type ScheduleGridCard = { id: string; title: string; deadline: string };

export function MonthlyScheduleGrid({ cards }: { cards: ScheduleGridCard[] }) {
  const now = new Date();
  const curYear = now.getFullYear();

  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthCards = cards.filter(c => c.deadline.startsWith(key));
    return {
      key,
      label: MONTH_ABBR[d.getMonth()],
      year: d.getFullYear(),
      isCurrentYear: d.getFullYear() === curYear,
      count: monthCards.length,
      titles: monthCards.map(c => c.title),
    };
  });

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {months.map(m => {
          const statusKey = statusKeyFor(m.count);
          const style = STATUS_STYLES[statusKey];
          const filled = Math.min(m.count, BAR_SEGMENTS);
          return (
            <div
              key={m.key}
              className="flex min-h-[150px] flex-col rounded-lg border border-surface-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[18px] font-bold uppercase tracking-wide text-text-primary">
                    {m.label}
                  </span>
                  {!m.isCurrentYear && (
                    <span className="ml-1 text-[11px] text-text-muted">&apos;{String(m.year).slice(2)}</span>
                  )}
                  <p className={`text-[13px] font-medium ${style.textClass}`}>{style.label}</p>
                </div>
                <span className="shrink-0 text-2xl font-bold text-text-primary">{m.count}</span>
              </div>

              <div className="mt-2 flex gap-1">
                {Array.from({ length: BAR_SEGMENTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${i < filled ? style.barClass : "bg-surface-border"}`}
                  />
                ))}
              </div>

              <div className="mt-2 flex-1 space-y-0.5">
                {m.titles.map(title => (
                  <p key={title} className="truncate text-[13px] text-text-body">
                    {title}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-4">
        {(Object.keys(STATUS_STYLES) as StatusKey[]).map(key => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[key].barClass}`} />
            <span className={adminType.small}>{STATUS_STYLES[key].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
