import {
  evaluateReactive,
  evaluateReactiveDecision,
  hasRepsToSpare,
  hasSetAtLimit,
  type Performance,
} from "@/lib/progression/engine";
import {
  RIR_AT_LIMIT,
  RIR_TO_SPARE_MIN,
  STALL_WINDOW_SESSIONS,
} from "@/lib/progression/config";
import { rirReason, rirReasonShort } from "@/lib/progression/rir-copy";

/**
 * RIR-aware progression (RIR Logging & Autoregulation spec §6, §14.1;
 * Resolved Decisions R11–R15). The weights-and-reps ladder runs unchanged;
 * then RIR from the planned working sets of the latest qualifying performance
 * may (A) hold a Progress reached at 0 RIR, or (B) release a flat-trend hold
 * when every set had 2+. Nothing else changes, and missing RIR is never 0.
 *
 * Bench 3 × 6–8. "top" = 8, 8, 8 (every set at the top of the range).
 */
let seq = 0;
beforeEach(() => {
  seq = 0;
});

type Opts = {
  weight?: number;
  rir?: (number | null)[];
  scheduledDeload?: boolean;
  complete?: boolean;
  dateIso?: string;
};

function perf(reps: number[], opts: Opts = {}): Performance {
  seq += 1;
  return {
    loggedExerciseId: `le-${String(seq).padStart(3, "0")}`,
    dateIso: opts.dateIso ?? `2026-08-${String(seq).padStart(2, "0")}`,
    week: seq,
    scheduledDeload: opts.scheduledDeload ?? false,
    gymId: null,
    complete: opts.complete ?? true,
    repMin: 6,
    repMax: 8,
    workingSets: reps.map((r, i) => ({
      setNumber: i + 1,
      weightLbs: opts.weight ?? 185,
      reps: r,
      rir: opts.rir?.[i] ?? null,
    })),
  };
}
const TOP = [8, 8, 8];
const decide = (perfs: Performance[], e1rmApplicable = true) =>
  evaluateReactiveDecision(perfs, { e1rmApplicable });

describe("constants (named, never literals in the engine)", () => {
  it("at the limit is 0 RIR; reps to spare is 2+", () => {
    expect(RIR_AT_LIMIT).toBe(0);
    expect(RIR_TO_SPARE_MIN).toBe(2);
  });
});

describe("a history without RIR evaluates exactly as before (AC-2 regression)", () => {
  // A deterministic sweep of rep histories with every rir NULL: the final call
  // must equal the weights-and-reps call, with no RIR effect.
  function lcg(seed: number) {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  }
  it("for 500 generated histories, state === base and rirEffect is null", () => {
    const rand = lcg(42);
    for (let i = 0; i < 500; i++) {
      seq = 0;
      const n = Math.floor(rand() * 6);
      const perfs = Array.from({ length: n }, () =>
        perf(
          [0, 1, 2].map(() => 5 + Math.floor(rand() * 5)),
          {
            weight: 175 + 5 * Math.floor(rand() * 4),
            scheduledDeload: rand() < 0.1,
            complete: rand() > 0.1,
          },
        ),
      );
      const d = decide(perfs, rand() > 0.2);
      expect(d.rirEffect).toBeNull();
      expect(d.state).toBe(d.base);
    }
  });

  it("evaluateReactive keeps returning the final state", () => {
    const perfs = [perf(TOP), perf(TOP, { rir: [2, 1, 0] })];
    expect(evaluateReactive(perfs)).toBe(decide(perfs).state);
  });
});

describe("case A — the top of the range reached at the limit holds (R12)", () => {
  it("two all-top sessions, latest set 3 at 0 RIR → hold, held_at_limit", () => {
    const d = decide([perf(TOP), perf(TOP, { rir: [2, 1, 0] })]);
    expect(d).toEqual({
      state: "hold",
      base: "progress",
      rirEffect: "held_at_limit",
    });
  });

  it("the same reps with reps to spare stay Progress (AC-3 pair)", () => {
    expect(decide([perf(TOP), perf(TOP, { rir: [2, 2, 3] })])).toEqual({
      state: "progress",
      base: "progress",
      rirEffect: null,
    });
    // …and with 1 RIR on every set (not at the limit) too.
    expect(decide([perf(TOP), perf(TOP, { rir: [1, 1, 1] })]).state).toBe(
      "progress",
    );
  });

  it("one reported 0 is enough even when the other sets are unrecorded", () => {
    expect(
      decide([perf(TOP), perf(TOP, { rir: [null, null, 0] })]).rirEffect,
    ).toBe("held_at_limit");
  });

  it("unrecorded RIR is never taken as 0", () => {
    expect(decide([perf(TOP), perf(TOP)]).state).toBe("progress");
  });

  it("only the latest qualifying performance is read", () => {
    // An older 0 does not hold back a lift since done with room to spare.
    expect(
      decide([perf(TOP, { rir: [0, 0, 0] }), perf(TOP, { rir: [2, 2, 2] })])
        .state,
    ).toBe("progress");
  });

  it("an incomplete or scheduled-deload session is not 'latest'", () => {
    const base = [perf(TOP), perf(TOP, { rir: [2, 2, 2] })];
    expect(
      decide([...base, perf([8, 8], { rir: [0, 0], complete: false })]).state,
    ).toBe("progress");
    expect(
      decide([...base, perf(TOP, { rir: [0, 0, 0], scheduledDeload: true })])
        .state,
    ).toBe("progress");
  });

  it("applies to bodyweight (no e1RM gate) the same way", () => {
    const bw = (rir: (number | null)[]) => [
      perf(TOP, { weight: 0 }),
      perf(TOP, { weight: 0, rir }),
    ];
    expect(decide(bw([1, 0, 2]), false)).toEqual({
      state: "hold",
      base: "progress",
      rirEffect: "held_at_limit",
    });
    expect(decide(bw([3, 3, 3]), false).state).toBe("progress");
  });
});

