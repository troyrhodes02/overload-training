import {
  evaluateReactiveDecision,
  type Performance,
  type WorkingSet,
} from "@/lib/progression/engine";
import {
  estimateOneRepMax,
  sessionE1rm,
  loadedSets,
} from "@/lib/progression/e1rm";
import {
  callsBySession,
  computeRecords,
  e1rmPoints,
  latestValue,
  recordPopulation,
  repRecordFrontier,
  repsPoints,
  weightPoints,
  REP_RECORDS_MAX,
  type HistoryRow,
  type LoadedRecordSet,
} from "@/lib/progression/history";
import { bestPerformance } from "@/lib/goals/progress";

/**
 * Exercise History & PR Intelligence — the pure projections (spec §4, §6,
 * §11.3, §14.1). Records, calls, and points are derived from the rows of one
 * scope; nothing here may define a second e1RM, ordering, or threshold.
 */

type RowOpts = {
  id: string;
  date: string;
  sets: [number | null, number, (number | null)?][];
  planned?: number;
  range?: [number, number];
  deload?: boolean;
  finished?: boolean;
  extra?: [number | null, number][];
};

function row(o: RowOpts): HistoryRow {
  const planned = o.planned ?? 3;
  const finished = o.finished ?? true;
  const workingSets: WorkingSet[] = o.sets.map(([w, r, rir], i) => ({
    setNumber: i + 1,
    weightLbs: w,
    reps: r,
    rir: rir ?? null,
  }));
  return {
    perf: {
      loggedExerciseId: o.id,
      dateIso: o.date,
      week: 1,
      scheduledDeload: o.deload ?? false,
      gymId: null,
      complete: finished && workingSets.length >= planned,
      repMin: (o.range ?? [8, 10])[0],
      repMax: (o.range ?? [8, 10])[1],
      workingSets,
    },
    finished,
    extraSets: (o.extra ?? []).map(([w, r], i) => ({
      setNumber: planned + i + 1,
      weightLbs: w,
      reps: r,
      rir: null,
    })),
  };
}

const s3 = (
  w: number,
  a: number,
  b: number,
  c: number,
  rir?: (number | null)[],
) =>
  [
    [w, a, rir?.[0] ?? null],
    [w, b, rir?.[1] ?? null],
    [w, c, rir?.[2] ?? null],
  ] as [number, number, number | null][];

/**
 * The preview's Barbell Bench Press (docs/previews/16-…, §01, §04): the
 * fixture mirrors it set for set, so the calls the preview prints are the
 * calls the engine makes.
 */
const BENCH: HistoryRow[] = [
  row({
    id: "le-01",
    date: "2026-08-25",
    sets: s3(195, 6, 6, 5),
    range: [4, 6],
  }),
  row({
    id: "le-02",
    date: "2026-08-28",
    sets: s3(205, 5, 5, 4),
    range: [4, 6],
  }),
  row({ id: "le-03", date: "2026-09-11", sets: s3(175, 9, 9, 8) }),
  row({ id: "le-04", date: "2026-09-15", sets: s3(175, 10, 10, 10) }),
  row({ id: "le-05", date: "2026-09-18", sets: s3(175, 10, 10, 10) }),
  row({ id: "le-06", date: "2026-09-22", sets: s3(180, 10, 9, 8) }),
  row({ id: "le-07", date: "2026-09-25", sets: s3(180, 10, 10, 9) }),
  row({ id: "le-08", date: "2026-09-29", sets: s3(180, 10, 10, 10) }),
  row({
    id: "le-09",
    date: "2026-10-02",
    sets: s3(180, 10, 10, 10, [2, 2, 2]),
  }),
  row({ id: "le-10", date: "2026-10-06", sets: s3(185, 9, 8, 8) }),
  row({
    id: "le-11",
    date: "2026-10-09",
    sets: s3(185, 10, 10, 10),
    extra: [[135, 15]],
  }),
  row({
    id: "le-12",
    date: "2026-10-13",
    sets: s3(165, 10, 10, 10),
    deload: true,
  }),
  row({
    id: "le-13",
    date: "2026-10-16",
    sets: s3(165, 10, 10, 10),
    deload: true,
  }),
  row({
    id: "le-14",
    date: "2026-10-20",
    sets: s3(185, 10, 10, 10, [2, 1, 1]),
  }),
];

