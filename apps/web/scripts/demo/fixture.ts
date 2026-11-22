/**
 * THE DEMO FIXTURE (Public Landing Page & Changelog, spec §13; pitch
 * Appendix A). One versioned, entirely SYNTHETIC training history for the
 * fictional showcase lifter "Marcus Reed" (the real-sounding name the demo
 * account signs up with, so the app greets it naturally), used only to take
 * honest demo captures on an isolated local stack. No real person, gym, or
 * account appears here.
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
  // One machine weight per gym (Northside 130, Riverside 160), so the
  // per-gym working weight the app shows agrees with the history it lists.
  CHEST_PRESS: [
    [130, [11, 10, 10]],
    [160, [10, 10, 9]],
    [130, [12, 11, 10]],
    [160, [11, 10, 10]],
    [115, [12, 12, 12]],
    [130, [12, 11, 11]],
    [160, [11, 11, 10]],
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

/**
 * FIXTURE VARIANTS (Pitch 21f, spec §11). The same story, arranged so one
 * scenario is ready to test on the anchor date. `standard` is the fixture
 * above, unchanged. Each variant is still entirely synthetic, holds facts
 * only, and is written through the same application write modules.
 *
 *  - `gym`: the split is ordered so UPPER B is the anchor day's workout. Its
 *    machine and cable lifts were trained at Northside and at Riverside with
 *    different weights, its dumbbell lift is the same anywhere, and a third
 *    gym, Harbor Barbell, has no history at all.
 *  - `bodyweight`: Upper A is a barbell lift, a bodyweight lift (Pullups), a
 *    fixed-target lift (Incline Dumbbell Press, 3 x 10), and a bodyweight abs
 *    lift with a fixed target (Crunches, 3 x 15), each with the full history.
 *  - `cardio`: the active block also plans cardio on Upper A's day and on a
 *    rest day, logged through the trained weeks (one longer than planned, one
 *    left unlogged), so the anchor day has cardio waiting beside lifting.
 */
export const DEMO_VARIANTS = [
  "standard",
  "gym",
  "bodyweight",
  "cardio",
  // Pitch 21g (spec §11): one insight scenario each, on today's Upper A.
  "hold",
  "reactive-deload",
  "rir",
  "scheduled-deload",
  "post-deload",
  "insufficient",
  "edit",
  "recovery",
  // Pitch 21g correction OVE-228.
  "multiple-unfinished",
  // Pitch 21h: a detailed session — bodyweight, fixed targets, and cardio.
  "session-detail",
] as const;
export type DemoVariant = (typeof DEMO_VARIANTS)[number];

export function isDemoVariant(value: unknown): value is DemoVariant {
  return (
    typeof value === "string" &&
    (DEMO_VARIANTS as readonly string[]).includes(value)
  );
}

/** Library exercises only a variant uses, by free-exercise-db source id. */
export const VARIANT_LIBRARY = {
  PULLUPS: "Pullups", // bodyweight: reps only, no weight
  CRUNCHES: "Crunches", // bodyweight abs
} as const;

export type FixtureExercise = DemoExercise | keyof typeof VARIANT_LIBRARY;
export type FixtureGym = DemoGym | "harbor";

/**
 * One exercise's sets in one workout: weight (null = bodyweight), reps, and
 * optionally the RIR of each set (Pitch 21g; null or absent = not recorded,
 * never 0). RIR is a logged FACT, written through logSet like the rest.
 */
export type FixturePerf = readonly [
  weightLbs: number | null,
  reps: readonly number[],
  rir?: readonly (number | null)[],
];

/** One training block as the fixture writes it (DEMO_BLOCKS' shape). */
export type FixtureBlock = {
  key: "block1" | "block2";
  name: string;
  startDaysBeforeAnchor: number;
  lengthWeeks: number;
  deloadEveryWeeks: number;
  weeksTrained: number;
};

/**
 * Today's workout already started, with some sets logged and not finished
 * (Pitch 21g `recovery`): through startOrResumeWorkout and logSet on the
 * anchor date, exactly as a lifter mid-workout leaves it.
 */
export type FixtureInProgress = {
  session: DemoSession["key"];
  /**
   * Days after the anchor it was scheduled for (0 = the anchor). The session
   * must fall on that weekday; never after the account's today.
   */
  dayOffset?: number;
  gym: FixtureGym;
  sets: Partial<
    Record<FixtureExercise, readonly (readonly [number | null, number])[]>
  >;
};

export type FixtureSlot = {
  ex: FixtureExercise;
  sets: number;
  repMin: number;
  repMax: number;
};

