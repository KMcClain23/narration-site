"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDatum } from "./lib";

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
          contentStyle={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-surface-border)",
            borderRadius: 8,
            color: "var(--color-text-primary)",
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-text-muted)" }}
          formatter={value => [formatValue(Number(value), format, unit), ""]}
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