describe("case B — every set with reps to spare releases a flat trend (R13)", () => {
  // Three all-top sessions at the same load: e1RM flat → the stall gate holds.
  const flat = (latestRir: (number | null)[]) => [
    perf(TOP),
    perf(TOP),
    perf(TOP, { rir: latestRir }),
  ];

  it("the window is the stall window", () => {
    expect(flat([]).length).toBe(STALL_WINDOW_SESSIONS);
  });

  it("without RIR the stall stands", () => {
    expect(decide(flat([]))).toEqual({
      state: "stalled",
      base: "stalled",
      rirEffect: null,
    });
  });

  it("every working set 2+ → progress, released_stall", () => {
    expect(decide(flat([3, 2, 2]))).toEqual({
      state: "progress",
      base: "stalled",
      rirEffect: "released_stall",
    });
    expect(decide(flat([4, 4, 4])).rirEffect).toBe("released_stall");
  });

  it("one unrecorded set → the stall stands (coverage incomplete, R14)", () => {
    expect(decide(flat([3, null, 2])).state).toBe("stalled");
  });

  it("one set at 1 → the stall stands (boundary)", () => {
    expect(decide(flat([2, 2, 1])).state).toBe("stalled");
  });

  it("a 0 in a flat window keeps the existing Hold — trend flat, unreworded", () => {
    expect(decide(flat([2, 2, 0]))).toEqual({
      state: "stalled",
      base: "stalled",
      rirEffect: null,
    });
  });

  it("a FALLING trend is never released, even with every set 2+ (R33)", () => {
    // All-top sessions at a lower load each time: e1RM falls; the stall stands
    // and the copy's "flat" is never said about a falling trend.
    const falling = [
      perf(TOP, { weight: 190 }),
      perf(TOP, { weight: 185 }),
      perf(TOP, { weight: 180, rir: [3, 3, 3] }),
    ];
    expect(decide(falling)).toEqual({
      state: "stalled",
      base: "stalled",
      rirEffect: null,
    });
  });

  it("a rising trend is Progress already; RIR 2+ changes nothing", () => {
    const rising = [
      perf(TOP, { weight: 180 }),
      perf(TOP, { weight: 185 }),
      perf(TOP, { weight: 190, rir: [2, 2, 2] }),
    ];
    expect(decide(rising)).toEqual({
      state: "progress",
      base: "progress",
      rirEffect: null,
    });
  });
});

describe("RIR never touches insufficient, deload, or an ordinary hold (R15)", () => {
  it("insufficient history stays insufficient", () => {
    expect(decide([perf(TOP, { rir: [0, 0, 0] })])).toEqual({
      state: "insufficient",
      base: "insufficient",
      rirEffect: null,
    });
  });

  it("a reactive Deload is never cancelled by reps to spare", () => {
    const d = decide([perf([8, 6, 5]), perf([8, 6, 5], { rir: [4, 4, 4] })]);
    expect(d).toEqual({ state: "deload", base: "deload", rirEffect: null });
  });

  it("a hold is never turned into a Deload by sets at the limit", () => {
    const d = decide([perf([8, 7, 7]), perf([8, 7, 7], { rir: [0, 0, 0] })]);
    expect(d).toEqual({ state: "hold", base: "hold", rirEffect: null });
  });

  it("a hold is never turned into a Progress by reps to spare", () => {
    const d = decide([perf([8, 7, 7]), perf([8, 7, 7], { rir: [4, 4, 4] })]);
    expect(d).toEqual({ state: "hold", base: "hold", rirEffect: null });
  });
});

describe("determinism", () => {
  it("the same input gives the same output, in any input order", () => {
    const perfs = [perf(TOP), perf(TOP), perf(TOP, { rir: [3, 2, 2] })];
    const a = decide(perfs);
    expect(decide(perfs)).toEqual(a);
    expect(decide([...perfs].reverse())).toEqual(a);
    expect(decide([perfs[1], perfs[2], perfs[0]])).toEqual(a);
  });
});

describe("helpers", () => {
  it("hasSetAtLimit and hasRepsToSpare read only reported values", () => {
    expect(hasSetAtLimit(perf(TOP, { rir: [null, null, null] }))).toBe(false);
    expect(hasSetAtLimit(perf(TOP, { rir: [3, 0, 3] }))).toBe(true);
    expect(hasRepsToSpare(perf(TOP, { rir: [2, 2, 2] }))).toBe(true);
    expect(hasRepsToSpare(perf(TOP, { rir: [2, 2, null] }))).toBe(false);
    expect(hasRepsToSpare(perf([], { rir: [] }))).toBe(false);
  });
});

describe("reason copy names the rule that was applied (R20)", () => {
  it("renders the exact sentences, with the figures from the constants", () => {
    expect(rirReason("held_at_limit")).toBe(
      "Top of the range, but at your limit last time (0 RIR) — holding.",
    );
    expect(rirReason("released_stall")).toBe(
      "e1RM is flat, but every set last time had 2+ in reserve — ready to go up.",
    );
    expect(rirReason(null)).toBeNull();
    expect(rirReasonShort("held_at_limit")).toBe("at your limit — holding");
    expect(rirReasonShort("released_stall")).toBe("reps to spare");
    expect(rirReasonShort(null)).toBeNull();
  });
});