export type FixtureSession = {
  key: DemoSession["key"];
  name: string;
  dayOffset: number;
  slots: FixtureSlot[];
};

export type FixtureCardio = {
  /** Days after the block's start date (fixes the weekday). */
  dayOffset: number;
  type: string;
  durationMin: number;
};

export type FixtureCardioLog = {
  /** Trained week of the ACTIVE block, 1-based. */
  week: number;
  dayOffset: number;
  type: string;
  durationMin: number;
};

export type DemoFixture = {
  variant: DemoVariant;
  /** Exactly the library exercises this variant plans. */
  library: Partial<Record<FixtureExercise, string>>;
  gyms: Partial<Record<FixtureGym, { name: string }>>;
  sessions: FixtureSession[];
  performances: Partial<Record<FixtureExercise, readonly FixturePerf[]>>;
  /** Planned cardio of the active (last) block. */
  plannedCardio: readonly FixtureCardio[];
  cardioLogs: readonly FixtureCardioLog[];
  /** The blocks, oldest first (DEMO_BLOCKS unless a 21g variant changes them). */
  blocks: readonly FixtureBlock[];
  /**
   * Workouts left in progress (21g `recovery`, `multiple-unfinished`), on the
   * anchor or a later day up to the account's today, oldest first.
   */
  inProgress: readonly FixtureInProgress[];
};

/** Bodyweight reps by trained-week index (index 4 is the deload week). */
const BODYWEIGHT_PERFORMANCES: Record<
  keyof typeof VARIANT_LIBRARY,
  readonly FixturePerf[]
> = {
  PULLUPS: [
    [null, [8, 7, 6]],
    [null, [8, 8, 7]],
    [null, [9, 8, 8]],
    [null, [9, 9, 8]],
    [null, [8, 8, 8]],
    [null, [10, 9, 8]],
    [null, [10, 9, 9]],
    [null, [10, 10, 9]],
  ],
  CRUNCHES: [
    [null, [15, 14, 12]],
    [null, [15, 15, 13]],
    [null, [15, 15, 14]],
    [null, [15, 15, 15]],
    [null, [12, 12, 12]],
    [null, [15, 15, 14]],
    [null, [15, 15, 15]],
    [null, [15, 15, 15]],
  ],
};

/** The gym variant's day order: Upper B first, so it is the anchor's workout. */
const GYM_DAY_OFFSETS: Record<DemoSession["key"], number> = {
  upperB: 0,
  lowerB: 1,
  upperA: 3,
  lowerA: 4,
};

const CARDIO_PLAN: readonly FixtureCardio[] = [
  { dayOffset: 0, type: "Incline Walk", durationMin: 20 },
  { dayOffset: 2, type: "Bike", durationMin: 30 },
];

/**
 * Cardio done in the active block's trained weeks. Week 2's walk ran longer
 * than planned; week 3's bike is left unlogged, so History shows it missed
 * (a fact, never a prompt).
 */
const CARDIO_LOGS: readonly FixtureCardioLog[] = [
  { week: 1, dayOffset: 0, type: "Incline Walk", durationMin: 20 },
  { week: 1, dayOffset: 2, type: "Bike", durationMin: 30 },
  { week: 2, dayOffset: 0, type: "Incline Walk", durationMin: 25 },
  { week: 2, dayOffset: 2, type: "Bike", durationMin: 30 },
  { week: 3, dayOffset: 0, type: "Incline Walk", durationMin: 20 },
];

function libraryFor(
  sessions: FixtureSession[],
): Partial<Record<FixtureExercise, string>> {
  const all = { ...DEMO_LIBRARY, ...VARIANT_LIBRARY };
  const out: Partial<Record<FixtureExercise, string>> = {};
  // Keep the base library's order, so `standard` resolves exactly as before.
  for (const key of Object.keys(all) as FixtureExercise[]) {
    if (sessions.some((s) => s.slots.some((slot) => slot.ex === key))) {
      out[key] = all[key];
    }
  }
  return out;
}

/**
 * Pitch 21g insight variants (spec §11). Each changes only FACTS — the sets
 * lifted, their RIR, or the active block's deload cadence and length — so
 * that, on the anchor date, the UNCHANGED engine reaches one call on today's
 * Upper A. Trained-week index 5–7 is the active block's weeks 1–3, which is
 * the run the card judges (each block's Upper A is its own recurring
 * workout). The calls each produces are asserted through the real card
 * reader in tests/integration/dev-test-account-profiles.int.test.ts.
 */
type Overrides = Partial<Record<FixtureExercise, Record<number, FixturePerf>>>;

