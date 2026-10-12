"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { E1rmPointDto } from "@/lib/progression/types";

/**
 * The per-exercise e1RM trend (design Screen 4; spec §7, R48–R50). One readable
 * line, not a dashboard: a single series on the accent, light grid, scheduled-
 * deload points marked with a distinct hollow square (shape + muted colour, R39).
 * Read-only — corrections happen through the Pitch 4 history editor.
 *
 * Styled from theme tokens via CSS variables so it inverts cleanly in dark mode.
 * A visually-hidden table carries the same data for screen readers.
 */
export function E1rmChart({
  points,
  label,
}: {
  points: E1rmPointDto[];
  label: string;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No logged sessions yet. Train this lift to see its trend.
      </div>
    );
  }

  const data = points.map((p) => ({
    date: p.dateLabel,
    e1rm: p.e1rm,
    scheduledDeload: p.scheduledDeload,
  }));

  return (
    <figure className="space-y-1">
      <div className="h-[180px] w-full md:h-[240px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
            />
            <YAxis
              width={48}
              domain={["dataMin - 5", "dataMax + 5"]}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--color-foreground)",
              }}
              labelStyle={{ color: "var(--color-muted-foreground)" }}
              formatter={(value) => [`${value} lb`, "e1RM"]}
            />
            <Line
              type="monotone"
              dataKey="e1rm"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={<DeloadAwareDot />}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible equivalent of the line. */}
      <figcaption className="sr-only">{label}</figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>e1RM (lb)</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.dateIso}>
              <td>{p.dateLabel}</td>
              <td>{p.e1rm}</td>
              <td>{p.scheduledDeload ? "scheduled deload" : "normal"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A normal filled accent dot, or a hollow muted square for a scheduled-deload point. */
function DeloadAwareDot(props: {
  cx?: number;
  cy?: number;
  payload?: { scheduledDeload?: boolean };
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  if (payload?.scheduledDeload) {
    return (
      <rect
        x={cx - 3.5}
        y={cy - 3.5}
        width={7}
        height={7}
        fill="var(--color-background)"
        stroke="var(--color-muted-foreground)"
        strokeWidth={1.5}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={3} fill="var(--color-primary)" />;
}
