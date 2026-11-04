/**
 * THE DEMO FIXTURE (Public Landing Page & Changelog, spec §13; pitch
 * Appendix A). One versioned, entirely SYNTHETIC training history for the
 * fictional "Demo Lifter", used only to take honest screenshots on an isolated
 * local stack. No real person, gym, or account appears here.
 *
 * It holds FACTS only — plans, gyms, dated workouts and the sets lifted. There
 * is no field for a progression call, e1RM, trend, or baseline: the unchanged
 * application derives those on read (and corrects baselines as the sets are
 * logged through the real write path). The numbers below were chosen so that,
 * on the anchor date, the real engine says:
 *
 *   - Barbell Bench Press: ready to go up (top of range two counted sessions
 *     running, with the estimated 1RM rising across the last three);
 *   - Incline Dumbbell Press: hold (short of the top last time);
 *   - Overhead Press: deload (a set below the range two sessions running);
 *   - Leverage Chest Press (a machine): a different working weight at
 *     Northside Strength than at Riverside Fitness.
 *
 * Every date is relative to `anchorIso` (the demo's "today"), so the same
 * story reproduces on any day. Block 1 (5 weeks, deload week 5) is followed by
 * Block 2 (6 weeks, deload week 6); the anchor is Block 2, week 4, day 1, with
 * that day's Upper A still to do. About eight weeks of history in all.
 *
 * Changing anything here changes the demo: bump DEMO_FIXTURE_VERSION, and
 * re-capture on a FRESH local demo account (the seed never edits or deletes).
 */

export const DEMO_FIXTURE_VERSION = "demo-v1";

/** The demo account's profile timezone (its "today"). */
export const DEMO_TIME_ZONE = "America/Chicago";

/** Library exercises by stable free-exercise-db source id. Never created. */
export const DEMO_LIBRARY = {
  BENCH: "Barbell_Bench_Press_-_Medium_Grip",
  OHP: "Standing_Military_Press",
  INCLINE_DB: "Incline_Dumbbell_Press",
  PULLDOWN: "Wide-Grip_Lat_Pulldown",
  CHEST_PRESS: "Leverage_Chest_Press",
  CABLE_ROW: "Seated_Cable_Rows",
  LATERAL: "Side_Lateral_Raise",
  SQUAT: "Barbell_Squat",
  RDL: "Romanian_Deadlift",
  LEG_PRESS: "Leg_Press",
  LEG_CURL: "Seated_Leg_Curl",
} as const;

export type DemoExercise = keyof typeof DEMO_LIBRARY;
export type DemoGym = "northside" | "riverside";

/** Fictional gyms. Plain names, no address (locations are personal data). */
export const DEMO_GYMS: Record<DemoGym, { name: string }> = {
  northside: { name: "Northside Strength" },
  riverside: { name: "Riverside Fitness" },
};

export type DemoSlot = {
  ex: DemoExercise;
  sets: number;
  repMin: number;
  repMax: number;
};

export type DemoSession = {
  key: "upperA" | "lowerA" | "upperB" | "lowerB";
  name: string;
  /** Days after the block's start date (fixes the weekday). */
  dayOffset: number;
  slots: DemoSlot[];
};

export const DEMO_SESSIONS: DemoSession[] = [
  {
    key: "upperA",
    name: "Upper A",
    dayOffset: 0,
    slots: [
      { ex: "BENCH", sets: 3, repMin: 6, repMax: 8 },
      { ex: "OHP", sets: 3, repMin: 6, repMax: 8 },
      { ex: "INCLINE_DB", sets: 3, repMin: 8, repMax: 12 },
      { ex: "PULLDOWN", sets: 3, repMin: 10, repMax: 12 },
    ],
  },
  {
    key: "lowerA",
    name: "Lower A",
    dayOffset: 1,
    slots: [
      { ex: "SQUAT", sets: 3, repMin: 5, repMax: 7 },
      { ex: "RDL", sets: 3, repMin: 8, repMax: 10 },
    ],
  },
  {
    key: "upperB",
    name: "Upper B",
    dayOffset: 3,
    slots: [
      { ex: "CHEST_PRESS", sets: 3, repMin: 10, repMax: 12 },
      { ex: "CABLE_ROW", sets: 3, repMin: 10, repMax: 12 },
      { ex: "LATERAL", sets: 3, repMin: 12, repMax: 15 },
    ],
  },
  {
    key: "lowerB",
    name: "Lower B",
    dayOffset: 4,
    slots: [
      { ex: "LEG_PRESS", sets: 3, repMin: 10, repMax: 12 },
      { ex: "LEG_CURL", sets: 3, repMin: 10, repMax: 12 },
    ],
  },
];

