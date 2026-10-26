import { estimateOneRepMax } from "@/lib/progression/e1rm";
import { RIR_MAX } from "@/lib/logging/rir";
import {
  e1rmPoints,
  projectedE1rmPoints,
  type HistoryRow,
} from "@/lib/progression/history";
import type { WorkingSet } from "@/lib/progression/engine";

/**
 * Projected-RIR overlay (OVE-80): the speculative "what-if" e1RM series the
 * e1RM view can toggle on. It reuses `estimateOneRepMax` with `reps + rir`,
 * never a second formula, projects only loaded sets whose RIR is recorded and
 * below the 4+ cap, and never touches the concrete `e1rmPoints` series.
 */

type SetSpec = [weight: number | null, reps: number, rir?: number | null];

function row(id: string, date: string, sets: SetSpec[]): HistoryRow {
  const workingSets: WorkingSet[] = sets.map(([w, r, rir], i) => ({
    setNumber: i + 1,
    weightLbs: w,
    reps: r,
    rir: rir ?? null,
  }));
  return {
    perf: {
      loggedExerciseId: id,
      dateIso: date,
      week: 1,
      scheduledDeload: false,
      gymId: null,
      complete: true,
      repMin: 8,
      repMax: 10,
      workingSets,
    },
    finished: true,
    extraSets: [],
  };
}

const projectedFor = (r: HistoryRow) => {
  const pts = projectedE1rmPoints([r]);
  return pts.length === 1 ? pts[0].value : null;
};

describe("projectedE1rmPoints", () => {
  it("projects from reps + RIR through the one e1RM formula", () => {
    // 200x8 at 2 RIR → projected from 200x10.
    const r = row("a", "2026-01-01", [[200, 8, 2]]);
    expect(projectedFor(r)).toBe(Math.round(estimateOneRepMax(200, 10)));
  });

  it("takes the best (max) projected set in a session", () => {
    const r = row("a", "2026-01-01", [
      [185, 8, 3], // → 185x11
      [205, 5, 1], // → 205x6
      [195, 6, 2], // → 195x8
    ]);
    const expected = Math.max(
      estimateOneRepMax(185, 11),
      estimateOneRepMax(205, 6),
      estimateOneRepMax(195, 8),
    );
    expect(projectedFor(r)).toBe(Math.round(expected));
  });

  it("never treats a null (unrecorded) RIR as 0 — it does not project", () => {
    const r = row("a", "2026-01-01", [[200, 8, null]]);
    expect(projectedFor(r)).toBeNull();
  });

  it("does not project a set reported at the 4+ cap (a floor, not a number)", () => {
    const r = row("a", "2026-01-01", [[200, 8, RIR_MAX]]);
    expect(projectedFor(r)).toBeNull();
  });

  it("projects a session from only its projectable sets", () => {
    // One set has RIR 1 (projectable), the others are null / 4+ (not).
    const r = row("a", "2026-01-01", [
      [200, 8, null],
      [210, 5, 1],
      [180, 10, RIR_MAX],
    ]);
    expect(projectedFor(r)).toBe(Math.round(estimateOneRepMax(210, 6)));
  });

  it("does not project a pure-bodyweight (no-load) set even with RIR", () => {
    const r = row("a", "2026-01-01", [[null, 12, 2]]);
    expect(projectedFor(r)).toBeNull();
  });

  it("omits the point entirely for a session with nothing to project", () => {
    const rows = [
      row("a", "2026-01-01", [[200, 8, 2]]), // projectable
      row("b", "2026-01-02", [[200, 8, null]]), // not
    ];
    const pts = projectedE1rmPoints(rows);
    expect(pts.map((p) => p.loggedExerciseId)).toEqual(["a"]);
  });

  it("is at or above the concrete e1RM (reserved reps never lower capacity)", () => {
    const r = row("a", "2026-01-01", [[200, 8, 2]]);
    const concrete = e1rmPoints([r])[0].value;
    expect(projectedFor(r)).toBeGreaterThanOrEqual(concrete);
  });

  it("leaves the concrete e1RM series untouched regardless of RIR", () => {
    const withRir = row("a", "2026-01-01", [[200, 8, 2]]);
    const withoutRir = row("a", "2026-01-01", [[200, 8, null]]);
    expect(e1rmPoints([withRir])[0].value).toBe(
      e1rmPoints([withoutRir])[0].value,
    );
  });
});
