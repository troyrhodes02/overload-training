import {
  evaluateReactiveDecision,
  isAllTop,
  hasBelowMin,
  shortFailureSinceLastCounted,
  type Performance,
} from "@/lib/progression/engine";
import { DELOAD_CONSECUTIVE_SESSIONS } from "@/lib/progression/config";
import {
  buildRecommendation,
  type RecommendationInput,
} from "@/lib/progression/recommendation";
import { formatRepTarget } from "@overload/shared/plan/rep-target";

/**
 * Workout Logging Refinements (spec §6, §13; RD-1–RD-5, RD-8). The reported
 * case: 90 lb planned at 6–10, logged at 3. A set below the planned minimum
 * must never produce "stay at this weight" (or a Progress), must not reduce on
 * its own (that is the existing two-session reactive Deload), and must not be
 * judged in a scheduled-deload week or while the workout is still open.
 */
let seq = 0;
beforeEach(() => {
  seq = 0;
});

type Opts = {
  weight?: number | null;
  complete?: boolean;
  finished?: boolean;
  scheduledDeload?: boolean;
  repMin?: number;
  repMax?: number;
  rir?: (number | null)[];
};

function perf(reps: number[], opts: Opts = {}): Performance {
  seq += 1;
  const complete = opts.complete ?? true;
  return {
    loggedExerciseId: `le-${String(seq).padStart(3, "0")}`,
    dateIso: `2026-10-${String(seq).padStart(2, "0")}`,
    week: seq,
    scheduledDeload: opts.scheduledDeload ?? false,
    gymId: null,
    complete,
    finished: opts.finished ?? complete,
    repMin: opts.repMin ?? 6,
    repMax: opts.repMax ?? 10,
    workingSets: reps.map((r, i) => ({
      setNumber: i + 1,
      weightLbs: opts.weight === undefined ? 90 : opts.weight,
      reps: r,
      rir: opts.rir?.[i] ?? null,
    })),
  };
}

/** A finished workout cut short of the plan (fewer sets than planned). */
const short = (reps: number[], o: Opts = {}) =>
  perf(reps, { ...o, complete: false, finished: true });
/** A workout still in progress. */
const open = (reps: number[], o: Opts = {}) =>
  perf(reps, { ...o, complete: false, finished: false });

const decide = (perfs: Performance[], bodyweight = false) =>
  evaluateReactiveDecision(perfs, { e1rmApplicable: !bodyweight });

describe("the reported case: 90 × 3 against 6–10", () => {
  it("after a normal session it is a reassess hold, never hold_short", () => {
    const d = decide([perf([8, 8, 8]), perf([3, 8, 8])]);
    expect(d.state).toBe("hold");
    expect(d.rirEffect).toBeNull();
    expect(d.evidence).toEqual({
      kind: "reassess",
      reps: [3, 8, 8],
      repMin: 6,
      repMax: 10,
      sessions: DELOAD_CONSECUTIVE_SESSIONS,
      latest: { loggedExerciseId: "le-002", dateIso: "2026-10-02" },
    });
  });

  it("on its own (first time performed) there is no call at all", () => {
    expect(decide([perf([3, 8, 8])]).state).toBe("insufficient");
  });

  it("two complete sessions running below the minimum are still the reactive Deload", () => {
    const d = decide([perf([8, 8, 8]), perf([5, 8, 8]), perf([3, 8, 8])]);
    expect(d.state).toBe("deload");
    expect(d.evidence.kind).toBe("deload");
  });

  it("a minor miss (in range, short of the top) is still an ordinary hold", () => {
    const d = decide([perf([8, 8, 8]), perf([7, 7, 6])]);
    expect(d.state).toBe("hold");
    expect(d.evidence.kind).toBe("hold_short");
  });

  it("a later complete session at or above the minimum clears it", () => {
    const d = decide([perf([8, 8, 8]), perf([3, 8, 8]), perf([7, 7, 7])]);
    expect(d.evidence.kind).toBe("hold_short");
  });

  it("RIR never qualifies a reassess hold (it only touches progress/stalled)", () => {
    const d = decide([perf([8, 8, 8]), perf([3, 8, 8], { rir: [0, 0, 0] })]);
    expect(d.state).toBe("hold");
    expect(d.rirEffect).toBeNull();
    expect(d.evidence.kind).toBe("reassess");
  });
});

