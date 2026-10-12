import {
  evaluateReactive,
  qualifyingSequence,
  isAllTop,
  hasBelowMin,
  type Performance,
} from "@/lib/progression/engine";

let seq = 0;

/** Build a performance from a short reps list, defaulting to a complete,
 *  non-scheduled-deload occurrence with a 3×repMin–repMax scheme. */
function perf(
  reps: number[],
  opts: Partial<Performance> & { repMin?: number; repMax?: number } = {},
): Performance {
  seq += 1;
  const repMin = opts.repMin ?? 6;
  const repMax = opts.repMax ?? 8;
  const date = opts.dateIso ?? `2026-08-${String(seq).padStart(2, "0")}`;
  return {
    loggedExerciseId: opts.loggedExerciseId ?? `le-${seq}`,
    dateIso: date,
    week: opts.week ?? seq,
    scheduledDeload: opts.scheduledDeload ?? false,
    gymId: opts.gymId ?? null,
    complete: opts.complete ?? true,
    repMin,
    repMax,
    workingSets: reps.map((r, i) => ({
      setNumber: i + 1,
      weightLbs: opts.workingSets?.[i]?.weightLbs ?? 185,
      reps: r,
    })),
  };
}

beforeEach(() => {
  seq = 0;
});

describe("qualifying sequence (R9, R38, R44)", () => {
  it("excludes incomplete and scheduled-deload performances, sorts chronologically", () => {
    const a = perf([8, 8, 8], { dateIso: "2026-08-01" });
    const incomplete = perf([8, 8], { dateIso: "2026-08-05", complete: false });
    const deload = perf([8, 8, 8], {
      dateIso: "2026-08-08",
      scheduledDeload: true,
    });
    const b = perf([8, 8, 8], { dateIso: "2026-08-15" });
    const got = qualifyingSequence([b, deload, incomplete, a]);
    expect(got.map((p) => p.dateIso)).toEqual(["2026-08-01", "2026-08-15"]);
  });
});

describe("predicates against each performance's own range (R8)", () => {
  it("isAllTop needs every set at or above repMax", () => {
    expect(isAllTop(perf([8, 8, 8], { repMax: 8 }))).toBe(true);
    expect(isAllTop(perf([8, 8, 7], { repMax: 8 }))).toBe(false);
  });
  it("hasBelowMin needs at least one set below repMin", () => {
    expect(hasBelowMin(perf([8, 7, 8], { repMin: 8, repMax: 10 }))).toBe(true);
    expect(hasBelowMin(perf([8, 8, 8], { repMin: 8, repMax: 10 }))).toBe(false);
  });
  it("supports a fixed range (5–5)", () => {
    expect(isAllTop(perf([5, 5, 5], { repMin: 5, repMax: 5 }))).toBe(true);
    expect(hasBelowMin(perf([5, 4, 5], { repMin: 5, repMax: 5 }))).toBe(true);
  });
});

describe("minimum history (R4)", () => {
  it("0 qualifying → insufficient", () => {
    expect(evaluateReactive([])).toBe("insufficient");
  });
  it("1 qualifying → insufficient (no false call)", () => {
    expect(evaluateReactive([perf([8, 8, 8])])).toBe("insufficient");
  });
  it("2 qualifying → eligible for a call", () => {
    expect(evaluateReactive([perf([8, 8, 8]), perf([8, 8, 8])])).toBe(
      "progress",
    );
  });
});

describe("Progress threshold, 3×6–8 (R5)", () => {
  it("8/8/8 for two consecutive qualifying sessions → progress", () => {
    expect(evaluateReactive([perf([8, 8, 8]), perf([8, 8, 8])])).toBe(
      "progress",
    );
  });
  it("one non-top set in the latest session → not progress", () => {
    expect(evaluateReactive([perf([8, 8, 8]), perf([8, 8, 7])])).toBe("hold");
  });
  it("one non-top set in the earlier of the two → not progress", () => {
    expect(evaluateReactive([perf([8, 8, 7]), perf([8, 8, 8])])).toBe("hold");
  });
});

