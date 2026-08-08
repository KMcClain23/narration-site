"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDatum } from "./lib";

/**
 * The tooltip, drawn here rather than configured.
 *
 * Recharts' default prints `name : value`, and with the series name blank that
 * rendered as a stray colon in front of every figure — "​: 22 events" — on a
 * panel whose background (#232b3f) sat close enough to the chart's own that it
 * barely separated from it, at 12px.
 *
 * Each of those has a prop to fix it, but the props are the problem: LabelList,
 * the documented way to put a value on a bar, renders nothing at all in this
 * version. Owning the markup means the result is whatever this file says it is.
 */
function ChartTooltip({
  active,
  payload,
  label,
  format,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string;
  format: "count" | "currency";
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-[10px] border border-[#4a5470] bg-[#2f3750] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
      <div className="text-[11px] uppercase tracking-wider text-[#aeb4c7]">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold text-[#f5f6fa] tabular-nums">
        {formatValue(value, format, unit)}
      </div>
    </div>
  );
}

/** Compact axis ticks — "1.2k" rather than "1,200" in a narrow gutter. */
function axisTick(value: number, format: "count" | "currency"): string {
  const compact =
    Math.abs(value) >= 1000
      ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
      : value.toLocaleString();
  return format === "currency" ? `$${compact}` : compact;
}

// Shared by Release Pace, Earnings, and the Site Analytics daily-activity
// chart — all three are single-series, category-labeled bar charts that only
// differ in bar count, color, tooltip formatting, and label density.
//
// Tooltip formatting is driven by a `format`/`unit` pair instead of a
// callback prop — this is a client component, and functions can't be passed
// as props from the server components that render it.
function formatValue(value: number, format: "count" | "currency", unit?: string): string {
  if (format === "currency") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString();
}

export function VerticalBarChart({
  data,
  height = 220,
  color = "var(--color-accent-amber)",
  format = "count",
  unit,
  sparseLabels = false,
  highlightLast = false,
}: {
  data: ChartDatum[];
  height?: number;
  color?: string;
  format?: "count" | "currency";
  unit?: string;
  sparseLabels?: boolean;
  highlightLast?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-surface-border)" />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-surface-border)" }}
          tickLine={false}
          interval={sparseLabels ? "preserveStartEnd" : 0}
          tickFormatter={(value: string, index: number) =>
            sparseLabels && index !== 0 && index !== data.length - 1 ? "" : value
          }
        />
        {/* Was hidden, which left the bars with no scale at all — you could see
            that one day beat another and never how many either was without
            hovering it. */}
        <YAxis
          width={44}
          allowDecimals={false}
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => axisTick(v, format)}
        />
        <Tooltip
          cursor={{ fill: "var(--color-surface-border)", opacity: 0.35 }}
          content={<ChartTooltip format={format} unit={unit} />}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={highlightLast && i === data.length - 1 ? "var(--color-accent-amber-bright)" : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
