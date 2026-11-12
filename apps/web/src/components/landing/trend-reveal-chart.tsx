"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * A marketing e1RM trend, built from inline demo data in the same visual
 * language as the real exercise chart (`trend-chart.tsx`): one thin accent
 * line, a light grid, a token-styled tooltip, and hollow dots for the mesocycle
 * deload week. The only addition is a one-time line-draw when the section
 * scrolls into view. It represents the real product — e1RM by session, deload
 * weeks marked — and invents no numbers beyond this demo series.
 *
 * Reduced-motion visitors see the finished line with no draw.
 */

type Point = {
  date: string;
  value: number;
  sets: string;
  scheduledDeload: boolean;
};

// Demo data: a bench e1RM climbing through a 5-week block, dipping on the
// scheduled deload week, then continuing up. lbs, consistent with the app.
const DATA: Point[] = [
  { date: "Sep 2", value: 205, sets: "185 × 8", scheduledDeload: false },
  { date: "Sep 9", value: 209, sets: "185 × 9", scheduledDeload: false },
  { date: "Sep 16", value: 214, sets: "190 × 8", scheduledDeload: false },
  { date: "Sep 23", value: 217, sets: "190 × 9", scheduledDeload: false },
  { date: "Sep 30", value: 208, sets: "155 × 8", scheduledDeload: true },
  { date: "Oct 7", value: 223, sets: "195 × 8", scheduledDeload: false },
  { date: "Oct 14", value: 228, sets: "195 × 9", scheduledDeload: false },
  { date: "Oct 21", value: 232, sets: "200 × 8", scheduledDeload: false },
];

function DeloadAwareDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  if (payload?.scheduledDeload) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--color-background)"
        stroke="var(--color-muted-foreground)"
        strokeWidth={2}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--color-primary)" />;
}

export function TrendRevealChart() {
  const ref = useRef<HTMLDivElement>(null);
  const [draw, setDraw] = useState(false);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // State is only set from the observer callback, where reduced motion is
    // read at reveal time — nothing is set synchronously in the effect body.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const reduced = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            setAnimate(!reduced);
            setDraw(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="space-y-3">
      <div ref={ref} className="h-[240px] w-full md:h-[300px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={DATA}
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
              width={44}
              domain={[(min: number) => Math.max(0, min - 8), "dataMax + 8"]}
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
              formatter={(value, _name, item) => [
                `${value} lb · ${(item?.payload as Point)?.sets ?? ""}`,
                "Est. 1RM",
              ]}
            />
            {draw ? (
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={<DeloadAwareDot />}
                activeDot={{ r: 5 }}
                isAnimationActive={animate}
                animationDuration={1100}
                animationEasing="ease-out"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="text-sm text-muted-foreground">
        Estimated 1-rep max by session. The hollow point is the scheduled deload
        week — marked, not hidden.
      </figcaption>

      {/* Accessible equivalent of the chart. */}
      <div className="sr-only">
        <table>
          <caption>Estimated 1-rep max by session, in pounds</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Est. 1RM (lb)</th>
              <th>Top set</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {DATA.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{p.value}</td>
                <td>{p.sets}</td>
                <td>{p.scheduledDeload ? "scheduled deload" : "normal"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
