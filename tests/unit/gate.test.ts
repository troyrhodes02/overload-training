import {
  gateHistory,
  gateOccurrence,
  gatePlanned,
  gateSessionSummary,
} from "@/lib/entitlements/gate";
import { capabilitiesFor } from "@/lib/entitlements/resolve";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

/**
 * The pure Pro gate (spec RD-9). Withholds progression/history Pro fields when
 * the capability is absent and sets the `locked` marker; passes everything
 * through when present. This is the unit-level AC-2 proof; the query-layer
 * proof (a Free account's direct read gets no Pro value) is in the integration
 * suite.
 */

const REC = {
  kind: "progress",
  tone: "strong",
  action: "Try 190 lb",
  evidence: "e",
} as const;

function pro(): ResolvedEntitlement {
  return {
    plan: "pro",
    capabilities: capabilitiesFor("pro"),
    sources: ["comp"],
    displayState: "comp",
    trialDaysLeft: null,
  };
}
function free(): ResolvedEntitlement {
  return {
    plan: "free",
    capabilities: capabilitiesFor("free"),
    sources: [],
    displayState: "free",
    trialDaysLeft: null,
  };
}

const plannedPro = {
  tag: "progress" as const,
  rirEffect: null,
  gymVariable: false,
  suggestion: { lbs: 190, kind: "progress_increment" as const },
  hasTrend: true,
  recommendation: REC,
};

describe("gatePlanned", () => {
  it("passes Pro results through for a Pro account", () => {
    const r = gatePlanned(plannedPro, true);
    expect(r.tag).toBe("progress");
    expect(r.recommendation).toEqual(REC);
    expect(r.suggestion).not.toBeNull();
    expect(r.locked).toBeNull();
  });

  it("withholds every Pro field for a Free account", () => {
    const r = gatePlanned(plannedPro, false);
    expect(r.tag).toBeNull();
    expect(r.recommendation).toBeNull();
    expect(r.suggestion).toBeNull();
    expect(r.hasTrend).toBe(false);
    expect(r.rirEffect).toBeNull();
    expect(r.locked).toBe("progression_insights");
  });
});

describe("gateOccurrence / gateSessionSummary", () => {
  it("occurrence withholds the call for Free, keeps it for Pro", () => {
    const occ = {
      loggedExerciseId: "le1",
      scheduledDeloadWeek: false,
      tag: "deload" as const,
      rirEffect: null,
      suggestion: null,
      historyHref: "/exercises/x",
      recommendation: REC,
    };
    expect(gateOccurrence(occ, true).recommendation).toEqual(REC);
    const gated = gateOccurrence(occ, false);
    expect(gated.tag).toBeNull();
    expect(gated.recommendation).toBeNull();
    expect(gated.locked).toBe("progression_insights");
    // The history link stays — the page gates itself.
    expect(gated.historyHref).toBe("/exercises/x");
  });

  it("session summary withholds each exercise's call for Free", () => {
    const summary = {
      loggedSessionId: "ls1",
      scheduledDeloadWeek: false,
      exercises: [
        {
          performedExerciseId: "e1",
          performedExerciseName: "Bench",
          tag: "progress" as const,
          rirEffect: null,
          suggestion: { lbs: 190, kind: "progress_increment" as const },
          historyHref: null,
          recommendation: REC,
          plannedSets: 3,
          loggedWorkingSets: 3,
        },
      ],
    };
    const gated = gateSessionSummary(summary, false);
    expect(gated.locked).toBe("progression_insights");
    expect(gated.exercises[0].tag).toBeNull();
    expect(gated.exercises[0].recommendation).toBeNull();
    expect(gated.exercises[0].suggestion).toBeNull();
    // Free-visible plan facts stay.
    expect(gated.exercises[0].loggedWorkingSets).toBe(3);
    expect(
      gateSessionSummary(summary, true).exercises[0].recommendation,
    ).toEqual(REC);
  });
});