export const DEMO_BLOCKS = [
  {
    key: "block1",
    name: "Strength Block 1",
    /** Days before the anchor that this block starts. */
    startDaysBeforeAnchor: 56,
    lengthWeeks: 5,
    deloadEveryWeeks: 5,
    /** Weeks of this block that were trained (all of them). */
    weeksTrained: 5,
  },
  {
    key: "block2",
    name: "Strength Block 2",
    startDaysBeforeAnchor: 21,
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
    /** Weeks 1-3 trained; the anchor is week 4, day 1 (not yet logged). */
    weeksTrained: 3,
  },
] as const;

/** One exercise's sets in one workout: weight (lbs) and the reps of each set. */
type Perf = readonly [weightLbs: number, reps: readonly number[]];

/**
 * The sets lifted, by exercise, for each trained week in order: index 0-4 are
 * Block 1 weeks 1-5 (index 4 is the scheduled deload week, lighter), and 5-7
 * are Block 2 weeks 1-3.
 */
export const DEMO_PERFORMANCES: Record<DemoExercise, readonly Perf[]> = {
  BENCH: [
    [170, [8, 8, 7]],
    [170, [8, 8, 8]],
    [170, [8, 8, 8]],
    [175, [7, 7, 6]],
    [155, [8, 8, 8]],
    [175, [8, 8, 8]],
    [175, [8, 8, 8]],
    [180, [8, 8, 8]],
  ],
  OHP: [
    [105, [8, 7, 7]],
    [105, [8, 8, 8]],
    [105, [8, 8, 8]],
    [110, [7, 7, 6]],
    [95, [8, 8, 8]],
    [110, [8, 7, 7]],
    [115, [6, 5, 5]],
    [115, [6, 5, 4]],
  ],
  INCLINE_DB: [
    [55, [10, 10, 9]],
    [55, [11, 10, 10]],
    [55, [12, 12, 12]],
    [60, [10, 9, 9]],
    [50, [10, 10, 10]],
    [60, [11, 10, 9]],
    [60, [11, 11, 10]],
    [60, [12, 11, 10]],
  ],
  PULLDOWN: [
    [120, [12, 11, 10]],
    [120, [12, 12, 11]],
    [125, [11, 10, 10]],
    [125, [12, 11, 11]],
    [110, [12, 12, 12]],
    [125, [12, 12, 11]],
    [130, [11, 10, 10]],
    [130, [11, 11, 10]],
  ],
  CHEST_PRESS: [
    [125, [12, 11, 10]],
    [155, [11, 10, 10]],
    [130, [11, 10, 10]],
    [160, [10, 10, 9]],
    [115, [12, 12, 12]],
    [130, [12, 11, 11]],
    [160, [11, 10, 10]],
    [130, [12, 12, 11]],
  ],
  CABLE_ROW: [
    [140, [12, 11, 10]],
    [150, [11, 10, 10]],
    [140, [12, 12, 11]],
    [150, [12, 11, 10]],
    [125, [12, 12, 12]],
    [145, [11, 10, 10]],
    [155, [11, 11, 10]],
    [145, [12, 11, 11]],
  ],
  LATERAL: [
    [20, [15, 14, 13]],
    [20, [15, 15, 14]],
    [20, [15, 15, 15]],
    [25, [13, 12, 12]],
    [15, [15, 15, 15]],
    [25, [14, 13, 12]],
    [25, [14, 14, 13]],
    [25, [15, 14, 14]],
  ],
  SQUAT: [
    [205, [7, 6, 6]],
    [205, [7, 7, 7]],
    [205, [7, 7, 7]],
    [215, [6, 6, 5]],
    [185, [7, 7, 7]],
    [215, [7, 6, 6]],
    [215, [7, 7, 6]],
    [215, [7, 7, 7]],
  ],
  RDL: [
    [165, [10, 9, 9]],
    [165, [10, 10, 10]],
    [170, [9, 9, 8]],
    [170, [10, 9, 9]],
    [150, [10, 10, 10]],
    [175, [9, 9, 8]],
    [175, [10, 9, 9]],
    [175, [10, 10, 9]],
  ],
  LEG_PRESS: [
    [270, [12, 11, 10]],
    [270, [12, 12, 12]],
    [290, [11, 10, 10]],
    [290, [12, 11, 11]],
    [250, [12, 12, 12]],
    [290, [12, 12, 11]],
    [310, [10, 10, 10]],
    [310, [11, 10, 10]],
  ],
  LEG_CURL: [
    [90, [12, 11, 10]],
    [90, [12, 12, 11]],
    [95, [11, 10, 10]],
    [95, [12, 11, 10]],
    [80, [12, 12, 12]],
    [95, [12, 12, 11]],
    [100, [10, 10, 10]],
    [100, [11, 11, 10]],
  ],
};