describe("reactive Deload threshold, 3×8–10 (R6)", () => {
  const d = (reps: number[]) => perf(reps, { repMin: 8, repMax: 10 });
  it("a sub-8 set in each of two consecutive qualifying sessions → deload", () => {
    expect(evaluateReactive([d([8, 7, 8]), d([8, 8, 7])])).toBe("deload");
  });
  it("sub-8 in only one session → not deload", () => {
    expect(evaluateReactive([d([8, 7, 8]), d([9, 9, 9])])).toBe("hold");
  });
});

describe("Hold (R7)", () => {
  it("neither threshold met → hold (no tag)", () => {
    const p = (reps: number[]) => perf(reps, { repMin: 8, repMax: 10 });
    expect(evaluateReactive([p([10, 9, 9]), p([10, 9, 10])])).toBe("hold");
  });
});

describe("precedence (R7)", () => {
  it("deload beats progress in a defensive conflict", () => {
    // Malformed: repMin above repMax so both predicates can fire. Deload wins.
    const weird = (reps: number[]) => perf(reps, { repMin: 10, repMax: 5 });
    expect(evaluateReactive([weird([7, 7, 7]), weird([7, 7, 7])])).toBe(
      "deload",
    );
  });
  it("scheduled-deload performances never become qualifying evidence", () => {
    // Two all-top sessions, but the most recent is a scheduled deload: it drops
    // out, leaving only one qualifying session → insufficient, not progress.
    const a = perf([8, 8, 8], { dateIso: "2026-08-01" });
    const deload = perf([8, 8, 8], {
      dateIso: "2026-08-08",
      scheduledDeload: true,
    });
    expect(evaluateReactive([a, deload])).toBe("insufficient");
  });
});

describe("stall window (R22–R25)", () => {
  // Weights encode the e1RM trend; all sessions are all-top so Progress is the
  // raw candidate and only the stall gate decides the outcome.
  const top = (weight: number, date: string) =>
    perf([8, 8, 8], {
      dateIso: date,
      workingSets: [
        { setNumber: 1, weightLbs: weight, reps: 8 },
        { setNumber: 2, weightLbs: weight, reps: 8 },
        { setNumber: 3, weightLbs: weight, reps: 8 },
      ],
    });

  it("exactly two qualifying all-top → progress (gate inactive)", () => {
    expect(
      evaluateReactive([top(185, "2026-08-01"), top(185, "2026-08-08")]),
    ).toBe("progress");
  });

  it("three qualifying, latest e1RM > first → progress survives", () => {
    expect(
      evaluateReactive([
        top(185, "2026-08-01"),
        top(190, "2026-08-08"),
        top(195, "2026-08-15"),
      ]),
    ).toBe("progress");
  });

  it("three qualifying, latest == first → progress withheld (stalled)", () => {
    expect(
      evaluateReactive([
        top(185, "2026-08-01"),
        top(190, "2026-08-08"),
        top(185, "2026-08-15"),
      ]),
    ).toBe("stalled");
  });

  it("three qualifying, latest < first → progress withheld (stalled)", () => {
    expect(
      evaluateReactive([
        top(190, "2026-08-01"),
        top(188, "2026-08-08"),
        top(185, "2026-08-15"),
      ]),
    ).toBe("stalled");
  });

  it("the stalled state is distinct from deload", () => {
    const r = evaluateReactive([
      top(185, "2026-08-01"),
      top(185, "2026-08-08"),
      top(185, "2026-08-15"),
    ]);
    expect(r).toBe("stalled");
    expect(r).not.toBe("deload");
  });
});

describe("historical rep ranges differ per occurrence (R8)", () => {
  it("each session is judged against the range that applied then", () => {
    // Old block 3×8–10: 10/10/10 is all-top. New block 3×5–6: 6/6/6 is all-top.
    const old = perf([10, 10, 10], {
      repMin: 8,
      repMax: 10,
      dateIso: "2026-07-01",
    });
    const recent = perf([6, 6, 6], {
      repMin: 5,
      repMax: 6,
      dateIso: "2026-08-01",
    });
    expect(evaluateReactive([old, recent])).toBe("progress");
  });
});