const brief = (s: {
  weightLbs: number | null;
  reps: number;
  dateIso: string;
}) => `${s.weightLbs}x${s.reps}@${s.dateIso}`;

describe("records (spec §4, R7–R11)", () => {
  it("the preview's bench: best set, its estimate, heaviest, rep records", () => {
    const r = computeRecords(BENCH, true);
    if (r?.kind !== "loaded") throw new Error("expected loaded records");
    expect(brief(r.bestSet)).toBe("185x10@2026-10-09"); // earliest of two 185 × 10 sessions
    expect(r.bestE1rm).toBeCloseTo(estimateOneRepMax(185, 10), 10);
    expect(Math.round(r.bestE1rm)).toBe(247);
    expect(brief(r.heaviest)).toBe("205x5@2026-08-28");
    expect(r.repRecords.map(brief)).toEqual([
      "205x5@2026-08-28",
      "195x6@2026-08-25",
      "185x10@2026-10-09",
    ]);
  });

  it("the rep-record frontier never lists a load that a heavier load matched", () => {
    const sets = (
      [
        [205, 5],
        [195, 6],
        [185, 10],
        [180, 10],
        [175, 10],
        [135, 9],
      ] as const
    ).map(([w, r], i) => ({
      weightLbs: w,
      reps: r,
      dateIso: `2026-09-${String(i + 1).padStart(2, "0")}`,
      loggedExerciseId: `le-${i}`,
      setNumber: 1,
    }));
    expect(
      repRecordFrontier(sets).map((s) => `${s.weightLbs}x${s.reps}`),
    ).toEqual(["205x5", "195x6", "185x10"]);
  });

  it("the frontier keeps the earliest set at a load and caps at REP_RECORDS_MAX, heaviest first", () => {
    const sets: LoadedRecordSet[] = Array.from({ length: 10 }, (_, i) => ({
      weightLbs: 200 - i * 10,
      reps: i + 1,
      dateIso: `2026-09-${String(i + 1).padStart(2, "0")}`,
      loggedExerciseId: `le-${i}`,
      setNumber: 1,
    }));
    sets.push({ ...sets[0], dateIso: "2026-10-30", loggedExerciseId: "late" });
    const f = repRecordFrontier(sets);
    expect(f).toHaveLength(REP_RECORDS_MAX);
    expect(f[0].weightLbs).toBe(200);
    expect(f[0].loggedExerciseId).toBe("le-0");
  });

  it("heaviest breaks a load tie on reps, then on date", () => {
    const r = computeRecords(
      [
        row({ id: "a", date: "2026-09-01", sets: s3(225, 2, 2, 2) }),
        row({ id: "b", date: "2026-09-08", sets: s3(225, 3, 2, 2) }),
        row({ id: "c", date: "2026-09-15", sets: s3(225, 3, 3, 3) }),
      ],
      true,
    );
    if (r?.kind !== "loaded") throw new Error("expected loaded records");
    expect(brief(r.heaviest)).toBe("225x3@2026-09-08");
  });

  it("deload weeks, extra sets, and unfinished workouts never hold a record", () => {
    const r = computeRecords(
      [
        row({ id: "a", date: "2026-09-01", sets: s3(185, 8, 8, 8) }),
        row({
          id: "b",
          date: "2026-09-08",
          sets: s3(225, 3, 3, 3),
          deload: true,
        }),
        row({
          id: "c",
          date: "2026-09-15",
          sets: s3(185, 8, 8, 8),
          extra: [[245, 1]],
        }),
        row({
          id: "d",
          date: "2026-09-22",
          sets: s3(235, 2, 2, 2),
          finished: false,
        }),
      ],
      true,
    );
    if (r?.kind !== "loaded") throw new Error("expected loaded records");
    expect(r.heaviest.weightLbs).toBe(185);
    expect(r.repRecords.map((s) => s.weightLbs)).toEqual([185]);
  });

  it("a finished workout short of its planned sets still counts (demonstrated strength, R22)", () => {
    const r = computeRecords(
      [row({ id: "a", date: "2026-09-01", sets: [[245, 2]], planned: 3 })],
      true,
    );
    if (r?.kind !== "loaded") throw new Error("expected loaded records");
    expect(r.heaviest.weightLbs).toBe(245);
  });

  it("bodyweight: the one record is most reps in a set (earliest tie); no load anywhere", () => {
    const r = computeRecords(
      [
        row({
          id: "a",
          date: "2026-10-02",
          sets: [
            [null, 19],
            [null, 17],
          ],
          planned: 2,
        }),
        row({
          id: "b",
          date: "2026-10-06",
          sets: [
            [null, 20],
            [null, 20],
          ],
          planned: 2,
        }),
        row({
          id: "c",
          date: "2026-10-20",
          sets: [
            [null, 20],
            [null, 20],
          ],
          planned: 2,
        }),
      ],
      false,
    );
    expect(r).toEqual({
      kind: "bodyweight",
      mostReps: expect.objectContaining({
        reps: 20,
        dateIso: "2026-10-06",
        weightLbs: null,
      }),
    });
  });

  it("no record without a set that can hold one", () => {
    expect(computeRecords([], true)).toBeNull();
    expect(
      computeRecords(
        [
          row({
            id: "a",
            date: "2026-09-01",
            sets: s3(185, 8, 8, 8),
            deload: true,
          }),
        ],
        true,
      ),
    ).toBeNull();
  });
});