describe("gateHistory", () => {
  const base = {
    exerciseId: "x",
    gymVariable: false,
    externalLoad: true,
    hasHistory: true,
    scopes: [],
    selectedScope: null,
    next: {
      kind: "call" as const,
      tag: "progress" as const,
      recommendation: REC,
      insufficientNote: null,
    },
    records: {
      kind: "loaded" as const,
      bestSet: {
        weightLbs: 225,
        reps: 5,
        dateIso: "2026-10-01",
        dateLabel: "Oct 1",
      },
      bestE1rm: 253,
      heaviest: {
        weightLbs: 225,
        reps: 5,
        dateIso: "2026-10-01",
        dateLabel: "Oct 1",
      },
      repRecords: [
        {
          weightLbs: 225,
          reps: 5,
          dateIso: "2026-10-01",
          dateLabel: "Oct 1",
        },
      ],
    },
    trend: {
      e1rm: { points: [], latest: 253 },
      weight: { points: [], latest: 225 },
      reps: null,
    },
    sessions: {
      rows: [
        {
          loggedExerciseId: "le1",
          loggedSessionId: "ls1",
          dateIso: "2026-10-01",
          dateLabel: "Oct 1",
          gymName: null,
          gymArchived: false,
          workingSets: [{ weightLbs: 225, reps: 5, rir: null }],
          extraSets: [],
          plannedSets: 3,
          swappedFromName: null,
          call: "progress" as const,
        },
      ],
      total: 1,
      showingAll: true,
    },
  };

  it("passes everything through for a Pro account", () => {
    const r = gateHistory(base, pro());
    expect(r.locked).toBeNull();
    expect(r.next).toEqual(base.next);
    expect(r.records?.kind === "loaded" && r.records.bestE1rm).toBe(253);
    expect(r.trend.e1rm).not.toBeNull();
    expect(r.sessions.rows[0].call).toBe("progress");
  });

  it("withholds the call, e1RM estimate, e1RM/weight trends, and per-session calls for Free", () => {
    const r = gateHistory(base, free());
    expect(r.locked).toBe("progression_insights");
    expect(r.next).toEqual({
      kind: "call",
      tag: null,
      recommendation: null,
      insufficientNote: null,
    });
    expect(r.records?.kind === "loaded" && r.records.bestE1rm).toBeNull();
    // Free keeps the plain best set + heaviest.
    expect(r.records?.kind === "loaded" && r.records.bestSet.weightLbs).toBe(
      225,
    );
    expect(r.trend.e1rm).toBeNull();
    expect(r.trend.weight).toBeNull();
    expect(r.sessions.rows[0].call).toBe("none");
  });
});

describe("gateHistory: rep records and the upgrade marker (Entitlement Audit)", () => {
  const base = {
    exerciseId: "x",
    gymVariable: false,
    externalLoad: true,
    hasHistory: true,
    scopes: [],
    selectedScope: null,
    next: {
      kind: "call" as const,
      tag: null,
      recommendation: null,
      insufficientNote: "Not enough history yet: 1 of 2 complete sessions.",
    },
    records: {
      kind: "loaded" as const,
      bestSet: {
        weightLbs: 225,
        reps: 5,
        dateIso: "2026-10-01",
        dateLabel: "Oct 1",
      },
      bestE1rm: 253,
      heaviest: {
        weightLbs: 225,
        reps: 5,
        dateIso: "2026-10-01",
        dateLabel: "Oct 1",
      },
      repRecords: [
        { weightLbs: 225, reps: 5, dateIso: "2026-10-01", dateLabel: "Oct 1" },
      ],
    },
    trend: { e1rm: null, weight: null, reps: null },
    sessions: { rows: [], total: 0, showingAll: true },
  };

  it("withholds the rep-record frontier without exercise_history_intelligence (spec RD-1)", () => {
    const r = gateHistory(base, free());
    expect(r.records?.kind === "loaded" && r.records.repRecords).toBeNull();
    expect(gateHistory(base, pro()).records).toEqual(base.records);
  });

  it("keeps the not-enough-history line on Free: it is a data state, not a call", () => {
    const r = gateHistory(base, free());
    expect(r.next).toEqual(base.next);
    // The estimate was withheld, so the marker names that capability.
    expect(r.locked).toBe("e1rm_trends");
  });

  it("sets no marker when nothing was withheld (no history)", () => {
    const empty = {
      ...base,
      hasHistory: false,
      next: null,
      records: null,
    };
    expect(gateHistory(empty, free()).locked).toBeNull();
  });

  it("a non-interpreting per-session state is blanked but does not trigger the marker", () => {
    const rows = [
      {
        loggedExerciseId: "le1",
        loggedSessionId: "ls1",
        dateIso: "2026-10-01",
        dateLabel: "Oct 1",
        gymName: null,
        gymArchived: false,
        workingSets: [{ weightLbs: null, reps: 10, rir: null }],
        extraSets: [],
        plannedSets: 1,
        swappedFromName: null,
        call: "insufficient" as const,
      },
    ];
    const r = gateHistory(
      {
        ...base,
        records: null,
        sessions: { rows, total: 1, showingAll: true },
      },
      free(),
    );
    expect(r.sessions.rows[0].call).toBe("none");
    expect(r.sessions.rows[0].workingSets).toEqual(rows[0].workingSets);
    expect(r.locked).toBeNull();
  });
});