describe("a workout finished short of the plan (RD-3)", () => {
  it("a short failed workout blocks an older Progress candidate", () => {
    const d = decide([perf([10, 10, 10]), perf([10, 10, 10]), short([3])]);
    expect(d.state).toBe("hold");
    expect(d.evidence).toMatchObject({
      kind: "reassess",
      reps: [3],
      latest: { loggedExerciseId: "le-003" },
    });
  });

  it("a short failed workout replaces a stay-at-weight hold", () => {
    const d = decide([perf([8, 8, 8]), perf([8, 8, 8]), short([3])]);
    expect(d.evidence.kind).toBe("reassess");
  });

  it("stays decisive past a later short workout without a failed set", () => {
    const d = decide([
      perf([10, 10, 10]),
      perf([10, 10, 10]),
      short([3]),
      short([8]),
    ]);
    expect(d.evidence).toMatchObject({
      kind: "reassess",
      latest: { loggedExerciseId: "le-003" },
    });
  });

  it("never counts toward the reactive Deload window", () => {
    // complete-below, short-below: the window (complete sessions only) holds
    // one failure, so no Deload; the short one asks to reassess.
    const d = decide([perf([8, 8, 8]), perf([5, 8, 8]), short([3])]);
    expect(d.state).toBe("hold");
    expect(d.evidence.kind).toBe("reassess");
  });

  it("the reactive Deload still outranks it", () => {
    const d = decide([perf([5, 8, 8]), perf([5, 8, 8]), short([3])]);
    expect(d.state).toBe("deload");
  });

  it("a short workout without a set below the minimum changes nothing", () => {
    const d = decide([perf([10, 10, 10]), perf([10, 10, 10]), short([10])]);
    expect(d.state).toBe("progress");
  });

  it("is never judged before any counted session (insufficient)", () => {
    expect(decide([short([3])]).state).toBe("insufficient");
    expect(decide([perf([8, 8, 8]), short([3])]).state).toBe("insufficient");
  });
});

describe("never judged: the workout in progress and the scheduled deload week", () => {
  it("today's advice ignores sets in the workout still open (RD-4)", () => {
    const d = decide([perf([10, 10, 10]), perf([10, 10, 10]), open([3])]);
    expect(d.state).toBe("progress");
  });

  it("a below-minimum set in a scheduled-deload week is never judged (R37)", () => {
    const d = decide([
      perf([8, 8, 8]),
      perf([8, 8, 8]),
      short([3], { scheduledDeload: true }),
    ]);
    expect(d.evidence.kind).toBe("hold_short");
    const e = decide([
      perf([8, 8, 8]),
      perf([8, 8, 8]),
      perf([3, 8, 8], { scheduledDeload: true }),
    ]);
    expect(e.evidence.kind).toBe("hold_short");
  });

  it("shortFailureSinceLastCounted only looks after the latest counted session", () => {
    // Dates follow creation order: a < before < b < after.
    const a = perf([8, 8, 8]);
    const before = short([3]);
    const b = perf([8, 8, 8]);
    const after = short([3]);
    expect(shortFailureSinceLastCounted([a, before, b])).toBeNull();
    expect(shortFailureSinceLastCounted([a, before, b, after])).toBe(after);
  });
});

describe("bodyweight follows the same rule", () => {
  it("reassesses a reps-only lift after a set below the minimum", () => {
    const d = decide(
      [
        perf([12, 12, 12], { weight: null, repMin: 10, repMax: 12 }),
        perf([6, 12, 12], { weight: null, repMin: 10, repMax: 12 }),
      ],
      true,
    );
    expect(d.state).toBe("hold");
    expect(d.evidence.kind).toBe("reassess");
  });
});

