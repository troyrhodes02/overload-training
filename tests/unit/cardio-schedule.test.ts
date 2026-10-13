import {
  cardioState,
  cardioWeekEntries,
  cardioWeekOccurrences,
  type CardioLogInput,
  type PlannedCardioInput,
} from "@/lib/cardio/schedule";
import {
  oldestUnresolvedMissedDay,
  type ScheduleContext,
} from "@/lib/logging/schedule";

/**
 * Cardio occurrences consume the effective schedule (Cardio Logging spec
 * §11b; R38–R41, R54–R57). Pure. Hypertrophy Block 3 starts Mon Sep 21 2026,
 * 5 weeks; week 4 runs Mon Oct 12 – Sun Oct 18; week 5 (Oct 19–25) is the
 * scheduled deload when the cadence is every 5 weeks.
 */
const START = "2026-09-21"; // Monday
const PULL = { id: "pull", name: "Pull Day 1", dayOfWeek: 2 }; // Tue
const PUSH2 = { id: "push2", name: "Push Day 2", dayOfWeek: 4 }; // Thu
const SUNDAY = { id: "sun", name: "Arms", dayOfWeek: 7 }; // Sun

const WALK: PlannedCardioInput = {
  id: "walk",
  dayOfWeek: 2,
  type: "Incline Walk",
  durationMin: 20,
  createdIso: "2026-09-01",
};
const STAIRS: PlannedCardioInput = {
  id: "stairs",
  dayOfWeek: 4,
  type: "Stair Climber",
  durationMin: 15,
  createdIso: "2026-09-01",
};
const BIKE: PlannedCardioInput = {
  id: "bike",
  dayOfWeek: 6, // Saturday: cardio-only
  type: "Bike",
  durationMin: 30,
  createdIso: "2026-09-01",
};

function ctx(over: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    startDate: START,
    lengthWeeks: 5,
    sessions: [PULL, PUSH2],
    resolutions: [],
    loggedSessions: [],
    ...over,
  };
}

const at = (occ: { authoredIso: string; effectiveIso: string | null }[]) =>
  occ.map((o) => [o.authoredIso, o.effectiveIso]);