describe("planned / occurrence / summary marker only when a call was withheld", () => {
  const empty = {
    tag: null,
    rirEffect: null,
    gymVariable: false,
    suggestion: null,
    hasTrend: false,
    recommendation: null,
  };
  it("planned: no call and no history means no marker", () => {
    expect(gatePlanned(empty, false).locked).toBeNull();
  });
  it("planned: a gym-variable lift with history has a call waiting, so it is marked", () => {
    expect(
      gatePlanned({ ...empty, gymVariable: true, hasTrend: true }, false)
        .locked,
    ).toBe("progression_insights");
  });
  it("occurrence: insufficient history means no marker", () => {
    const occ = {
      loggedExerciseId: "le1",
      scheduledDeloadWeek: false,
      tag: null,
      rirEffect: null,
      suggestion: null,
      historyHref: null,
      recommendation: null,
    };
    expect(gateOccurrence(occ, false).locked).toBeNull();
  });
  it("summary: no exercise with a call means no marker", () => {
    expect(
      gateSessionSummary(
        { loggedSessionId: "ls1", scheduledDeloadWeek: false, exercises: [] },
        false,
      ).locked,
    ).toBeNull();
  });
});

describe("review follow-ups: no marker or Pro-only line without a withheld result", () => {
  const planned = {
    tag: null,
    rirEffect: null,
    gymVariable: false,
    suggestion: null,
    hasTrend: true,
    recommendation: null,
  };
  it("a free-weight lift with a trend but no call (not enough history) gets no marker", () => {
    expect(gatePlanned(planned, false).locked).toBeNull();
  });
  it("Free never sees the gym-variable placeholder that promises a call", () => {
    expect(gatePlanned({ ...planned, gymVariable: true }, false)).toMatchObject(
      { gymVariable: false, locked: "progression_insights" },
    );
    expect(
      gatePlanned({ ...planned, gymVariable: true }, true).gymVariable,
    ).toBe(true);
  });

  const deloadRec = {
    kind: "scheduled_deload",
    tone: "quiet",
    action: "Deload week",
    evidence: "Planned recovery",
  } as const;
  const occ = {
    loggedExerciseId: "le1",
    scheduledDeloadWeek: true,
    tag: null,
    rirEffect: null,
    suggestion: null,
    historyHref: null,
    recommendation: deloadRec,
  };
  it("a bare scheduled-deload line (no load) is not a withheld Pro result", () => {
    expect(gateOccurrence(occ, false).locked).toBeNull();
    expect(
      gateSessionSummary(
        {
          loggedSessionId: "ls1",
          scheduledDeloadWeek: true,
          exercises: [
            {
              performedExerciseId: "e1",
              performedExerciseName: "Bench",
              tag: null,
              rirEffect: null,
              suggestion: null,
              historyHref: null,
              recommendation: deloadRec,
              plannedSets: 3,
              loggedWorkingSets: 3,
            },
          ],
        },
        false,
      ).locked,
    ).toBeNull();
  });
  it("a scheduled-deload load (90%) is withheld and marked", () => {
    const r = gateOccurrence(
      {
        ...occ,
        suggestion: { lbs: 165, kind: "scheduled_deload" as const },
        recommendation: { ...deloadRec, action: "Deload week: 165 lb (90%)" },
      },
      false,
    );
    expect(r.locked).toBe("progression_insights");
    expect(r.suggestion).toBeNull();
    expect(r.recommendation).toBeNull();
  });

  it("history: the per-gym calls note is not shown on Free", () => {
    const dto = {
      exerciseId: "x",
      gymVariable: true,
      externalLoad: true,
      hasHistory: true,
      scopes: [],
      selectedScope: null,
      next: { kind: "no_gym" as const },
      records: null,
      trend: { e1rm: null, weight: null, reps: null },
      sessions: { rows: [], total: 0, showingAll: true },
    };
    expect(gateHistory(dto, free()).next).toBeNull();
    expect(gateHistory(dto, pro()).next).toEqual({ kind: "no_gym" });
  });
});
