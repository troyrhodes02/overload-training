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
import type { TrendPointDto } from "@/lib/progression/history-types";

/**
 * One trend line of an exercise's history (Exercise History & PR Intelligence
 * design doc §4.5; preview §03): the e1RM estimate, the heaviest working-set
 * load, or (bodyweight) the most reps — one point per finished workout. The
 * Progressive Overload Engine's chart, generalised: a single accent line,
 * light grid, scheduled-deload points as hollow muted squares (shape + colour,
 * never colour alone). No arrows, no colour for a drop, no percentages: a
 * lower point is just lower. Read-only.
 *
 * Styled from theme tokens through CSS variables so it inverts with the
 * theme. A visually hidden table carries every point, with the sets behind
 * it, for screen readers.
 */
export function TrendChart({
  points,
  unit,
  seriesName,
  label,
  showProjected = false,
}: {
  points: TrendPointDto[];
  unit: "lb" | "reps";
  seriesName: string;
  label: string;
  /**
   * Draw the speculative RIR-projected line as a second dotted, muted series
   * (OVE-80). Off by default; the e1RM view toggles it on. Pure presentation —
   * the projected values are read straight from each point's `projected`.
   */
  showProjected?: boolean;
}) {
  const data = points.map((p) => ({
    date: p.dateLabel,
    value: p.value,
    scheduledDeload: p.scheduledDeload,
    sets: p.setsLabel,
    projected: p.projected ?? null,
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
              // Never below zero: a reps view (or a light load) mustn't show
              // an axis that starts at "-2 reps".
              domain={[(min: number) => Math.max(0, min - 5), "dataMax + 5"]}
              allowDecimals={false}
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
              formatter={(value, _name, item) => {
                // A session with no projectable set has a null projected value;
                // Recharts still lists the series, so drop that row rather than
                // print "null lb" (OVE-80).
                if (item?.dataKey === "projected") {
                  return value == null
                    ? null
                    : [`${value} ${unit}`, "Projected (RIR)"];
                }
                return [
                  `${value} ${unit} · ${(item?.payload as { sets?: string })?.sets ?? ""}`,
                  seriesName,
                ];
              }}
            />
            {showProjected ? (
              <Line
                type="monotone"
                dataKey="projected"
                stroke="var(--color-muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                connectNulls
                dot={{
                  r: 2.5,
                  fill: "var(--color-background)",
                  stroke: "var(--color-muted-foreground)",
                  strokeWidth: 1.5,
                }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={<DeloadAwareDot />}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="sr-only">{label}</figcaption>
      {/* A <table> ignores sr-only's 1px width and lays out at its content
          width, which scrolls a phone sideways; the wrapper clips it. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>
                {seriesName} ({unit})
              </th>
              {showProjected ? <th>Projected from RIR ({unit})</th> : null}
              <th>Sets</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${p.dateIso}-${i}`}>
                <td>{p.dateLabel}</td>
                <td>{p.value}</td>
                {showProjected ? (
                  <td>{p.projected ?? "no RIR reported"}</td>
                ) : null}
                <td>{p.setsLabel}</td>
                <td>{p.scheduledDeload ? "scheduled deload" : "normal"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** A filled accent dot, or a hollow muted square for a scheduled-deload point. */
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
