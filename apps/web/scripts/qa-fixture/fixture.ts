/**
 * THE QA FIXTURE (OVE-173). One versioned, entirely synthetic baseline for the
 * designated QA test account on the development project, used for manual web
 * and iPhone testing. It extends the demo fixture's tuned training story
 * (scripts/demo/fixture.ts, the numbers that make the real engine say
 * progress / hold / deload) with what a tester needs to exercise every
 * shipped surface: a bodyweight lift, a fixed rep target, a custom exercise,
 * RIR, favorites, a skipped missed day, planned and logged cardio, goals in
 * each state, finished onboarding, and comp Pro.
 *
 * It holds FACTS only — profile values, plans, gyms, dated workouts and the
 * sets lifted, cardio, goal targets. Nothing derived (a call, e1RM, trend,
 * baseline) appears here: the unchanged application derives it on read, and
 * baselines come from logging the sets through the real write path.
 *
 * Every date is relative to `anchorIso` (the reset date, "today" in the
 * fixture's time zone), so a reset on any day lands today's Upper A pending.
 * Changing anything here changes the baseline: bump QA_FIXTURE_VERSION.
 */
import {
  DEMO_BLOCKS,
  DEMO_GYMS,
  DEMO_LIBRARY,
  DEMO_PERFORMANCES,
  DEMO_SESSIONS,
  RIVERSIDE_UPPER_B_WEEKS,
  type DemoGym,
} from "../demo/fixture";

export const QA_FIXTURE_VERSION = "qa-v1";

/** The QA account's home time zone (its "today"). Set by every seed/reset. */
export const QA_TIME_ZONE = "America/Chicago";

/** Profile values written by every seed/reset (the username is never changed). */
export const QA_PROFILE = {
  firstName: "Quinn",
  lastName: "Tester",
  appearance: "system",
} as const;

/** Library exercises by stable free-exercise-db source id. Never created. */
export const QA_LIBRARY = {
  ...DEMO_LIBRARY,
  PULLUPS: "Pullups", // bodyweight: reps only, no weight
  DEADLIFT: "Barbell_Deadlift", // a fixed rep target (5 × 5 → "2 × 5")
} as const;

/** The one custom exercise (owned by the account, gym-consistent). */
export const QA_CUSTOM_EXERCISE = {
  name: "Landmine Squat",
  primaryMuscle: "quads",
  equipmentType: "barbell",
  secondaryMuscles: ["glutes"],
} as const;

export type QaExercise = keyof typeof QA_LIBRARY | "LANDMINE";

/** Fictional gyms; one carries a free-text location (shown on Gyms only). */
export const QA_GYMS: Record<DemoGym, { name: string; address: string }> = {
  northside: { name: DEMO_GYMS.northside.name, address: "Example City" },
  riverside: { name: DEMO_GYMS.riverside.name, address: "" },
};

export type QaSlot = {
  ex: QaExercise;
  sets: number;
  repMin: number;
  repMax: number;
};

export type QaSession = {
  key: "upperA" | "lowerA" | "upperB" | "lowerB";
  name: string;
  dayOffset: number;
  slots: QaSlot[];
};

const EXTRA_SLOTS: Record<QaSession["key"], QaSlot[]> = {
  upperA: [],
  lowerA: [{ ex: "DEADLIFT", sets: 2, repMin: 5, repMax: 5 }],
  upperB: [{ ex: "PULLUPS", sets: 3, repMin: 6, repMax: 10 }],
  lowerB: [{ ex: "LANDMINE", sets: 3, repMin: 10, repMax: 12 }],
};

/** The weekly split: the demo's four sessions plus one extra slot each where useful. */
export const QA_SESSIONS: QaSession[] = DEMO_SESSIONS.map((s) => ({
  key: s.key,
  name: s.name,
  dayOffset: s.dayOffset,
  slots: [...s.slots, ...EXTRA_SLOTS[s.key]],
}));

/** Two blocks: Block 1 trained in full, Block 2 active (weeks 1-3 trained). */
export const QA_BLOCKS = DEMO_BLOCKS;

/** One exercise's sets in one workout: weight (null = bodyweight) and reps. */
type Perf = readonly [weightLbs: number | null, reps: readonly number[]];

/**
 * The sets lifted, by trained-week index (0-4 Block 1 weeks 1-5, week 5 being
 * the scheduled deload; 5-7 Block 2 weeks 1-3). The demo's lifts keep the
 * demo's numbers; the extras are new.
 */