describe("placing planned cardio", () => {
  it("puts bound and cardio-only cardio on their authored dates when nothing shifted", () => {
    const occ = cardioWeekOccurrences(ctx(), [BIKE, WALK, STAIRS], 4);
    expect(at(occ)).toEqual([
      ["2026-10-13", "2026-10-13"],
      ["2026-10-15", "2026-10-15"],
      ["2026-10-17", "2026-10-17"],
    ]);
    expect(occ.map((o) => o.bound)).toEqual([true, true, false]);
  });

  it("carries bound cardio with a shifted lifting day; cardio-only days never move", () => {
    const shifted = ctx({
      resolutions: [{ missedOn: "2026-10-13", outcome: "shifted" }],
    });
    const occ = cardioWeekOccurrences(shifted, [WALK, STAIRS, BIKE], 4);
    expect(at(occ)).toEqual([
      ["2026-10-13", "2026-10-14"], // Tue walk follows Pull to Wed
      ["2026-10-15", "2026-10-16"], // Thu stairs follows Push Day 2 to Fri
      ["2026-10-17", "2026-10-17"], // Sat bike stays
    ]);
  });

  it("drops bound cardio when the shift pushes its lifting day past the week", () => {
    const shifted = ctx({
      sessions: [PULL, SUNDAY],
      resolutions: [{ missedOn: "2026-10-13", outcome: "shifted" }],
    });
    const sundayWalk = { ...WALK, id: "sunwalk", dayOfWeek: 7 };
    expect(at(cardioWeekOccurrences(shifted, [sundayWalk], 4))).toEqual([
      ["2026-10-18", null],
    ]);
  });

  it("leaves bound cardio on its date when the lifting day was skipped or logged late", () => {
    for (const outcome of ["skipped", "logged_late"] as const) {
      const c = ctx({ resolutions: [{ missedOn: "2026-10-13", outcome }] });
      expect(at(cardioWeekOccurrences(c, [WALK], 4))).toEqual([
        ["2026-10-13", "2026-10-13"],
      ]);
    }
  });

  it("returns to the authored schedule the following week (no compounding)", () => {
    const shifted = ctx({
      resolutions: [{ missedOn: "2026-10-13", outcome: "shifted" }],
    });
    expect(at(cardioWeekOccurrences(shifted, [WALK, BIKE], 5))).toEqual([
      ["2026-10-20", "2026-10-20"],
      ["2026-10-24", "2026-10-24"],
    ]);
  });

  it("never invents occurrences before the plan row existed (occurrence floor)", () => {
    const addedMidBlock = { ...WALK, createdIso: "2026-10-14" };
    expect(cardioWeekOccurrences(ctx(), [addedMidBlock], 3)).toEqual([]);
    expect(cardioWeekOccurrences(ctx(), [addedMidBlock], 4)).toEqual([]);
    expect(at(cardioWeekOccurrences(ctx(), [addedMidBlock], 5))).toEqual([
      ["2026-10-20", "2026-10-20"],
    ]);
    // Added the same day counts that day.
    const sameDay = { ...WALK, createdIso: "2026-10-13" };
    expect(cardioWeekOccurrences(ctx(), [sameDay], 4)).toHaveLength(1);
  });

  it("has no occurrences outside the block", () => {
    expect(cardioWeekOccurrences(ctx(), [WALK], 0)).toEqual([]);
    expect(cardioWeekOccurrences(ctx(), [WALK], 6)).toEqual([]);
  });

  it("leaves a scheduled-deload week's cardio exactly as authored", () => {
    // Week 5 is the scheduled deload (every 5): there is no deload input at all.
    const occ = cardioWeekOccurrences(ctx(), [WALK, BIKE], 5);
    expect(occ.map((o) => [o.type, o.durationMin])).toEqual([
      ["Incline Walk", 20],
      ["Bike", 30],
    ]);
  });
});

describe("cardio never feeds the missed-day engine (R35, R39)", () => {
  it("a cardio-only plan has no missed lifting day, however late it is", () => {
    const cardioOnly = ctx({ sessions: [] });
    expect(oldestUnresolvedMissedDay(cardioOnly, "2026-10-25")).toBeNull();
    // The cardio still has (missed) occurrences — as a fact, not a prompt.
    expect(
      cardioWeekEntries(cardioOnly, [BIKE], [], 4, "2026-10-25")[0].state,
    ).toBe("missed");
  });
});

describe("cardio state", () => {
  it.each([
    ["2026-10-13", true, "complete"],
    ["2026-10-15", false, "pending"],
    ["2026-10-17", false, "upcoming"],
    ["2026-10-13", false, "missed"],
    ["2026-10-17", true, "complete"],
  ] as const)("%s logged=%s → %s (today Oct 15)", (date, logged, state) => {
    expect(cardioState(date, logged, "2026-10-15")).toBe(state);
  });
});

