import { renderToStaticMarkup } from "react-dom/server";
import { ExerciseTrend } from "@/components/exercises/history/exercise-trend";
import { TrendChart } from "@/components/exercises/history/trend-chart";
import type { TrendDto, TrendPointDto } from "@/lib/progression/history-types";

/**
 * Projected-RIR overlay (OVE-80) — rendering. The e1RM view offers the toggle
 * only when a session could project; the chart's accessible table carries the
 * projected column when the overlay is on, and says so where no RIR was
 * reported. (The toggle's on-state is a client interaction, verified in the
 * preview; these are the server-rendered contracts.)
 */

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const point = (
  value: number,
  dateLabel: string,
  projected?: number | null,
): TrendPointDto => ({
  dateIso: "2026-10-09",
  dateLabel,
  value,
  scheduledDeload: false,
  setsLabel: `3 × ${value} lb`,
  projected,
});

describe("TrendChart projected overlay", () => {
  const points = [point(240, "Oct 2", 260), point(245, "Oct 9", null)];

  it("adds the projected column to the accessible table when on", () => {
    const t = text(
      renderToStaticMarkup(
        <TrendChart
          points={points}
          unit="lb"
          seriesName="e1RM"
          label="e1RM per session"
          showProjected
        />,
      ),
    );
    expect(t).toContain("Projected from RIR (lb)");
    expect(t).toContain("260");
    // A session with no projectable set says so, never a number or a 0.
    expect(t).toContain("no RIR reported");
  });

  it("omits the projected column when off", () => {
    const t = text(
      renderToStaticMarkup(
        <TrendChart
          points={points}
          unit="lb"
          seriesName="e1RM"
          label="e1RM per session"
        />,
      ),
    );
    expect(t).not.toContain("Projected from RIR");
  });
});

describe("ExerciseTrend projected toggle", () => {
  const trend = (projected?: (number | null)[]): TrendDto => ({
    points: [
      point(240, "Oct 2", projected?.[0]),
      point(245, "Oct 9", projected?.[1]),
    ],
    latest: 245,
  });

  it("offers the projected toggle on the e1RM view when a session can project", () => {
    const html = renderToStaticMarkup(
      <ExerciseTrend
        e1rm={trend([260, null])}
        weight={trend()}
        reps={null}
        scopeName={null}
      />,
    );
    expect(html).toContain("Show projected capacity from the RIR you logged");
    expect(text(html)).toContain("Projected (RIR)");
  });

  it("offers no toggle when no session can project", () => {
    const html = renderToStaticMarkup(
      <ExerciseTrend
        e1rm={trend([null, null])}
        weight={trend()}
        reps={null}
        scopeName={null}
      />,
    );
    expect(html).not.toContain("Show projected capacity");
  });
});
