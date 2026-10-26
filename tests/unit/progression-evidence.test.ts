import {
  evaluateReactive,
  evaluateReactiveDecision,
  type Performance,
} from "@/lib/progression/engine";
import {
  DELOAD_CONSECUTIVE_SESSIONS,
  MIN_QUALIFYING_SESSIONS,
  PROGRESS_CONSECUTIVE_SESSIONS,
  RIR_AT_LIMIT,
  RIR_TO_SPARE_MIN,
  STALL_WINDOW_SESSIONS,
} from "@/lib/progression/config";

/**
 * The evidence the deciding branch returns with the call (Smarter &
 * Explainable Progression spec §6, §14.1; R3). The rules are unchanged: each
 * case below reaches the same state it always did, and the evidence names the
 * facts that branch read.
 *
 * Bench 3 × 8–10 unless a case says otherwise.
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
  repMin?: number;
  repMax?: number;
};

function perf(reps: number[], opts: Opts = {}): Performance {
  seq += 1;
  return {
    loggedExerciseId: `le-${String(seq).padStart(3, "0")}`,
    dateIso: `2026-09-${String(seq).padStart(2, "0")}`,
    week: seq,
    scheduledDeload: opts.scheduledDeload ?? false,
    gymId: null,
    complete: opts.complete ?? true,
    repMin: opts.repMin ?? 8,
    repMax: opts.repMax ?? 10,
    workingSets: reps.map((r, i) => ({
      setNumber: i + 1,
      weightLbs: opts.weight ?? 185,
      reps: r,
      rir: opts.rir?.[i] ?? null,
    })),
  };
}
const TOP = [10, 10, 10];

describe("evidence follows the branch that decided the call", () => {
  it("insufficient: the count and the requirement", () => {
    const d = evaluateReactiveDecision([perf(TOP)]);
    expect(d.state).toBe("insufficient");
    expect(d.evidence).toEqual({
      kind: "insufficient",
      qualifying: 1,
      required: MIN_QUALIFYING_SESSIONS,
    });
  });

  it("insufficient counts only counted sessions (incomplete and deload-week excluded)", () => {
    const d = evaluateReactiveDecision([
      perf(TOP),
      perf(TOP, { complete: false }),
      perf(TOP, { scheduledDeload: true }),
    ]);
    expect(d.evidence).toEqual({
      kind: "insufficient",
      qualifying: 1,
      required: MIN_QUALIFYING_SESSIONS,
    });
  });

  it("progress before the stall window: the rep rule and its window", () => {
    const d = evaluateReactiveDecision([perf(TOP), perf(TOP)]);
    expect(d.state).toBe("progress");
    expect(d.evidence).toEqual({
      kind: "progress",
      sessions: PROGRESS_CONSECUTIVE_SESSIONS,
      repMax: 10,
    });
  });

  it("progress with a rising trend still names the rep rule (R15)", () => {
    const d = evaluateReactiveDecision([
      perf(TOP, { weight: 175 }),
      perf(TOP, { weight: 180 }),
      perf(TOP, { weight: 185 }),
    ]);
    expect(d.state).toBe("progress");
    expect(d.evidence.kind).toBe("progress");
  });

  it("a window whose planned ranges differ has no single top (R14)", () => {
    const d = evaluateReactiveDecision([
      perf([10, 10, 10], { repMin: 8, repMax: 10 }),
      perf([8, 8, 8], { repMin: 6, repMax: 8 }),
    ]);
    expect(d.state).toBe("progress");
    expect(d.evidence).toEqual({
      kind: "progress",
      sessions: PROGRESS_CONSECUTIVE_SESSIONS,
      repMax: null,
    });
  });

  it("stalled (flat or falling): the rep window and the trend window", () => {
    const flat = evaluateReactiveDecision([perf(TOP), perf(TOP), perf(TOP)]);
    expect(flat.state).toBe("stalled");
    expect(flat.evidence).toEqual({
      kind: "stalled",
      sessions: PROGRESS_CONSECUTIVE_SESSIONS,
      window: STALL_WINDOW_SESSIONS,
      repMax: 10,
    });
    const falling = evaluateReactiveDecision([
      perf(TOP, { weight: 190 }),
      perf(TOP),
      perf(TOP),
    ]);
    expect(falling.state).toBe("stalled");
    expect(falling.evidence.kind).toBe("stalled");
  });

  it("hold, top once: the latest counted session and what progress needs", () => {
    const d = evaluateReactiveDecision([perf([10, 9, 8]), perf(TOP)]);
    expect(d.state).toBe("hold");
    expect(d.evidence).toEqual({
      kind: "hold_top_once",
      repMax: 10,
      sessions: PROGRESS_CONSECUTIVE_SESSIONS,
      latest: { loggedExerciseId: "le-002", dateIso: "2026-09-02" },
    });
  });

  it("hold, short of the top: that session's reps in set order and its range", () => {
    const p1 = perf(TOP);
    const p2 = perf([10, 9, 8]);
    p2.workingSets.reverse(); // stored order must not matter
    const d = evaluateReactiveDecision([p1, p2]);
    expect(d.state).toBe("hold");
    expect(d.evidence).toEqual({
      kind: "hold_short",
      reps: [10, 9, 8],
      repMin: 8,
      repMax: 10,
      latest: { loggedExerciseId: "le-002", dateIso: "2026-09-02" },
    });
  });

  it("a below-minimum set in only one session is a hold, not a deload", () => {
    const d = evaluateReactiveDecision([perf(TOP), perf([10, 8, 6])]);
    expect(d.state).toBe("hold");
    expect(d.evidence.kind).toBe("hold_short");
  });

  it("deload: the minimum and the window", () => {
    const d = evaluateReactiveDecision([perf([9, 7, 7]), perf([8, 7, 6])]);
    expect(d.state).toBe("deload");
    expect(d.evidence).toEqual({
      kind: "deload",
      sessions: DELOAD_CONSECUTIVE_SESSIONS,
      repMin: 8,
    });
  });

  it("deload across different minimums has no single minimum (R14)", () => {
    const d = evaluateReactiveDecision([
      perf([9, 7, 7], { repMin: 8 }),
      perf([5, 5, 5], { repMin: 6, repMax: 8 }),
    ]);
    expect(d.state).toBe("deload");
    expect(d.evidence).toEqual({
      kind: "deload",
      sessions: DELOAD_CONSECUTIVE_SESSIONS,
      repMin: null,
    });
  });

  it("RIR case A: held at the limit, from the latest counted session", () => {
    const d = evaluateReactiveDecision([
      perf(TOP),
      perf(TOP, { rir: [2, 1, 0] }),
    ]);
    expect(d.state).toBe("hold");
    expect(d.rirEffect).toBe("held_at_limit");
    expect(d.evidence).toEqual({
      kind: "held_at_limit",
      rirAtLimit: RIR_AT_LIMIT,
      latest: { loggedExerciseId: "le-002", dateIso: "2026-09-02" },
    });
  });

  it("RIR case B: a flat stall released by reps to spare", () => {
    const d = evaluateReactiveDecision([
      perf(TOP),
      perf(TOP),
      perf(TOP, { rir: [3, 2, 2] }),
    ]);
    expect(d.state).toBe("progress");
    expect(d.rirEffect).toBe("released_stall");
    expect(d.evidence).toEqual({
      kind: "released_stall",
      rirToSpare: RIR_TO_SPARE_MIN,
      latest: { loggedExerciseId: "le-003", dateIso: "2026-09-03" },
    });
  });

  it("RIR that changed nothing leaves the weights-and-reps evidence", () => {
    const d = evaluateReactiveDecision([
      perf(TOP),
      perf([10, 9, 8], { rir: [2, 1, 1] }),
    ]);
    expect(d.rirEffect).toBeNull();
    expect(d.evidence.kind).toBe("hold_short");
  });

  it("bodyweight progresses on the rep rule alone (no stall gate)", () => {
    const d = evaluateReactiveDecision([perf(TOP), perf(TOP), perf(TOP)], {
      e1rmApplicable: false,
    });
    expect(d.state).toBe("progress");
    expect(d.evidence.kind).toBe("progress");
  });

  it("deload-week performances are skipped: latest is the last counted one", () => {
    const d = evaluateReactiveDecision([
      perf(TOP),
      perf([10, 9, 8]),
      perf([7, 6, 6], { scheduledDeload: true }),
    ]);
    expect(d.evidence).toMatchObject({
      kind: "hold_short",
      latest: { loggedExerciseId: "le-002" },
    });
  });

  it("evidence is independent of input order, like the call", () => {
    const perfs = [perf(TOP), perf([10, 9, 8]), perf(TOP)];
    const a = evaluateReactiveDecision(perfs);
    expect(evaluateReactiveDecision([...perfs].reverse())).toEqual(a);
    expect(evaluateReactiveDecision([perfs[1], perfs[2], perfs[0]])).toEqual(a);
  });

  it("latestTopLoadLbs is the TOP (heaviest) working set's load of the latest counted session (R33, OVE-61)", () => {
    const first = perf(TOP);
    const pyramid = perf(TOP);
    pyramid.workingSets = pyramid.workingSets.map((s) => ({
      ...s,
      weightLbs: 175 + s.setNumber * 5,
    }));
    pyramid.workingSets.reverse(); // stored order must not matter
    // Ascending: the top set is also the last set (180, 185, 190).
    expect(evaluateReactiveDecision([first, pyramid]).latestTopLoadLbs).toBe(
      190,
    );
    // Descending/back-off: the heaviest set is the first, not the last one
    // logged — the anchor is the top set, not the final set (195, 185, 185).
    const descending = perf(TOP);
    descending.workingSets = descending.workingSets.map((s) => ({
      ...s,
      weightLbs: s.setNumber === 1 ? 195 : 185,
    }));
    descending.workingSets.reverse(); // stored order must not matter
    expect(evaluateReactiveDecision([first, descending]).latestTopLoadLbs).toBe(
      195,
    );
    // A later uncounted (incomplete) session doesn't move it.
    expect(
      evaluateReactiveDecision([
        perf(TOP, { weight: 185 }),
        perf(TOP, { weight: 185 }),
        perf([10], { weight: 200, complete: false }),
      ]).latestTopLoadLbs,
    ).toBe(185);
    expect(evaluateReactiveDecision([perf(TOP)]).latestTopLoadLbs).toBe(185);
    expect(evaluateReactiveDecision([]).latestTopLoadLbs).toBeNull();
    const bw = perf(TOP);
    bw.workingSets = bw.workingSets.map((s) => ({ ...s, weightLbs: null }));
    expect(
      evaluateReactiveDecision([bw], { e1rmApplicable: false })
        .latestTopLoadLbs,
    ).toBeNull();
  });

  it("the state is exactly what evaluateReactive returns (no rule change)", () => {
    const histories = [
      [perf(TOP)],
      [perf(TOP), perf(TOP)],
      [perf(TOP), perf(TOP), perf(TOP)],
      [perf([9, 7, 7]), perf([8, 7, 6])],
      [perf(TOP), perf([10, 9, 8])],
    ];
    for (const h of histories) {
      expect(evaluateReactiveDecision(h).state).toBe(evaluateReactive(h));
    }
  });
});