describe("fixed rep targets: min = max = 10 (spec §3.2)", () => {
  const fixed = (reps: number[], o: Opts = {}) =>
    perf(reps, { repMin: 10, repMax: 10, ...o });

  it("10 reaches the target; 9 is below it", () => {
    expect(isAllTop(fixed([10, 10, 10]))).toBe(true);
    expect(hasBelowMin(fixed([10, 10, 9]))).toBe(true);
    expect(hasBelowMin(fixed([10, 10, 10]))).toBe(false);
  });

  it("progresses at 10 (no unreachable upper bound)", () => {
    expect(decide([fixed([10, 10, 10]), fixed([10, 10, 10])]).state).toBe(
      "progress",
    );
  });

  it("one session at the target is hold_top_once", () => {
    expect(
      decide([fixed([10, 10, 9]), fixed([10, 10, 10])]).evidence.kind,
    ).toBe("hold_top_once");
  });

  it("one miss is a reassess; two in a row a Deload", () => {
    expect(
      decide([fixed([10, 10, 10]), fixed([10, 10, 9])]).evidence.kind,
    ).toBe("reassess");
    expect(decide([fixed([10, 10, 9]), fixed([10, 9, 9])]).state).toBe(
      "deload",
    );
  });
});

describe("the reassess words (one builder, RD-5)", () => {
  function words(
    perfs: Performance[],
    over: Partial<
      Extract<RecommendationInput, { scheduledDeload: false }>
    > = {},
  ) {
    const d = decide(perfs, over.externalLoad === false);
    return buildRecommendation({
      scheduledDeload: false,
      state: d.state,
      rirEffect: d.rirEffect,
      evidence: d.evidence,
      externalLoad: true,
      workingWeightLbs: 90,
      progressLoadLbs: null,
      gymName: null,
      latestIsLastTime: true,
      referenceIso: "2026-10-20",
      when: "next",
      ...over,
    });
  }

  it("external load: reassess the weight, no number, strong, kind reassess", () => {
    const rec = words([perf([8, 8, 8]), perf([3, 8, 8])]);
    expect(rec).toEqual({
      kind: "reassess",
      tone: "strong",
      action: "Reassess the weight next time",
      evidence:
        "Last time: 3, 8, 8 of 6–10, below 6. A deload follows 2 complete sessions running below 6.",
    });
    expect(rec!.action).not.toMatch(/Stay at|\d/);
  });

  it("today, at a gym, and dated when it isn't the last session", () => {
    const rec = words([perf([8, 8, 8]), perf([3, 8, 8])], {
      when: "today",
      gymName: "Downtown Gym",
      latestIsLastTime: false,
    });
    expect(rec!.action).toBe("Reassess the weight today");
    expect(rec!.evidence).toBe(
      "On Oct 2: 3, 8, 8 of 6–10 at Downtown Gym, below 6. A deload follows 2 complete sessions running below 6.",
    );
  });

  it("bodyweight: reassess the difficulty", () => {
    const rec = words(
      [perf([12, 12], { weight: null }), perf([4, 12], { weight: null })],
      { externalLoad: false, workingWeightLbs: null },
    );
    expect(rec!.action).toBe("Reassess the difficulty next time");
  });

  it("a fixed target prints one number in both hold lines", () => {
    const fixed = (reps: number[]) => perf(reps, { repMin: 10, repMax: 10 });
    expect(words([fixed([10, 10, 10]), fixed([10, 6, 4])])!.evidence).toBe(
      "Last time: 10, 6, 4 of 10, below 10. A deload follows 2 complete sessions running below 10.",
    );
    // hold_short can't occur at a fixed target (any miss is below it), so
    // prove its formatting with a range instead, and the formatter directly.
    expect(words([perf([8, 8, 8]), perf([7, 7, 6])])!.evidence).toBe(
      "Last time: 7, 7, 6 of 6–10",
    );
  });

  it("an in-range miss keeps the stay-at-weight hold", () => {
    expect(words([perf([8, 8, 8]), perf([7, 7, 6])])!.action).toBe(
      "Stay at 90 lb next time",
    );
  });
});

describe("formatRepTarget", () => {
  it("prints one number for a fixed target and an en dash for a range", () => {
    expect(formatRepTarget(10, 10)).toBe("10");
    expect(formatRepTarget(6, 10)).toBe("6–10");
  });
});