export const QA_PERFORMANCES: Record<QaExercise, readonly Perf[]> = {
  ...DEMO_PERFORMANCES,
  PULLUPS: [
    [null, [6, 6, 5]],
    [null, [7, 6, 6]],
    [null, [7, 7, 6]],
    [null, [8, 7, 6]],
    [null, [6, 6, 6]],
    [null, [8, 8, 7]],
    [null, [9, 8, 8]],
    [null, [10, 9, 8]],
  ],
  DEADLIFT: [
    [225, [5, 5]],
    [235, [5, 5]],
    [245, [5, 5]],
    [255, [5, 4]],
    [205, [5, 5]],
    [255, [5, 5]],
    [265, [5, 5]],
    [275, [5, 5]],
  ],
  LANDMINE: [
    [70, [12, 11, 10]],
    [70, [12, 12, 11]],
    [75, [11, 10, 10]],
    [75, [12, 11, 11]],
    [60, [12, 12, 12]],
    [75, [12, 12, 12]],
    [80, [11, 10, 10]],
    [80, [12, 11, 10]],
  ],
};

/**
 * Reps in reserve, recorded per set on Block 2's compound lifts (week index
 * 5-7). Never 0 at the top of the range, so RIR never turns the fixture's
 * progress story into a hold (RIR Logging & Autoregulation, case A).
 */
export const QA_RIR: Partial<
  Record<QaExercise, readonly (readonly number[])[]>
> = {
  BENCH: [
    [3, 2, 2],
    [2, 2, 1],
    [2, 1, 1],
  ],
  SQUAT: [
    [3, 2, 2],
    [2, 2, 1],
    [2, 1, 1],
  ],
  DEADLIFT: [
    [3, 2],
    [2, 2],
    [2, 1],
  ],
};

/** The first trained-week index that carries RIR (Block 2 week 1). */
export const QA_RIR_FIRST_WEEK = 5;

/**
 * The one missed day: Block 2 week 2's Lower B was not trained and was
 * resolved as "skipped", so the dashboard opens on today's workout (no
 * missed-day prompt) and History shows the skipped day.
 */
export const QA_SKIPPED = {
  block: "block2",
  session: "lowerB",
  week: 2,
} as const;

/** Planned cardio in Block 2, on the two days that hold no lifting. */
export const QA_PLANNED_CARDIO = [
  { dayOffset: 2, type: "Incline walk", durationMin: 30 },
  { dayOffset: 5, type: "Stationary bike", durationMin: 40 },
] as const;

/**
 * Cardio actually logged, by Block 2 week (1-3) and planned day. One planned
 * session (week 3's bike) is left unlogged, so History shows it as missed —
 * a fact, never a prompt. Week 2's walk ran longer than planned.
 */
export const QA_CARDIO_LOGS = [
  { week: 1, dayOffset: 2, type: "Incline walk", durationMin: 30 },
  { week: 1, dayOffset: 5, type: "Stationary bike", durationMin: 40 },
  { week: 2, dayOffset: 2, type: "Incline walk", durationMin: 35 },
  { week: 2, dayOffset: 5, type: "Stationary bike", durationMin: 40 },
  { week: 3, dayOffset: 2, type: "Incline walk", durationMin: 30 },
] as const;

/** Favorites (per-account rows; the shared library is never flagged). */
export const QA_FAVORITES: readonly QaExercise[] = [
  "BENCH",
  "SQUAT",
  "PULLUPS",
  "LANDMINE",
];

/**
 * Goals, created after the history in this order. `then: "archive"` retires
 * the goal manually. Expected states (on the anchor):
 *  - Bench 225 × 5: active, partway (best 180 × 8).
 *  - Leverage Chest Press 160 × 12 at Northside: active, gym-scoped (machine).
 *  - Barbell Squat 205 × 7: reached on creation (best 215 × 7), the calm
 *    "Goal reached" card unacknowledged.
 *  - Standing Military Press 135 × 5: archived by hand (goal history).
 */
export const QA_GOALS = [
  { ex: "BENCH", gym: null, targetWeightLbs: 225, targetReps: 5 },
  { ex: "CHEST_PRESS", gym: "northside", targetWeightLbs: 160, targetReps: 12 },
  { ex: "SQUAT", gym: null, targetWeightLbs: 205, targetReps: 7 },
  {
    ex: "OHP",
    gym: null,
    targetWeightLbs: 135,
    targetReps: 5,
    then: "archive",
  },
] as const satisfies readonly {
  ex: QaExercise;
  gym: DemoGym | null;
  targetWeightLbs: number;
  targetReps: number;
  then?: "archive";
}[];

export type QaWorkout = {
  block: (typeof QA_BLOCKS)[number]["key"];
  session: QaSession["key"];
  /** 1-based week within its block. */
  blockWeek: number;
  daysBeforeAnchor: number;
  gym: DemoGym;
  /** Trained-week index into QA_PERFORMANCES (0-7). */
  weekIndex: number;
};

