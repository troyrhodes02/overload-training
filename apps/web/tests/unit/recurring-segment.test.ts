import {
  currentSegment,
  prescriptionOf,
  sameRecurringExercise,
  segmentEndingAt,
  type Prescription,
  type SegmentCandidate,
} from "@overload/shared/progression/recurring";

/**
 * Prescription-Aware Intelligence spec §6: identity, compatibility, and
 * contiguous segments. Pure.
 */
const PUSH = "11111111-1111-4111-8111-111111111111";
const UPPER = "22222222-2222-4222-8222-222222222222";
const BENCH = "bench";
const GYM_A = "gym-a";
const GYM_B = "gym-b";

let n = 0;
function perf(
  dateIso: string,
  opts: {
    lineage?: string | null;
    exercise?: string;
    gym?: string | null;
    reps?: [number, number];
    rir?: [number, number] | null;
  } = {},
): SegmentCandidate {
  n += 1;
  const [repMin, repMax] = opts.reps ?? [6, 8];
  return {
    id: `le-${String(n).padStart(3, "0")}`,
    dateIso,
    orderKey: `${dateIso}T12:00:00.000Z`,
    key: {
      lineageId: opts.lineage === undefined ? UPPER : opts.lineage,
      exerciseId: opts.exercise ?? BENCH,
      gymId: opts.gym === undefined ? GYM_A : opts.gym,
    },
    prescription: {
      repMin,
      repMax,
      targetRirMin: opts.rir ? opts.rir[0] : null,
      targetRirMax: opts.rir ? opts.rir[1] : null,
    },
  };
}

function anchor(
  opts: {
    lineage?: string | null;
    reps?: [number, number];
    rir?: [number, number] | null;
    gym?: string | null;
    gymVariable?: boolean;
  } = {},
) {
  const [repMin, repMax] = opts.reps ?? [6, 8];
  const prescription: Prescription = {
    repMin,
    repMax,
    targetRirMin: opts.rir ? opts.rir[0] : null,
    targetRirMax: opts.rir ? opts.rir[1] : null,
  };
  return {
    key: {
      lineageId: opts.lineage === undefined ? UPPER : opts.lineage,
      exerciseId: BENCH,
      gymId: opts.gym === undefined ? GYM_A : opts.gym,
    },
    prescription,
    gymVariable: opts.gymVariable ?? false,
  };
}

const ids = (xs: SegmentCandidate[]) => xs.map((x) => x.dateIso);

describe("identity", () => {
  it("separates two workouts of one exercise (Saturday Push vs Wednesday Upper)", () => {
    const rows = [
      perf("2026-11-01", { lineage: PUSH, reps: [3, 5] }),
      perf("2026-11-04", { lineage: UPPER }),
      perf("2026-11-08", { lineage: PUSH, reps: [3, 5] }),
      perf("2026-11-11", { lineage: UPPER }),
    ];
    expect(ids(currentSegment(rows, anchor({ lineage: UPPER })))).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
    expect(
      ids(currentSegment(rows, anchor({ lineage: PUSH, reps: [3, 5] }))),
    ).toEqual(["2026-11-01", "2026-11-08"]);
  });

  it("another workout's rows neither join nor break the run", () => {
    const rows = [
      perf("2026-11-04"),
      perf("2026-11-08", { lineage: PUSH, reps: [3, 5] }),
      perf("2026-11-11"),
    ];
    expect(ids(currentSegment(rows, anchor()))).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
  });

  it("another exercise is never part of the segment (a swap has its own key)", () => {
    const rows = [
      perf("2026-11-04"),
      perf("2026-11-11", { exercise: "smith-bench" }),
    ];
    expect(ids(currentSegment(rows, anchor()))).toEqual(["2026-11-04"]);
  });

  it("a missing lineage matches only another missing lineage (RD-17)", () => {
    const rows = [perf("2026-11-04", { lineage: null })];
    expect(ids(currentSegment(rows, anchor({ lineage: null })))).toEqual([
      "2026-11-04",
    ]);
    // A planned workout never draws on session-less history, nor the reverse.
    expect(currentSegment(rows, anchor())).toEqual([]);
    expect(
      currentSegment([perf("2026-11-04")], anchor({ lineage: null })),
    ).toEqual([]);
    expect(
      sameRecurringExercise(
        { lineageId: null, exerciseId: BENCH, gymId: null },
        { lineageId: PUSH, exerciseId: BENCH, gymId: null },
        false,
      ),
    ).toBe(false);
  });

  it("gym-variable equipment keeps each gym's rows apart; free weights ignore the gym", () => {
    const rows = [
      perf("2026-11-04", { gym: GYM_A }),
      perf("2026-11-11", { gym: GYM_B }),
    ];
    expect(
      ids(currentSegment(rows, anchor({ gym: GYM_A, gymVariable: true }))),
    ).toEqual(["2026-11-04"]);
    expect(ids(currentSegment(rows, anchor({ gymVariable: false })))).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
    // A machine row with no gym is never in any machine segment.
    expect(
      currentSegment(
        [perf("2026-11-04", { gym: null })],
        anchor({ gym: null, gymVariable: true }),
      ),
    ).toEqual([]);
  });
});