describe("calls by session (spec §6, R12)", () => {
  it("the preview's bench: every call, row for row", () => {
    const calls = callsBySession(BENCH, {
      externalLoad: true,
      noGymScope: false,
    });
    expect(BENCH.map((r) => calls.get(r.perf.loggedExerciseId))).toEqual([
      "insufficient", // Aug 25: first session
      "hold", // Aug 28
      "hold", // Sep 11
      "hold", // Sep 15: top once
      "progress", // Sep 18
      "hold",
      "hold",
      "hold", // Sep 29: top once
      "progress", // Oct 2: flat e1RM released by 2+ RIR on every set
      "hold",
      "hold", // Oct 9: top once
      "deload_week",
      "deload_week",
      "progress", // Oct 20: the current call
    ]);
  });

  it("statuses: in progress, deload week (suppressed), not counted, no-gym scope", () => {
    const rows = [
      row({ id: "a", date: "2026-09-01", sets: s3(185, 8, 8, 8) }),
      row({
        id: "b",
        date: "2026-09-08",
        sets: [
          [185, 8],
          [185, 8],
        ],
      }),
      row({
        id: "c",
        date: "2026-09-15",
        sets: s3(185, 5, 5, 5),
        deload: true,
      }),
      row({ id: "d", date: "2026-09-22", sets: [[185, 8]], finished: false }),
    ];
    const calls = callsBySession(rows, {
      externalLoad: true,
      noGymScope: false,
    });
    expect([...calls.entries()]).toEqual([
      ["a", "insufficient"],
      ["b", "not_counted"],
      ["c", "deload_week"],
      ["d", "in_progress"],
    ]);
    const none = callsBySession(rows, { externalLoad: true, noGymScope: true });
    expect([...none.values()]).toEqual(["none", "none", "none", "none"]);
  });

  it("an ordinary hold is 'hold' and the stall gate is 'stalled' — the engine's own states", () => {
    const rows = [
      row({
        id: "a",
        date: "2026-09-28",
        sets: s3(150, 10, 9, 8),
        range: [10, 12],
      }),
      row({
        id: "b",
        date: "2026-10-01",
        sets: s3(140, 12, 12, 11),
        range: [10, 12],
      }),
      row({
        id: "c",
        date: "2026-10-05",
        sets: s3(140, 12, 12, 12),
        range: [10, 12],
      }),
      row({
        id: "d",
        date: "2026-10-08",
        sets: s3(140, 12, 12, 12),
        range: [10, 12],
      }),
    ];
    const calls = callsBySession(rows, {
      externalLoad: true,
      noGymScope: false,
    });
    expect(calls.get("b")).toBe("hold");
    expect(calls.get("d")).toBe("stalled");
  });

  it("two misses below the range is a reactive deload", () => {
    const rows = [
      row({ id: "a", date: "2026-09-01", sets: s3(185, 7, 6, 6) }),
      row({ id: "b", date: "2026-09-08", sets: s3(185, 7, 7, 6) }),
    ];
    expect(
      callsBySession(rows, { externalLoad: true, noGymScope: false }).get("b"),
    ).toBe("deload");
  });
});

