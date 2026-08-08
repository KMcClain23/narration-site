import type { ChartDatum } from "./lib";

/**
 * A ranked breakdown: label, proportional bar, count, share.
 *
 * This was a Recharts horizontal BarChart, and the numbers only existed in a
 * tooltip — you could see that one country beat another and never by how much
 * without hovering each row in turn. Recharts' LabelList, which is the
 * documented way to put the value on the bar, renders nothing at all in 3.10
 * (verified against the real page: bars and axes present, no label layer), so
 * the fix would have been a fight with the chart library to reach a layout that
 * is a list of rows anyway.
 *
 * Plain markup instead. The count is always visible, the share gives the
 * comparison the eye actually wants, the full label survives in a tooltip when
 * it is too long for the column, and it ships no chart JavaScript.
 */
export function HorizontalBarChart({ data }: { data: ChartDatum[] }) {
  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const share = total ? Math.round((d.value / total) * 100) : 0;
        return (
          <div key={`${d.label}-${i}`} className="flex items-center gap-3">
            <span
              className="w-[8.5rem] shrink-0 truncate text-xs text-text-muted"
              title={d.label}
            >
              {d.label}
            </span>

            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-accent-amber"
                style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, opacity: 0.75 }}
              />
            </div>

            <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">
              {d.value.toLocaleString()}
            </span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-text-faint">
              {share}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
