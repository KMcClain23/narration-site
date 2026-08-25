import { adminType } from "@/lib/design-tokens";
import {
  BAR_SEGMENTS,
  MONTH_ABBR,
  STATUS_STYLES,
  summariseMonth,
  statusKeyFor,
  type CapacityStatusKey,
  type ScheduleGridCard,
} from "@/lib/schedule-capacity";

export type { ScheduleGridCard };

export function MonthlyScheduleGrid({ cards }: { cards: ScheduleGridCard[] }) {
  const now = new Date();
  const curYear = now.getFullYear();

  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      ...summariseMonth(cards, d.getFullYear(), d.getMonth()),
      label: MONTH_ABBR[d.getMonth()],
      isCurrentYear: d.getFullYear() === curYear,
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
        {(Object.keys(STATUS_STYLES) as CapacityStatusKey[]).map(key => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[key].barClass}`} />
            <span className={adminType.small}>{STATUS_STYLES[key].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