describe("trend points (spec §4, R14, R29)", () => {
  it("e1RM, weight, and reps views: finished workouts only, deload weeks marked", () => {
    const e = e1rmPoints(BENCH);
    expect(e).toHaveLength(14);
    expect(e.at(-1)?.value).toBe(Math.round(estimateOneRepMax(185, 10)));
    expect(e.filter((p) => p.scheduledDeload).map((p) => p.dateIso)).toEqual([
      "2026-10-13",
      "2026-10-16",
    ]);
    const w = weightPoints(BENCH);
    expect(w.map((p) => p.value)).toEqual([
      195, 205, 175, 175, 175, 180, 180, 180, 180, 185, 185, 165, 165, 185,
    ]); // the extra 135 × 15 never plots
    expect(latestValue(w)).toBe(185);

    const unfinished = [
      row({ id: "a", date: "2026-09-01", sets: s3(185, 8, 8, 8) }),
      row({
        id: "b",
        date: "2026-09-08",
        sets: s3(225, 8, 8, 8),
        finished: false,
      }),
    ];
    expect(weightPoints(unfinished).map((p) => p.value)).toEqual([185]);
  });

  it("the latest value skips a trailing deload week", () => {
    const pts = weightPoints([
      row({ id: "a", date: "2026-09-01", sets: s3(185, 8, 8, 8) }),
      row({
        id: "b",
        date: "2026-09-08",
        sets: s3(165, 8, 8, 8),
        deload: true,
      }),
    ]);
    expect(latestValue(pts)).toBe(185);
  });

  it("bodyweight has a reps view and no load or e1RM points", () => {
    const rows = [
      row({
        id: "a",
        date: "2026-09-01",
        sets: [
          [null, 18],
          [null, 15],
        ],
        planned: 2,
      }),
    ];
    expect(e1rmPoints(rows)).toEqual([]);
    expect(weightPoints(rows)).toEqual([]);
    expect(repsPoints(rows).map((p) => p.value)).toEqual([18]);
  });
});

// ---------------------------------------------------------------------------
// Sweep: the page can never disagree with the engine or with Goals.
// ---------------------------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRows(r: () => number, bodyweight: boolean): HistoryRow[] {
  const n = 1 + Math.floor(r() * 8);
  let weight = 135 + Math.floor(r() * 10) * 5;
  const topHeavy = r() < 0.5;
  // Shuffled dates (and some same-day pairs) so ordering is exercised too.
  const days = Array.from({ length: n }, () => 1 + Math.floor(r() * 25));
  return days.map((day, i) => {
    const planned = 1 + Math.floor(r() * 4);
    const logged = r() < 0.85 ? planned : Math.max(1, planned - 1);
    if (!topHeavy) weight += r() < 0.3 ? 5 : r() < 0.1 ? -5 : 0;
    const finished = r() < 0.92;
    const sets: WorkingSet[] = Array.from({ length: logged }, (_, s) => ({
      setNumber: s + 1,
      weightLbs: bodyweight ? null : weight + (r() < 0.15 ? 10 : 0),
      reps: topHeavy && r() < 0.85 ? 10 : Math.max(1, 10 - Math.floor(r() * 5)),
      rir: r() < 0.5 ? null : Math.floor(r() * 5),
    }));
    const perf: Performance = {
      loggedExerciseId: `le-${String(i).padStart(2, "0")}`,
      dateIso: `2026-09-${String(day).padStart(2, "0")}`,
      week: 1,
      scheduledDeload: r() < 0.1,
      gymId: null,
      complete: finished && logged >= planned,
      repMin: 8,
      repMax: 10,
      workingSets: sets,
    };
    return {
      perf,
      finished,
      extraSets:
        r() < 0.2
          ? [
              {
                setNumber: planned + 1,
                weightLbs: bodyweight ? null : weight + 40,
                reps: 1,
                rir: null,
              },
            ]
          : [],
    };
  });
}

