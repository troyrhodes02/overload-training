"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TrendDto } from "@/lib/progression/history-types";
import { TrendChart } from "./trend-chart";

type View = {
  key: "e1rm" | "weight" | "reps";
  tab: string;
  trend: TrendDto;
  unit: "lb" | "reps";
  latestLabel: string;
  seriesName: string;
  single: (value: number) => string;
  footnote: (n: number) => string;
};

/**
 * The trend of one scope (design doc §4.5, §7 Screen 1; preview §03). Loaded
 * lifts switch between the e1RM estimate and the actual load with shadcn
 * Tabs (local state — pure presentation, R24); reps-only lifts have one Reps
 * view and no switch. Fewer than two points is a sentence, never a chart
 * (R15). Client island: it only renders what the server computed.
 */
export function ExerciseTrend({
  e1rm,
  weight,
  reps,
  scopeName,
}: {
  e1rm: TrendDto | null;
  weight: TrendDto | null;
  reps: TrendDto | null;
  /** The gym, for a machine or cable; null otherwise. */
  scopeName: string | null;
}) {
  const at = scopeName ? ` at ${scopeName}` : "";
  const sessions = (n: number) => `${n} session${n === 1 ? "" : "s"}`;
  const views: View[] = [];
  if (e1rm) {
    views.push({
      key: "e1rm",
      tab: "e1RM",
      trend: e1rm,
      unit: "lb",
      latestLabel: "Current",
      seriesName: "e1RM",
      single: (v) => `e1RM ${v} lb`,
      footnote: (n) => `${sessions(n)}${at} · Epley estimate`,
    });
  }
  if (weight) {
    views.push({
      key: "weight",
      tab: "Weight",
      trend: weight,
      unit: "lb",
      latestLabel: "Last",
      seriesName: "Heaviest working set",
      single: (v) => `${v} lb`,
      footnote: (n) => `${sessions(n)}${at} · heaviest working set`,
    });
  }
  if (reps) {
    views.push({
      key: "reps",
      tab: "Reps",
      trend: reps,
      unit: "reps",
      latestLabel: "Last",
      seriesName: "Most reps in a set",
      single: (v) => `${v} reps`,
      footnote: (n) => `${sessions(n)} · most reps in a working set`,
    });
  }
  if (views.length === 0) return null;

  const heading = (
    <h2 id="trend-heading" className="text-base font-medium">
      Trend
      {scopeName ? (
        <span className="font-normal text-muted-foreground">
          {" "}
          · {scopeName}
        </span>
      ) : null}
    </h2>
  );

  if (views.length === 1) {
    return (
      <section aria-labelledby="trend-heading" className="space-y-2">
        {heading}
        <TrendView view={views[0]} />
      </section>
    );
  }

  return (
    <section aria-labelledby="trend-heading">
      <Tabs defaultValue={views[0].key} className="gap-2">
        <div className="flex items-center justify-between gap-3">
          {heading}
          <TabsList aria-label="Trend view">
            {views.map((v) => (
              <TabsTrigger key={v.key} value={v.key} className="px-3">
                {v.tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {views.map((v) => (
          <TabsContent key={v.key} value={v.key}>
            <TrendView view={v} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function TrendView({ view }: { view: View }) {
  const { points, latest } = view.trend;
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No finished workouts yet.</p>
    );
  }
  if (points.length === 1) {
    return (
      <p className="text-sm text-muted-foreground">
        One session so far: {view.single(points[0].value)}. The trend starts at
        two.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {latest !== null ? (
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">
            {view.latestLabel}
          </div>
          <div className="text-lg font-semibold tabular-nums tracking-tight">
            {latest} {view.unit}
          </div>
        </div>
      ) : null}
      <TrendChart
        points={points}
        unit={view.unit}
        seriesName={view.seriesName}
        label={`${view.seriesName} per session`}
      />
      <p className="text-xs text-muted-foreground">
        {view.footnote(points.length)}
        {points.some((p) => p.scheduledDeload) ? " · ▫ deload week" : ""}
      </p>
    </div>
  );
}