describe("rep-range compatibility and contiguity", () => {
  it("a changed rep range starts a new segment (Block 2 6–8 → Block 3 8–10)", () => {
    const rows = [perf("2026-10-07"), perf("2026-10-14")];
    expect(currentSegment(rows, anchor({ reps: [8, 10] }))).toEqual([]);
  });

  it("returning to an old rep range never resurrects the old streak", () => {
    const rows = [
      perf("2026-09-02"), // Block 1: 6–8
      perf("2026-09-09"),
      perf("2026-10-07", { reps: [8, 10] }), // Block 2: 8–10
      perf("2026-10-14", { reps: [8, 10] }),
    ];
    // Block 3 back at 6–8: nothing comparable since the change.
    expect(currentSegment(rows, anchor({ reps: [6, 8] }))).toEqual([]);
    // After one Block 3 workout, the segment is only Block 3.
    const b3 = perf("2026-11-04");
    expect(ids(currentSegment([...rows, b3], anchor()))).toEqual([
      "2026-11-04",
    ]);
  });

  it("set count, name, weekday, and order do not break the run", () => {
    // The candidate carries no set count or name at all: only the rep range
    // and target RIR can break a run.
    const rows = [perf("2026-11-04"), perf("2026-11-11"), perf("2026-11-18")];
    expect(currentSegment(rows, anchor())).toHaveLength(3);
  });

  it("returns the run oldest first, whatever the input order", () => {
    const rows = [perf("2026-11-18"), perf("2026-11-04"), perf("2026-11-11")];
    expect(ids(currentSegment(rows, anchor()))).toEqual([
      "2026-11-04",
      "2026-11-11",
      "2026-11-18",
    ]);
  });
});

describe("target RIR: the effective-target rule", () => {
  it("introducing a target keeps history with no target (no reset at launch)", () => {
    const rows = [perf("2026-11-04"), perf("2026-11-11")];
    expect(currentSegment(rows, anchor({ rir: [1, 2] }))).toHaveLength(2);
  });

  it("two different recorded targets break the run", () => {
    const rows = [perf("2026-11-04", { rir: [1, 2] })];
    expect(currentSegment(rows, anchor({ rir: [3, 3] }))).toEqual([]);
  });

  it("an equal recorded target continues", () => {
    const rows = [
      perf("2026-11-04", { rir: [1, 2] }),
      perf("2026-11-11", { rir: [1, 2] }),
    ];
    expect(currentSegment(rows, anchor({ rir: [1, 2] }))).toHaveLength(2);
  });

  it("a cleared target inherits the most recent recorded one", () => {
    const rows = [
      perf("2026-10-28", { rir: [3, 3] }),
      perf("2026-11-04", { rir: [1, 2] }),
      perf("2026-11-11", { rir: [1, 2] }),
    ];
    // Anchor has no target: the effective target becomes 1–2, so the older
    // RIR 3 run stops the walk.
    expect(ids(currentSegment(rows, anchor({ rir: null })))).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
  });

  it("a missing target never bridges two different recorded targets", () => {
    const rows = [
      perf("2026-10-28", { rir: [3, 3] }),
      perf("2026-11-04", { rir: null }),
      perf("2026-11-11", { rir: [1, 2] }),
    ];
    expect(ids(currentSegment(rows, anchor({ rir: null })))).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
    expect(ids(currentSegment(rows, anchor({ rir: [1, 2] })))).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
  });

  it("missing targets join whichever recorded target comes first in the walk", () => {
    const rows = [perf("2026-11-04", { rir: null }), perf("2026-11-11")];
    expect(currentSegment(rows, anchor({ rir: null }))).toHaveLength(2);
  });
});

describe("segmentEndingAt (the call a past session led to)", () => {
  it("judges a past session on the run that ended at it, not on later rows", () => {
    const a = perf("2026-10-07");
    const b = perf("2026-10-14");
    const c = perf("2026-10-21", { reps: [8, 10] });
    const d = perf("2026-10-28", { reps: [8, 10] });
    const rows = [a, b, c, d];
    expect(ids(segmentEndingAt(rows, b, false))).toEqual([
      "2026-10-07",
      "2026-10-14",
    ]);
    expect(ids(segmentEndingAt(rows, d, false))).toEqual([
      "2026-10-21",
      "2026-10-28",
    ]);
  });
});

describe("prescriptionOf", () => {
  it("reads a plan or copied snapshot, with no target RIR until Guidance", () => {
    expect(prescriptionOf({ targetRepMin: 3, targetRepMax: 5 })).toEqual({
      repMin: 3,
      repMax: 5,
      targetRirMin: null,
      targetRirMax: null,
    });
  });
});