describe("sweep: 2,000 histories", () => {
  it("calls are the engine's on each prefix; the newest counted call is the current call; best set is the Goals best", () => {
    const r = rng(16);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const bodyweight = r() < 0.2;
      const rows = randomRows(r, bodyweight);
      const opts = { e1rmApplicable: !bodyweight };
      const calls = callsBySession(rows, {
        externalLoad: !bodyweight,
        noGymScope: false,
      });
      const ordered = rows
        .slice()
        .sort((a, b) =>
          a.perf.dateIso !== b.perf.dateIso
            ? a.perf.dateIso < b.perf.dateIso
              ? -1
              : 1
            : a.perf.loggedExerciseId < b.perf.loggedExerciseId
              ? -1
              : 1,
        );
      ordered.forEach((row_, idx) => {
        const call = calls.get(row_.perf.loggedExerciseId)!;
        seen.add(call);
        if (row_.finished && !row_.perf.scheduledDeload && row_.perf.complete) {
          const prefix = ordered.slice(0, idx + 1).map((x) => x.perf);
          expect(call).toBe(evaluateReactiveDecision(prefix, opts).state);
        }
      });
      const counted = ordered.filter(
        (x) => x.finished && !x.perf.scheduledDeload && x.perf.complete,
      );
      if (counted.length > 0) {
        expect(calls.get(counted.at(-1)!.perf.loggedExerciseId)).toBe(
          evaluateReactiveDecision(
            rows.map((x) => x.perf),
            opts,
          ).state,
        );
      }

      if (!bodyweight) {
        // The Goals best: the best qualifying session e1RM (earliest tie).
        const goalPerfs = ordered
          .filter((x) => x.finished && !x.perf.scheduledDeload)
          .map((x) => ({
            dateIso: x.perf.dateIso,
            e1rm: sessionE1rm(loadedSets(x.perf.workingSets)),
            bestSet: { weightLbs: 0, reps: 0 },
          }))
          .filter((p) => p.e1rm > 0);
        const goalBest = bestPerformance(goalPerfs);
        const rec = computeRecords(rows, true);
        if (!goalBest) {
          expect(rec).toBeNull();
        } else {
          if (rec?.kind !== "loaded")
            throw new Error("expected loaded records");
          expect(rec.bestE1rm).toBeCloseTo(goalBest.e1rm, 9);
          // Heaviest is the frontier's first row and a real working set.
          expect(rec.repRecords[0]).toEqual(rec.heaviest);
          const pop = recordPopulation(rows);
          expect(
            pop.some(
              (s) =>
                s.weightLbs === rec.heaviest.weightLbs &&
                s.reps === rec.heaviest.reps,
            ),
          ).toBe(true);
          expect(Math.max(...pop.map((s) => s.weightLbs as number))).toBe(
            rec.heaviest.weightLbs,
          );
          // The frontier strictly descends in load and ascends in reps.
          for (let k = 1; k < rec.repRecords.length; k++) {
            expect(rec.repRecords[k].weightLbs).toBeLessThan(
              rec.repRecords[k - 1].weightLbs,
            );
            expect(rec.repRecords[k].reps).toBeGreaterThan(
              rec.repRecords[k - 1].reps,
            );
          }
        }
      }
    }
    // The sweep reaches every call kind except the no-gym scope.
    for (const k of [
      "progress",
      "hold",
      "deload",
      "insufficient",
      "deload_week",
      "not_counted",
      "in_progress",
    ]) {
      expect(seen).toContain(k);
    }
  });
});
