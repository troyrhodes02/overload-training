import {
  authoredDate,
  effectiveWeekSchedule,
  occurrenceOnDate,
  oldestUnresolvedMissedDay,
  type ScheduleContext,
} from "@/lib/logging/schedule";

/**
 * Effective-schedule derivation (Resolved Decisions 2, 30, 36–38, A1, A4).
 * Pure; the start date 2026-11-02 is a Monday, so week 1 runs Mon Nov 2 – Sun Nov 8.
 */

const START = "2026-11-02"; // Monday
const PUSH = { id: "push", name: "Push Day 1", dayOfWeek: 1 }; // Mon → Nov 2
const PULL = { id: "pull", name: "Pull Day 1", dayOfWeek: 3 }; // Wed → Nov 4
const LEGS = { id: "legs", name: "Leg Day", dayOfWeek: 5 }; // Fri → Nov 6
const SUN = { id: "sun", name: "Conditioning", dayOfWeek: 7 }; // Sun → Nov 8

function ctx(over: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    startDate: START,
    lengthWeeks: 5,
    sessions: [PUSH, PULL, LEGS],
    resolutions: [],
    loggedSessions: [],
    ...over,
  };
}

describe("authoredDate", () => {
  it("places each ISO weekday on its date within the mesocycle week", () => {
    expect(authoredDate(START, 1, 1)).toBe("2026-11-02");
    expect(authoredDate(START, 1, 3)).toBe("2026-11-04");
    expect(authoredDate(START, 1, 5)).toBe("2026-11-06");
    expect(authoredDate(START, 1, 7)).toBe("2026-11-08");
    // Week 2 repeats, +7 days.
    expect(authoredDate(START, 2, 1)).toBe("2026-11-09");
  });
});

describe("effectiveWeekSchedule", () => {
  it("returns authored dates with no resolutions", () => {
    const occ = effectiveWeekSchedule(ctx(), 1);
    expect(occ.map((o) => o.effectiveIso)).toEqual([
      "2026-11-02",
      "2026-11-04",
      "2026-11-06",
    ]);
    expect(occ.every((o) => o.resolution === null && !o.dropped)).toBe(true);
  });

  it("skip resolves only its own day; others untouched", () => {
    const occ = effectiveWeekSchedule(
      ctx({ resolutions: [{ missedOn: "2026-11-02", outcome: "skipped" }] }),
      1,
    );
    expect(occ.find((o) => o.sessionId === "push")!.resolution).toBe("skipped");
    expect(occ.find((o) => o.sessionId === "pull")!.effectiveIso).toBe(
      "2026-11-04",
    );
  });

  it("shift moves the missed day and every later day forward one, within the week", () => {
    const occ = effectiveWeekSchedule(
      ctx({ resolutions: [{ missedOn: "2026-11-02", outcome: "shifted" }] }),
      1,
    );
    expect(occ.find((o) => o.sessionId === "push")!.effectiveIso).toBe(
      "2026-11-03",
    );
    expect(occ.find((o) => o.sessionId === "pull")!.effectiveIso).toBe(
      "2026-11-05",
    );
    expect(occ.find((o) => o.sessionId === "legs")!.effectiveIso).toBe(
      "2026-11-07",
    );
    expect(occ.find((o) => o.sessionId === "push")!.resolution).toBe("shifted");
  });

  it("drops a shifted occurrence pushed beyond the week; it never spills forward", () => {
    const occ = effectiveWeekSchedule(
      ctx({
        sessions: [PUSH, SUN], // Mon + Sun (Nov 8, week end)
        resolutions: [{ missedOn: "2026-11-02", outcome: "shifted" }],
      }),
      1,
    );
    expect(occ.find((o) => o.sessionId === "push")!.effectiveIso).toBe(
      "2026-11-03",
    );
    const sun = occ.find((o) => o.sessionId === "sun")!;
    expect(sun.dropped).toBe(true);
    expect(sun.effectiveIso).toBeNull();
  });

  it("consecutive shifts in one week compound only within the week", () => {
    const occ = effectiveWeekSchedule(
      ctx({
        resolutions: [
          { missedOn: "2026-11-02", outcome: "shifted" },
          { missedOn: "2026-11-04", outcome: "shifted" },
        ],
      }),
      1,
    );
    // Push: Mon→Tue (first shift only, authored 11-02 < 11-04).
    expect(occ.find((o) => o.sessionId === "push")!.effectiveIso).toBe(
      "2026-11-03",
    );
    // Pull: Wed→Thu (first) →Fri (second). Legs: Fri→Sat→Sun.
    expect(occ.find((o) => o.sessionId === "pull")!.effectiveIso).toBe(
      "2026-11-06",
    );
    expect(occ.find((o) => o.sessionId === "legs")!.effectiveIso).toBe(
      "2026-11-08",
    );
  });

  it("week 2 is independent of a week-1 shift (next week snaps back)", () => {
    const c = ctx({
      resolutions: [{ missedOn: "2026-11-02", outcome: "shifted" }],
    });
    const w2 = effectiveWeekSchedule(c, 2);
    expect(w2.map((o) => o.effectiveIso)).toEqual([
      "2026-11-09",
      "2026-11-11",
      "2026-11-13",
    ]);
  });

  it("attaches logged status by authored identity", () => {
    const occ = effectiveWeekSchedule(
      ctx({
        loggedSessions: [
          { sessionId: "push", scheduledFor: "2026-11-02", status: "complete" },
        ],
      }),
      1,
    );
    expect(occ.find((o) => o.sessionId === "push")!.loggedStatus).toBe(
      "complete",
    );
    expect(occ.find((o) => o.sessionId === "pull")!.loggedStatus).toBeNull();
  });
});

describe("oldestUnresolvedMissedDay", () => {
  it("returns the earliest past, unresolved, unlogged occurrence", () => {
    const miss = oldestUnresolvedMissedDay(ctx(), "2026-11-05"); // Thursday wk1
    expect(miss?.authoredIso).toBe("2026-11-02"); // Monday
  });

  it("skips resolved days and completed logs", () => {
    const miss = oldestUnresolvedMissedDay(
      ctx({
        resolutions: [{ missedOn: "2026-11-02", outcome: "skipped" }],
        loggedSessions: [],
      }),
      "2026-11-05",
    );
    expect(miss?.authoredIso).toBe("2026-11-04"); // Wednesday now oldest
  });

  it("an in-progress session is resumable, not missed", () => {
    const miss = oldestUnresolvedMissedDay(
      ctx({
        loggedSessions: [
          {
            sessionId: "push",
            scheduledFor: "2026-11-02",
            status: "in_progress",
          },
        ],
      }),
      "2026-11-05",
    );
    expect(miss?.authoredIso).toBe("2026-11-04");
  });

  it("returns null when nothing is missed", () => {
    expect(oldestUnresolvedMissedDay(ctx(), "2026-11-02")).toBeNull();
  });
});

describe("occurrenceOnDate", () => {
  it("finds today's effective occurrence", () => {
    expect(occurrenceOnDate(ctx(), "2026-11-04")?.sessionId).toBe("pull");
  });
  it("returns null on a rest day", () => {
    expect(occurrenceOnDate(ctx(), "2026-11-05")).toBeNull();
  });
  it("follows a shift to the new day", () => {
    const c = ctx({
      resolutions: [{ missedOn: "2026-11-02", outcome: "shifted" }],
    });
    expect(occurrenceOnDate(c, "2026-11-03")?.sessionId).toBe("push");
    expect(occurrenceOnDate(c, "2026-11-02")).toBeNull();
  });
});
