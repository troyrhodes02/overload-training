import {
  effectiveWeekSchedule,
  occurrenceOnDate,
  oldestUnresolvedMissedDay,
  type ScheduleContext,
} from "@overload/shared/logging/schedule";
import { cardioWeekOccurrences } from "@overload/shared/cardio/schedule";

/**
 * One-week moves on Today (OVE-240): "Train today" and "Swap days" move an
 * occurrence within its block week. Pure. The block starts Mon Nov 23 2026,
 * 4 weeks: Tue Pull, Wed Push, Fri Legs; Thu is a rest day.
 */
const START = "2026-11-23"; // Monday
const PULL = { id: "pull", name: "Pull", dayOfWeek: 2 }; // Tue Nov 24
const PUSH = { id: "push", name: "Push", dayOfWeek: 3 }; // Wed Nov 25
const LEGS = { id: "legs", name: "Legs", dayOfWeek: 5 }; // Fri Nov 27

function ctx(over: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    startDate: START,
    lengthWeeks: 4,
    sessions: [PULL, PUSH, LEGS],
    resolutions: [],
    loggedSessions: [],
    ...over,
  };
}

const placed = (c: ScheduleContext, week = 1) =>
  Object.fromEntries(
    effectiveWeekSchedule(c, week).map((o) => [o.sessionId, o.effectiveIso]),
  );

const swapPullPush = [
  {
    sessionId: "pull",
    authoredIso: "2026-11-24",
    movedTo: "2026-11-25",
    at: "2026-11-24T08:00:00.000Z",
  },
  {
    sessionId: "push",
    authoredIso: "2026-11-25",
    movedTo: "2026-11-24",
    at: "2026-11-24T08:00:00.000Z",
  },
];