function withOverrides(
  base: Partial<Record<FixtureExercise, readonly FixturePerf[]>>,
  overrides: Overrides,
): Partial<Record<FixtureExercise, readonly FixturePerf[]>> {
  const out = { ...base };
  for (const [ex, byWeek] of Object.entries(overrides) as [
    FixtureExercise,
    Record<number, FixturePerf>,
  ][]) {
    const perfs = [...(base[ex] ?? [])];
    for (const [week, perf] of Object.entries(byWeek))
      perfs[Number(week)] = perf;
    out[ex] = perfs;
  }
  return out;
}

/** A lighter week at about 90%, rounded down to 5 lb (a real deload week's shape). */
function lighter(perf: FixturePerf): FixturePerf {
  const [w, reps] = perf;
  return [w === null ? null : Math.floor((w * 0.9) / 5) * 5, reps];
}

const ACTIVE_BLOCK = DEMO_BLOCKS[1];

const INSIGHT_VARIANTS: Partial<
  Record<
    DemoVariant,
    {
      overrides?: (base: typeof DEMO_PERFORMANCES) => Overrides;
      activeBlock?: Partial<FixtureBlock>;
      inProgress?: readonly FixtureInProgress[];
    }
  >
> = {
  /** Bench last time 180 × 8, 7, 7: short of the top, nothing below → hold. */
  hold: { overrides: () => ({ BENCH: { 7: [180, [8, 7, 7]] } }) },
  /** Bench below 6 two Upper A's running → reactive Deload. */
  "reactive-deload": {
    overrides: () => ({
      BENCH: { 6: [180, [7, 6, 5]], 7: [180, [6, 5, 5]] },
    }),
  },
  /**
   * RIR changes three calls (RIR Logging & Autoregulation):
   *  - Bench at the top with a set at 0 RIR → Progress held at the limit;
   *  - Military Press flat at the top, every set 2+ RIR → stall released;
   *  - Incline flat at the top, ONE set unrecorded → the stall stays (a
   *    missing RIR is never assumed).
   */
  rir: {
    overrides: () => ({
      BENCH: { 7: [180, [8, 8, 8], [2, 1, 0]] },
      OHP: {
        5: [110, [8, 8, 8]],
        6: [110, [8, 8, 8]],
        7: [110, [8, 8, 8], [2, 2, 3]],
      },
      INCLINE_DB: {
        5: [60, [12, 12, 12]],
        6: [60, [12, 12, 12]],
        7: [60, [12, 12, 12], [2, 2, null]],
      },
    }),
  },
  /** The active block deloads every 4th week: today (week 4) is one. */
  "scheduled-deload": { activeBlock: { deloadEveryWeeks: 4 } },
  /**
   * The active block deloads every 3rd week: week 3 was the (lighter) deload
   * week, and today is week 4, an ordinary week again.
   */
  "post-deload": {
    activeBlock: { deloadEveryWeeks: 3 },
    overrides: (base) =>
      Object.fromEntries(
        (Object.keys(base) as DemoExercise[]).map((ex) => [
          ex,
          { 7: lighter(base[ex][7]) },
        ]),
      ) as Overrides,
  },
  /**
   * A new block started a week ago: one Upper A of it is logged, so every
   * lift today has 1 of the 2 complete sessions a call needs. The earlier
   * block's numbers show only as reference.
   */
  insufficient: {
    activeBlock: { startDaysBeforeAnchor: 7, weeksTrained: 1 },
  },
  /**
   * Bench last time 180 × 8, 8, 7 at RIR 1, 1, 0 (hold). Correcting set 3 to
   * 8 reps makes it a Progress held at the limit (0 RIR); correcting that
   * set's RIR to 1 then releases it to Progress.
   */
  edit: { overrides: () => ({ BENCH: { 7: [180, [8, 8, 7], [1, 1, 0]] } }) },
  /** The standard story with today's Upper A started: Bench sets 1–2 logged. */
  recovery: {
    inProgress: [
      {
        session: "upperA",
        gym: "northside",
        sets: {
          BENCH: [
            [180, 8],
            [180, 8],
          ],
        },
      },
    ],
  },
  /**
   * Pitch 21g correction OVE-228: two workouts left unfinished on two days,
   * with different saved sets — the anchor's Upper A (Bench 180 × 8, 8) and
   * the next day's Lower A (Squat 215 × 7). Profiles anchor this two days
   * back, so both are "earlier" and today is a rest day.
   */
  "multiple-unfinished": {
    inProgress: [
      {
        session: "upperA",
        gym: "northside",
        sets: {
          BENCH: [
            [180, 8],
            [180, 8],
          ],
        },
      },
      {
        session: "lowerA",
        dayOffset: 1,
        gym: "northside",
        sets: { SQUAT: [[215, 7]] },
      },
    ],
  },
};

