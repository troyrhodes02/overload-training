/**
 * Pitch 21i RD-5–RD-7 (spec §12 "Mobile"): the one native chart places the
 * server's points and computes nothing about training — no interpolation, no
 * zero for a missing session, every point reachable, a summary for VoiceOver.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { TrendPointDto } from "@overload/shared/contracts/exercise-history";
import {
  chartGeometry,
  chartSummary,
  MIN_POINT_SPACING,
  nearestIndex,
  niceStep,
  PLOT_HEIGHT,
  pointReadout,
  yScale,
  Y_AXIS_WIDTH,
} from "../src/exercise-history/chart-model";
import { TrendChart } from "../src/exercise-history/TrendChart";
import { Providers } from "./harness";

jest.mock("../src/ui/haptics", () => ({
  haptic: {
    selection: jest.fn(),
    light: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

const pt = (value: number, i: number, deload = false): TrendPointDto => ({
  dateIso: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`,
  dateLabel: `Day ${i + 1}`,
  value,
  scheduledDeload: deload,
  setsLabel: `${value} × 5`,
});

describe("chart geometry", () => {
  it("nice steps and a y range that holds every value", () => {
    expect([niceStep(3), niceStep(7), niceStep(12), niceStep(0.4)]).toEqual([
      5, 10, 20, 0.5,
    ]);
    const { lo, hi, ticks } = yScale([205, 214, 228, 239]);
    expect(lo).toBeLessThanOrEqual(205);
    expect(hi).toBeGreaterThanOrEqual(239);
    expect(ticks[0]).toBe(lo);
    expect(ticks[ticks.length - 1]).toBe(hi);
  });

  it("a flat series gets headroom instead of sitting on an edge", () => {
    const { lo, hi } = yScale([185, 185, 185]);
    expect(lo).toBeLessThan(185);
    expect(hi).toBeGreaterThan(185);
  });

  it("places exactly the server's points, evenly spaced, inside the plot", () => {
    const pts = [pt(205, 0), pt(214, 1), pt(209, 2, true), pt(239, 3)];
    const g = chartGeometry(pts, 360);
    expect(g.points.map((p) => p.value)).toEqual([205, 214, 209, 239]);
    expect(g.points.map((p) => p.deload)).toEqual([false, false, true, false]);
    expect(g.segments).toHaveLength(3);
    expect(g.scrolls).toBe(false);
    const xs = g.points.map((p) => p.x);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[3] - xs[2]);
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(PLOT_HEIGHT);
    }
    // Higher values are higher on screen.
    expect(g.points[3].y).toBeLessThan(g.points[0].y);
    expect(g.xLabels[g.xLabels.length - 1].label).toBe("Day 4");
  });

  it("a long history scrolls instead of crowding points", () => {
    const pts = Array.from({ length: 60 }, (_, i) => pt(200 + (i % 7), i));
    const g = chartGeometry(pts, 360);
    expect(g.scrolls).toBe(true);
    expect(g.spacing).toBe(MIN_POINT_SPACING);
    expect(g.contentWidth).toBeGreaterThan(360 - Y_AXIS_WIDTH);
    expect(g.points).toHaveLength(60);
    // Labels never crowd: at least ~72 pt apart.
    for (let i = 1; i < g.xLabels.length; i++) {
      expect(g.xLabels[i].x - g.xLabels[i - 1].x).toBeGreaterThanOrEqual(56);
    }
  });

  it("finds the nearest point to a touch", () => {
    const g = chartGeometry([pt(1, 0), pt(2, 1), pt(3, 2)], 300);
    expect(nearestIndex(g, 0)).toBe(0);
    expect(nearestIndex(g, g.points[1].x + 3)).toBe(1);
    expect(nearestIndex(g, 10_000)).toBe(2);
  });

  it("says the trend in one sentence, and the selected point in another", () => {
    const pts = [pt(205, 0), pt(239, 1)];
    expect(chartSummary("e1RM", "lb", pts)).toBe(
      "e1RM trend, 2 sessions, from 205 pounds on Day 1 to 239 pounds on Day 2; lowest 205, highest 239",
    );
    const g = chartGeometry(pts, 300);
    expect(pointReadout(g.points[1], "lb")).toBe("Day 2 · 239 lb · 239 × 5");
  });
});

describe("TrendChart", () => {
  it("draws one dot per point and selects the newest; a tap selects another", async () => {
    const pts = [pt(205, 0), pt(214, 1), pt(239, 2)];
    await render(
      <Providers>
        <TrendChart points={pts} unit="lb" title="e1RM" />
      </Providers>,
    );
    await fireEvent(screen.getByTestId("trend-chart"), "layout", {
      nativeEvent: { layout: { width: 360, height: 200 } },
    });
    expect(screen.getAllByTestId("trend-point")).toHaveLength(3);
    expect(screen.getAllByTestId("trend-segment")).toHaveLength(2);
    expect(screen.getByText("Day 3 · 239 lb · 239 × 5")).toBeTruthy();
    await fireEvent.press(screen.getAllByTestId("trend-point")[0]);
    expect(screen.getByText("Day 1 · 205 lb · 205 × 5")).toBeTruthy();
    expect(screen.getByTestId("trend-chart").props.accessibilityLabel).toMatch(
      /^e1RM trend, 3 sessions/,
    );
  });
});