describe("one-week moves", () => {
  it("a week without moves is exactly the original rule", () => {
    const c = ctx({
      resolutions: [{ missedOn: "2026-11-24", outcome: "shifted" }],
    });
    expect(placed(c)).toEqual({
      pull: "2026-11-25",
      push: "2026-11-26",
      legs: "2026-11-28",
    });
    expect(placed(ctx({ ...c, moves: [] }))).toEqual(placed(c));
  });

  it("swapping Tue Pull and Wed Push trades their days this week only", () => {
    const c = ctx({ moves: swapPullPush });
    expect(placed(c)).toEqual({
      pull: "2026-11-25",
      push: "2026-11-24",
      legs: "2026-11-27",
    });
    expect(occurrenceOnDate(c, "2026-11-24")?.sessionId).toBe("push");
    expect(occurrenceOnDate(c, "2026-11-25")?.sessionId).toBe("pull");
    // Identity is unchanged: each keeps its authored date.
    const push = effectiveWeekSchedule(c, 1).find(
      (o) => o.sessionId === "push",
    );
    expect(push?.authoredIso).toBe("2026-11-25");
    expect(push?.moved).toBe(true);
    // Next week keeps the authored schedule.
    expect(placed(c, 2)).toEqual({
      pull: "2026-12-01",
      push: "2026-12-02",
      legs: "2026-12-04",
    });
  });

  it("a workout can trade places with a rest day", () => {
    const c = ctx({
      moves: [
        {
          sessionId: "push",
          authoredIso: "2026-11-25",
          movedTo: "2026-11-26",
          at: "2026-11-24T08:00:00.000Z",
        },
      ],
    });
    expect(occurrenceOnDate(c, "2026-11-25")).toBeNull();
    expect(occurrenceOnDate(c, "2026-11-26")?.sessionId).toBe("push");
  });

  it("a workout trained early is never missed on its planned day", () => {
    // Fri Legs moved to Tue and done on Tue.
    const c = ctx({
      moves: [
        {
          sessionId: "legs",
          authoredIso: "2026-11-27",
          movedTo: "2026-11-24",
          at: "2026-11-24T08:00:00.000Z",
        },
      ],
      loggedSessions: [
        { sessionId: "pull", scheduledFor: "2026-11-24", status: "complete" },
        { sessionId: "push", scheduledFor: "2026-11-25", status: "complete" },
        { sessionId: "legs", scheduledFor: "2026-11-27", status: "complete" },
      ],
    });
    expect(occurrenceOnDate(c, "2026-11-27")).toBeNull();
    expect(oldestUnresolvedMissedDay(c, "2026-11-29")).toBeNull();
  });

  it("a moved workout that isn't trained is missed on its NEW day", () => {
    const c = ctx({
      moves: swapPullPush,
      loggedSessions: [
        { sessionId: "pull", scheduledFor: "2026-11-24", status: "complete" },
      ],
    });
    // Push (moved to Tue) was not trained; on Wed it is missed.
    expect(oldestUnresolvedMissedDay(c, "2026-11-25")?.sessionId).toBe("push");
  });

  it("a skipped occurrence is never missed and frees its day", () => {
    const c = ctx({
      resolutions: [
        {
          missedOn: "2026-11-25",
          outcome: "skipped",
          at: "2026-11-23T10:00:00.000Z",
        },
      ],
    });
    expect(occurrenceOnDate(c, "2026-11-25")).toBeNull();
    expect(oldestUnresolvedMissedDay(c, "2026-11-30")?.sessionId).toBe("pull");
    expect(
      oldestUnresolvedMissedDay(
        ctx({
          ...c,
          loggedSessions: [
            {
              sessionId: "pull",
              scheduledFor: "2026-11-24",
              status: "complete",
            },
            {
              sessionId: "legs",
              scheduledFor: "2026-11-27",
              status: "complete",
            },
          ],
        }),
        "2026-11-30",
      ),
    ).toBeNull();
  });

  it("a later shift builds on the moved week, never on stale authored order", () => {
    // Mon: Legs moved Fri -> Thu. Pull (Tue) is then missed and shifted on
    // Wed: every workout on or after Tue moves a day (Pull Wed, Push Thu,
    // Legs Fri). Nothing collides.
    const c = ctx({
      moves: [
        {
          sessionId: "legs",
          authoredIso: "2026-11-27",
          movedTo: "2026-11-26",
          at: "2026-11-23T09:00:00.000Z",
        },
      ],
      resolutions: [
        {
          missedOn: "2026-11-24",
          outcome: "shifted",
          at: "2026-11-25T09:00:00.000Z",
        },
      ],
    });
    expect(placed(c)).toEqual({
      pull: "2026-11-25",
      push: "2026-11-26",
      legs: "2026-11-27",
    });
  });

  it("a move made after a shift keeps its absolute day", () => {
    const c = ctx({
      resolutions: [
        {
          missedOn: "2026-11-24",
          outcome: "shifted",
          at: "2026-11-25T09:00:00.000Z",
        },
      ],
      // After the shift (Pull Wed, Push Thu, Legs Sat), Legs swaps to Fri.
      moves: [
        {
          sessionId: "legs",
          authoredIso: "2026-11-27",
          movedTo: "2026-11-27",
          at: "2026-11-25T10:00:00.000Z",
        },
      ],
    });
    expect(placed(c)).toEqual({
      pull: "2026-11-25",
      push: "2026-11-26",
      legs: "2026-11-27",
    });
  });

  it("moving a workout again after a shift never loses it (review #1)", () => {
    // X on Mon Nov 23, C on Sun Nov 29. Mon: C moved to Wed. Tue: X (missed)
    // shifted, so X Tue and C Thu. Wed: "Train today" moves C Thu -> Wed,
    // overwriting the one stored row. Replayed in order, the shift meets C on
    // its authored Sunday and drops it; the newer move must bring it back.
    const x = { id: "x", name: "X", dayOfWeek: 1 };
    const cc = { id: "c", name: "C", dayOfWeek: 7 };
    const c = ctx({
      sessions: [x, cc],
      resolutions: [
        {
          missedOn: "2026-11-23",
          outcome: "shifted",
          at: "2026-11-24T09:00:00.000Z",
        },
      ],
      moves: [
        {
          sessionId: "c",
          authoredIso: "2026-11-29",
          movedTo: "2026-11-25",
          at: "2026-11-25T10:00:00.000Z",
        },
      ],
    });
    const moved = effectiveWeekSchedule(c, 1).find((o) => o.sessionId === "c");
    expect(moved).toMatchObject({
      effectiveIso: "2026-11-25",
      dropped: false,
      moved: true,
    });
    expect(occurrenceOnDate(c, "2026-11-25")?.sessionId).toBe("c");
    expect(occurrenceOnDate(c, "2026-11-24")?.sessionId).toBe("x");
  });

  it("no two live occurrences share a day after a move and a shift", () => {
    const c = ctx({
      moves: [
        {
          sessionId: "push",
          authoredIso: "2026-11-25",
          movedTo: "2026-11-26",
          at: "2026-11-23T09:00:00.000Z",
        },
      ],
      resolutions: [
        {
          missedOn: "2026-11-24",
          outcome: "shifted",
          at: "2026-11-25T09:00:00.000Z",
        },
      ],
    });
    const days = effectiveWeekSchedule(c, 1)
      .filter((o) => !o.dropped && o.resolution !== "skipped")
      .map((o) => o.effectiveIso);
    expect(new Set(days).size).toBe(days.length);
  });

  it("a move outside its week is ignored", () => {
    const c = ctx({
      moves: [
        {
          sessionId: "push",
          authoredIso: "2026-11-25",
          movedTo: "2026-12-01",
          at: "2026-11-24T08:00:00.000Z",
        },
      ],
    });
    expect(placed(c).push).toBe("2026-11-25");
  });

  it("bound planned cardio travels with its moved workout", () => {
    const c = ctx({ moves: swapPullPush });
    const cardio = cardioWeekOccurrences(
      c,
      [
        {
          id: "walk",
          dayOfWeek: 3,
          type: "Incline Walk",
          durationMin: 20,
          createdIso: "2026-11-01",
        },
      ],
      1,
    );
    expect(cardio[0]?.effectiveIso).toBe("2026-11-24");
  });
});