/** The whole fixture for one variant. Pure. */
export function demoFixture(variant: DemoVariant = "standard"): DemoFixture {
  let sessions: FixtureSession[] = DEMO_SESSIONS;
  if (variant === "gym") {
    sessions = DEMO_SESSIONS.map((s) => ({
      ...s,
      dayOffset: GYM_DAY_OFFSETS[s.key],
    }));
  } else if (variant === "bodyweight" || variant === "session-detail") {
    sessions = DEMO_SESSIONS.map((s) =>
      s.key !== "upperA"
        ? s
        : {
            ...s,
            slots: [
              { ex: "BENCH", sets: 3, repMin: 6, repMax: 8 },
              { ex: "PULLUPS", sets: 3, repMin: 8, repMax: 10 },
              { ex: "INCLINE_DB", sets: 3, repMin: 10, repMax: 10 },
              { ex: "CRUNCHES", sets: 3, repMin: 15, repMax: 15 },
            ],
          },
    );
  }
  return {
    variant,
    library: libraryFor(sessions),
    gyms:
      variant === "gym"
        ? { ...DEMO_GYMS, harbor: { name: "Harbor Barbell" } }
        : DEMO_GYMS,
    sessions,
    performances: { ...DEMO_PERFORMANCES, ...BODYWEIGHT_PERFORMANCES },
    plannedCardio:
      variant === "cardio" || variant === "session-detail" ? CARDIO_PLAN : [],
    cardioLogs:
      variant === "cardio" || variant === "session-detail" ? CARDIO_LOGS : [],
    blocks: DEMO_BLOCKS,
    inProgress: [],
    ...insightParts(variant),
  };
}

/** A 21g variant's facts on top of the standard story (nothing else changes). */
function insightParts(
  variant: DemoVariant,
): Partial<Pick<DemoFixture, "performances" | "blocks" | "inProgress">> {
  const v = INSIGHT_VARIANTS[variant];
  if (!v) return {};
  return {
    performances: withOverrides(
      { ...DEMO_PERFORMANCES, ...BODYWEIGHT_PERFORMANCES },
      v.overrides?.(DEMO_PERFORMANCES) ?? {},
    ),
    blocks: v.activeBlock
      ? [DEMO_BLOCKS[0], { ...ACTIVE_BLOCK, ...v.activeBlock }]
      : DEMO_BLOCKS,
    inProgress: v.inProgress ?? [],
  };
}

/** Every workout in the history, oldest first. Pure. */
export function demoWorkouts(variant: DemoVariant = "standard"): DemoWorkout[] {
  const { sessions, blocks } = demoFixture(variant);
  const out: DemoWorkout[] = [];
  let weekIndex = 0;
  for (const block of blocks) {
    for (let week = 0; week < block.weeksTrained; week++, weekIndex++) {
      for (const session of sessions) {
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
  plannedCardio: number;
  cardioLogs: number;
};

/** The exact rows a successful seed creates (for the dry run and the tests). */
export function expectedCounts(variant: DemoVariant = "standard"): DemoCounts {
  const fixture = demoFixture(variant);
  const workouts = demoWorkouts(variant);
  const slotsPer = (key: DemoSession["key"]) =>
    fixture.sessions.find((s) => s.key === key)!.slots;
  const loggedExercises = workouts.reduce(
    (n, w) => n + slotsPer(w.session).length,
    0,
  );
  const loggedSets = workouts.reduce(
    (n, w) => n + slotsPer(w.session).reduce((m, s) => m + s.sets, 0),
    0,
  );
  // Today's started workout (21g `recovery`): one more workout, its planned
  // exercises, and the sets logged so far.
  const open = fixture.inProgress;
  const openExercises = open.reduce(
    (n, w) => n + slotsPer(w.session).length,
    0,
  );
  const openSets = open.reduce(
    (n, w) =>
      n + Object.values(w.sets).reduce((m, sets) => m + (sets?.length ?? 0), 0),
    0,
  );
  return {
    gyms: Object.keys(fixture.gyms).length,
    mesocycles: fixture.blocks.length,
    sessions: fixture.blocks.length * fixture.sessions.length,
    sessionExercises:
      fixture.blocks.length *
      fixture.sessions.reduce((n, s) => n + s.slots.length, 0),
    loggedSessions: workouts.length + open.length,
    loggedExercises: loggedExercises + openExercises,
    loggedSets: loggedSets + openSets,
    customExercises: 0,
    goals: 0,
    plannedCardio: fixture.plannedCardio.length,
    cardioLogs: fixture.cardioLogs.length,
  };
}