/** Every planned occurrence before the anchor, oldest first, trained or skipped. Pure. */
export function qaOccurrences(): (QaWorkout & { skipped: boolean })[] {
  const out: (QaWorkout & { skipped: boolean })[] = [];
  let weekIndex = 0;
  for (const block of QA_BLOCKS) {
    for (let week = 0; week < block.weeksTrained; week++, weekIndex++) {
      for (const session of QA_SESSIONS) {
        out.push({
          block: block.key,
          session: session.key,
          blockWeek: week + 1,
          daysBeforeAnchor:
            block.startDaysBeforeAnchor - (week * 7 + session.dayOffset),
          gym:
            session.key === "upperB" &&
            RIVERSIDE_UPPER_B_WEEKS.includes(weekIndex)
              ? "riverside"
              : "northside",
          weekIndex,
          skipped:
            block.key === QA_SKIPPED.block &&
            session.key === QA_SKIPPED.session &&
            week + 1 === QA_SKIPPED.week,
        });
      }
    }
  }
  return out.sort((a, b) => b.daysBeforeAnchor - a.daysBeforeAnchor);
}

/** The workouts actually logged (every occurrence except the skipped one). */
export function qaWorkouts(): QaWorkout[] {
  return qaOccurrences()
    .filter((o) => !o.skipped)
    .map((o) => ({
      block: o.block,
      session: o.session,
      blockWeek: o.blockWeek,
      daysBeforeAnchor: o.daysBeforeAnchor,
      gym: o.gym,
      weekIndex: o.weekIndex,
    }));
}

/** Days before the anchor that Block 2 starts (the anchor is its week 4, day 1). */
export const ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR =
  QA_BLOCKS[QA_BLOCKS.length - 1].startDaysBeforeAnchor;

export type QaCounts = {
  gyms: number;
  customExercises: number;
  favorites: number;
  mesocycles: number;
  sessions: number;
  sessionExercises: number;
  plannedCardio: number;
  loggedSessions: number;
  loggedExercises: number;
  loggedSets: number;
  gymBaselines: number;
  missedDayResolutions: number;
  cardioLogs: number;
  goals: number;
};

/** The training rows a seed creates (baselines: one per machine/cable lift per gym it was trained at). */
export function expectedCounts(): QaCounts {
  const workouts = qaWorkouts();
  const slotsOf = (key: QaSession["key"]) =>
    QA_SESSIONS.find((s) => s.key === key)!.slots;
  return {
    gyms: Object.keys(QA_GYMS).length,
    customExercises: 1,
    favorites: QA_FAVORITES.length,
    mesocycles: QA_BLOCKS.length,
    sessions: QA_BLOCKS.length * QA_SESSIONS.length,
    sessionExercises:
      QA_BLOCKS.length * QA_SESSIONS.reduce((n, s) => n + s.slots.length, 0),
    plannedCardio: QA_PLANNED_CARDIO.length,
    loggedSessions: workouts.length,
    loggedExercises: workouts.reduce(
      (n, w) => n + slotsOf(w.session).length,
      0,
    ),
    loggedSets: workouts.reduce(
      (n, w) => n + slotsOf(w.session).reduce((m, s) => m + s.sets, 0),
      0,
    ),
    // Machine and cable lifts (gym-variable) get a baseline per gym trained at:
    // Upper B's chest press and cable row at both gyms, the pulldown, leg press
    // and leg curl at Northside only.
    gymBaselines: QA_EXPECTED_BASELINES.length,
    missedDayResolutions: 1,
    cardioLogs: QA_CARDIO_LOGS.length,
    goals: QA_GOALS.length,
  };
}

/** The (gym, exercise) baselines the history establishes (gym-variable lifts only). */
export const QA_EXPECTED_BASELINES: readonly {
  gym: DemoGym;
  ex: QaExercise;
}[] = [
  { gym: "northside", ex: "PULLDOWN" },
  { gym: "northside", ex: "CHEST_PRESS" },
  { gym: "riverside", ex: "CHEST_PRESS" },
  { gym: "northside", ex: "CABLE_ROW" },
  { gym: "riverside", ex: "CABLE_ROW" },
  { gym: "northside", ex: "LEG_PRESS" },
  { gym: "northside", ex: "LEG_CURL" },
];

/** Scenarios the fixture deliberately does not create (printed in reports). */
export const QA_NOT_SEEDED = [
  "A Free-plan state: the account holds comp Pro. Test Free by revoking the comp in Admin (or with a second, unseeded account).",
  "A shifted missed day (the fixture resolves one as skipped).",
  "Plan import drafts, feedback, and billing: never seeded; plan-import and feedback rows are preserved by a reset.",
] as const;
