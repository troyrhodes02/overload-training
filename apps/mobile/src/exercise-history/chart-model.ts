import type { TrendPointDto } from "@overload/shared/contracts/exercise-history";

/**
 * The one native line chart's geometry (Pitch 21i RD-5–RD-7). Pure and
 * presentational: it places the SERVER's points and computes nothing about
 * training. One point per finished workout, evenly spaced (as the web's
 * chart), never interpolated, never a zero for a missing session. A flat
 * series gets a little headroom so it isn't drawn on an edge.
 */

/** Points are never closer than this, so each stays tappable (RD-7). */
export const MIN_POINT_SPACING = 28;
/** The y-axis label column, outside the scrolling plot. */
export const Y_AXIS_WIDTH = 40;
export const PLOT_HEIGHT = 160;
const PAD_X = 14;
const PAD_TOP = 12;
const PAD_BOTTOM = 12;

export type ChartPoint = {
  index: number;
  x: number;
  y: number;
  value: number;
  dateLabel: string;
  setsLabel: string;
  deload: boolean;
};

export type ChartSegment = {
  /** The segment's center and length, and its angle in radians. */
  cx: number;
  cy: number;
  length: number;
  angle: number;
};

export type ChartGeometry = {
  /** The scrolling plot's width: the screen's, or more for a long history. */
  contentWidth: number;
  scrolls: boolean;
  spacing: number;
  points: ChartPoint[];
  segments: ChartSegment[];
  ticks: { value: number; y: number }[];
  xLabels: { index: number; x: number; label: string }[];
};

/** A "nice" tick step (1, 2, 2.5, 5 × 10^k) at least `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const k = Math.floor(Math.log10(raw));
  const base = 10 ** k;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * base >= raw - 1e-9) return m * base;
  }
  return 10 * base;
}

/** The y range: the points' own min and max, rounded out to nice ticks. */
export function yScale(values: number[]): {
  lo: number;
  hi: number;
  ticks: number[];
} {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  // A flat (or near-flat) series: headroom of 5% (at least 1) each way.
  const pad = spread === 0 ? Math.max(1, Math.abs(max) * 0.05) : 0;
  const step = niceStep((spread + 2 * pad) / 2);
  const lo = Math.floor((min - pad) / step) * step;
  let hi = Math.ceil((max + pad) / step) * step;
  if (hi === lo) hi = lo + step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9 && ticks.length < 6; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }
  return { lo, hi, ticks };
}

export function chartGeometry(
  points: readonly TrendPointDto[],
  width: number,
): ChartGeometry {
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const n = points.length;
  const inner = plotWidth - 2 * PAD_X;
  const spacing = n <= 1 ? 0 : Math.max(MIN_POINT_SPACING, inner / (n - 1));
  const contentWidth =
    n <= 1 ? plotWidth : Math.max(plotWidth, 2 * PAD_X + spacing * (n - 1));
  const { lo, hi, ticks } = yScale(points.map((p) => p.value));
  const usable = PLOT_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yOf = (v: number) => PAD_TOP + (1 - (v - lo) / (hi - lo)) * usable;

  const placed: ChartPoint[] = points.map((p, index) => ({
    index,
    x: PAD_X + spacing * index,
    y: yOf(p.value),
    value: p.value,
    dateLabel: p.dateLabel,
    setsLabel: p.setsLabel,
    deload: p.scheduledDeload,
  }));

  const segments: ChartSegment[] = [];
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1];
    const b = placed[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    segments.push({
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      length: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx),
    });
  }

  // Date labels at most every ~72 pt, always the newest one.
  const every = spacing > 0 ? Math.max(1, Math.ceil(72 / spacing)) : 1;
  const xLabels = placed
    .filter(
      (p) =>
        p.index === n - 1 ||
        (p.index % every === 0 && n - 1 - p.index >= every),
    )
    .map((p) => ({ index: p.index, x: p.x, label: p.dateLabel }));

  return {
    contentWidth,
    scrolls: contentWidth > plotWidth + 0.5,
    spacing,
    points: placed,
    segments,
    ticks: ticks.map((value) => ({ value, y: yOf(value) })),
    xLabels,
  };
}

/** The point nearest a touch on the plot (by x only, as points are columns). */
export function nearestIndex(geometry: ChartGeometry, x: number): number {
  const n = geometry.points.length;
  if (n <= 1 || geometry.spacing === 0) return 0;
  const i = Math.round((x - PAD_X) / geometry.spacing);
  return Math.min(n - 1, Math.max(0, i));
}

/** One sentence for VoiceOver: the series, how many sessions, first and last. */
export function chartSummary(
  title: string,
  unit: "lb" | "reps",
  points: readonly TrendPointDto[],
): string {
  const n = points.length;
  const word = unit === "lb" ? "pounds" : "reps";
  if (n === 0) return `${title} trend, no sessions`;
  const first = points[0];
  const last = points[n - 1];
  const values = points.map((p) => p.value);
  return `${title} trend, ${n} session${n === 1 ? "" : "s"}, from ${first.value} ${word} on ${first.dateLabel} to ${last.value} ${word} on ${last.dateLabel}; lowest ${Math.min(...values)}, highest ${Math.max(...values)}`;
}

/** The readout under the chart for the selected point. */
export function pointReadout(p: ChartPoint, unit: "lb" | "reps"): string {
  return `${p.dateLabel} · ${p.value} ${unit}${p.setsLabel ? ` · ${p.setsLabel}` : ""}${p.deload ? " · deload week" : ""}`;
}