describe("week entries (dashboard and history)", () => {
  const bikeInsteadOfWalk: CardioLogInput = {
    id: "log1",
    scheduledFor: "2026-10-13",
    type: "Bike",
    durationMin: 25,
    plannedType: "Incline Walk",
    plannedDurationMin: 20,
    performedIso: "2026-10-13",
  };

  it("merges logs over the plan, keeps the snapshot, and flags a difference", () => {
    const entries = cardioWeekEntries(
      ctx(),
      [WALK, STAIRS, BIKE],
      [bikeInsteadOfWalk],
      4,
      "2026-10-15",
    );
    expect(
      entries.map((e) => [e.dateIso, e.state, e.log?.type ?? null]),
    ).toEqual([
      ["2026-10-13", "complete", "Bike"],
      ["2026-10-15", "pending", null],
      ["2026-10-17", "upcoming", null],
    ]);
    expect(entries[0]).toMatchObject({
      planned: { type: "Incline Walk", durationMin: 20 },
      differsFromPlan: true,
    });
  });

  it("a log that matches its plan does not differ", () => {
    const same = {
      ...bikeInsteadOfWalk,
      type: "Incline Walk",
      durationMin: 20,
    };
    expect(
      cardioWeekEntries(ctx(), [WALK], [same], 4, "2026-10-15")[0]
        .differsFromPlan,
    ).toBe(false);
  });

  it("past unlogged cardio is missed — and nothing is fabricated", () => {
    const entries = cardioWeekEntries(ctx(), [WALK], [], 4, "2026-10-15");
    expect(entries).toEqual([
      expect.objectContaining({ state: "missed", log: null }),
    ]);
  });

  it("keeps a log whose plan row was later removed or moved", () => {
    const entries = cardioWeekEntries(
      ctx(),
      [],
      [bikeInsteadOfWalk],
      4,
      "2026-10-15",
    );
    expect(entries).toEqual([
      expect.objectContaining({
        scheduledFor: "2026-10-13",
        dateIso: "2026-10-13",
        state: "complete",
      }),
    ]);
  });

  it("a later lifting shift never moves cardio that was already done", () => {
    // Logged on Tue Oct 13; on Wed the missed Pull is shifted to Wed.
    const shifted = ctx({
      resolutions: [{ missedOn: "2026-10-13", outcome: "shifted" }],
    });
    const entries = cardioWeekEntries(
      shifted,
      [WALK],
      [bikeInsteadOfWalk],
      4,
      "2026-10-15",
    );
    expect(entries.map((e) => [e.scheduledFor, e.dateIso, e.state])).toEqual([
      ["2026-10-13", "2026-10-13", "complete"],
    ]);
  });

  it("a log made on the shifted day shows on that day", () => {
    const shifted = ctx({
      resolutions: [{ missedOn: "2026-10-13", outcome: "shifted" }],
    });
    const onWednesday = { ...bikeInsteadOfWalk, performedIso: "2026-10-14" };
    expect(
      cardioWeekEntries(shifted, [WALK], [onWednesday], 4, "2026-10-15")[0]
        .dateIso,
    ).toBe("2026-10-14");
  });

  it("omits an unlogged occurrence a shift dropped, but never a logged one", () => {
    const shifted = ctx({
      sessions: [PULL, SUNDAY],
      resolutions: [{ missedOn: "2026-10-13", outcome: "shifted" }],
    });
    const sundayWalk = { ...WALK, id: "sunwalk", dayOfWeek: 7 };
    expect(
      cardioWeekEntries(shifted, [sundayWalk], [], 4, "2026-10-19"),
    ).toEqual([]);
    const logged = {
      ...bikeInsteadOfWalk,
      scheduledFor: "2026-10-18",
      performedIso: "2026-10-18",
    };
    expect(
      cardioWeekEntries(shifted, [sundayWalk], [logged], 4, "2026-10-19").map(
        (e) => [e.dateIso, e.state],
      ),
    ).toEqual([["2026-10-18", "complete"]]);
  });

  it("lists two cardio items that land on the same effective day in authored order", () => {
    // Fri session shifted onto Sat, which also has cardio-only bike.
    const fri = { id: "fri", name: "Legs", dayOfWeek: 5 };
    const friCardio = { ...WALK, id: "fricardio", dayOfWeek: 5 };
    const shifted = ctx({
      sessions: [fri],
      resolutions: [{ missedOn: "2026-10-16", outcome: "shifted" }],
    });
    const entries = cardioWeekEntries(
      shifted,
      [BIKE, friCardio],
      [],
      4,
      "2026-10-17",
    );
    expect(entries.map((e) => [e.scheduledFor, e.dateIso, e.state])).toEqual([
      ["2026-10-16", "2026-10-17", "pending"],
      ["2026-10-17", "2026-10-17", "pending"],
    ]);
  });

  it("ignores logs from other weeks", () => {
    expect(
      cardioWeekEntries(ctx(), [], [bikeInsteadOfWalk], 3, "2026-10-15"),
    ).toEqual([]);
  });
});