/**
 * Where each Upper B was trained, by trained-week index (every other workout
 * is at Northside Strength). Three Upper B sessions at Riverside Fitness give
 * the machine its own working weight there.
 */
export const RIVERSIDE_UPPER_B_WEEKS: readonly number[] = [1, 3, 6];

export type DemoWorkout = {
  block: (typeof DEMO_BLOCKS)[number]["key"];
  session: DemoSession["key"];
  /** Days before the anchor. */
  daysBeforeAnchor: number;
  gym: DemoGym;
  /** Trained-week index into DEMO_PERFORMANCES (0-7). */
  weekIndex: number;
};

/** Every workout in the history, oldest first. Pure. */
export function demoWorkouts(): DemoWorkout[] {
  const out: DemoWorkout[] = [];
  let weekIndex = 0;
  for (const block of DEMO_BLOCKS) {
    for (let week = 0; week < block.weeksTrained; week++, weekIndex++) {
      for (const session of DEMO_SESSIONS) {
        const daysBeforeAnchor =
          block.startDaysBeforeAnchor - (week * 7 + session.dayOffset);
        out.push({
          block: block.key,
          session: session.key,
          daysBeforeAnchor,
          gym:
            session.key === "upperB" &&
            RIVERSIDE_UPPER_B_WEEKS.includes(weekIndex)
              ? "riverside"
              : "northside",
          weekIndex,
        });
      }
    }
  }
  return out.sort((a, b) => b.daysBeforeAnchor - a.daysBeforeAnchor);
}

export type DemoCounts = {
  gyms: number;
  mesocycles: number;
  sessions: number;
  sessionExercises: number;
  loggedSessions: number;
  loggedExercises: number;
  loggedSets: number;
  customExercises: number;
  goals: number;
};

/** The exact rows a successful seed creates (for the dry run and the tests). */
export function expectedCounts(): DemoCounts {
  const workouts = demoWorkouts();
  const slotsPer = (key: DemoSession["key"]) =>
    DEMO_SESSIONS.find((s) => s.key === key)!.slots;
  const loggedExercises = workouts.reduce(
    (n, w) => n + slotsPer(w.session).length,
    0,
  );
  const loggedSets = workouts.reduce(
    (n, w) => n + slotsPer(w.session).reduce((m, s) => m + s.sets, 0),
    0,
  );
  return {
    gyms: Object.keys(DEMO_GYMS).length,
    mesocycles: DEMO_BLOCKS.length,
    sessions: DEMO_BLOCKS.length * DEMO_SESSIONS.length,
    sessionExercises:
      DEMO_BLOCKS.length *
      DEMO_SESSIONS.reduce((n, s) => n + s.slots.length, 0),
    loggedSessions: workouts.length,
    loggedExercises,
    loggedSets,
    customExercises: 0,
    goals: 0,
  };
}
