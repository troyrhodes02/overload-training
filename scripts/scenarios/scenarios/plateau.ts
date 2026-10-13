import { addDays } from "@/lib/plan/calendar";
import { sets } from "../progressions";
import { describe, occurrences, type Scenario } from "../scenario";
import type {
  ExerciseKey,
  MesocycleSpec,
  ScenarioFacts,
  SetSpec,
} from "../spec";

/**
 * `plateau` — engineered histories around the progression thresholds.
 *
 * Block: 8 weeks, scheduled deload every 4 (week 4 is in the past). Weeks 1–5
 * are fully logged; today (A) is week 6's Push day, still to do. The shipped
 * rules (src/lib/progression): calls need 2 qualifying performances; Progress
 * = every set at the top of the range in the last 2; reactive Deload = a set
 * below the range in each of the last 2; with ≥ 3 qualifying points, Progress
 * is withheld ("stalled") unless the e1RM rose across the last 3; scheduled-
 * deload weeks are excluded from all of it.
 *
 *   A  Barbell Bench Press   180 × 8,8,8 twice after 180 × 7 → Progress
 *   B  Bent Over Barbell Row in range, never all at the top   → Hold
 *   C  Standing Military Press 115 × 8,8,8 three times (flat) → Stalled
 *   D  Barbell Squat         a set below 5 reps, twice        → Deload
 *   E  Wide-Grip Lat Pulldown below range in the deload week AND the week
 *      after — counted, that would be a reactive Deload; the deload week is
 *      excluded, so the last two qualifying are fine/below    → Hold
 */

type History = Record<number, SetSpec[]>; // mesocycle week → sets

const HISTORY: Partial<Record<ExerciseKey, History>> = {
  // A — Progress
  BENCH: {
    1: sets(175, 8, 7, 7),
    2: sets(180, 7, 7, 6),
    3: sets(180, 8, 8, 8),
    4: sets(160, 8, 8, 8), // scheduled deload
    5: sets(180, 8, 8, 8),
  },
  // C — Stalled: all at the top, e1RM flat across the last three
  OHP: {
    1: sets(110, 8, 7, 7),
    2: sets(115, 8, 8, 8),
    3: sets(115, 8, 8, 8),
    4: sets(100, 8, 8, 8), // scheduled deload
    5: sets(115, 8, 8, 8),
  },
  PUSHDOWN: {
    1: sets(50, 11, 10, 10),
    2: sets(50, 12, 11, 11),
    3: sets(55, 11, 10, 10),
    4: sets(45, 10, 10, 10),
    5: sets(55, 12, 11, 10),
  },
  // B — Hold
  ROW: {
    1: sets(135, 9, 8, 8),
    2: sets(135, 10, 9, 8),
    3: sets(140, 9, 9, 8),
    4: sets(125, 10, 10, 10),
    5: sets(140, 10, 9, 9),
  },
  // E — the scheduled-deload exclusion, visible
  PULLDOWN: {
    1: sets(130, 11, 10, 10),
    2: sets(135, 11, 11, 10),
    3: sets(135, 12, 11, 10),
    4: sets(120, 9, 9, 8), // scheduled deload, below range
    5: sets(140, 10, 9, 9), // below range
  },
  // D — reactive Deload
  SQUAT: {
    1: sets(225, 7, 6, 6),
    2: sets(235, 6, 5, 5),
    3: sets(245, 5, 5, 4),
    4: sets(205, 5, 5, 5),
    5: sets(245, 5, 4, 4),
  },
  LEG_PRESS: {
    1: sets(320, 11, 10, 10),
    2: sets(320, 12, 11, 11),
    3: sets(340, 10, 10, 10),
    4: sets(290, 10, 10, 10),
    5: sets(340, 11, 11, 10),
  },
  RDL: {
    1: sets(185, 9, 8, 8),
    2: sets(185, 10, 9, 9),
    3: sets(195, 9, 8, 8),
    4: sets(175, 9, 9, 9),
    5: sets(195, 10, 9, 8),
  },
};

function meso(anchorIso: string): MesocycleSpec {
  return {
    key: "plateau",
    name: "Plateau Block",
    splitType: "ppl",
    status: "active",
    startIso: addDays(anchorIso, -35),
    lengthWeeks: 8,
    deloadEveryWeeks: 4,
    sessions: [
      {
        key: "push",
        name: "Push Day",
        dayOffset: 0,
        slots: [
          { ex: "BENCH", sets: 3, repMin: 6, repMax: 8 },
          { ex: "OHP", sets: 3, repMin: 6, repMax: 8 },
          { ex: "PUSHDOWN", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
      {
        key: "pull",
        name: "Pull Day",
        dayOffset: 2,
        slots: [
          { ex: "ROW", sets: 3, repMin: 8, repMax: 10 },
          { ex: "PULLDOWN", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
      {
        key: "legs",
        name: "Leg Day",
        dayOffset: 4,
        slots: [
          { ex: "SQUAT", sets: 3, repMin: 5, repMax: 7 },
          { ex: "LEG_PRESS", sets: 3, repMin: 10, repMax: 12 },
          { ex: "RDL", sets: 3, repMin: 8, repMax: 10 },
        ],
      },
    ],
  };
}

function build(anchorIso: string): ScenarioFacts {
  const m = meso(anchorIso);
  const workouts = occurrences(m)
    .filter((o) => o.date < anchorIso)
    .map((o) => {
      const session = m.sessions.find((s) => s.key === o.session)!;
      return {
        meso: m.key,
        session: o.session,
        scheduledFor: o.date,
        gym: "downtown",
        exercises: session.slots.map((sl) => {
          const s = HISTORY[sl.ex]?.[o.week];
          if (!s)
            throw new Error(`plateau: no week ${o.week} sets for ${sl.ex}`);
          return { ex: sl.ex, sets: s };
        }),
      };
    });
  return {
    gyms: [{ key: "downtown", name: "Downtown Gym" }],
    mesocycles: [m],
    workouts,
    resolutions: [],
    cardioLogs: [],
    // Secondary: one goal, measured from the bench history.
    goals: [
      {
        key: "bench",
        ex: "BENCH",
        targetWeightLbs: 225,
        targetReps: 5,
        createdIso: addDays(anchorIso, -30),
      },
    ],
  };
}

/** The engineered expectations: lift → state the real engine must derive. */
export const PLATEAU_EXPECTED: Partial<Record<ExerciseKey, string>> = {
  BENCH: "progress",
  ROW: "hold",
  OHP: "stalled",
  SQUAT: "deload",
  PULLDOWN: "hold",
  PUSHDOWN: "hold",
  LEG_PRESS: "hold",
  RDL: "hold",
};

export const plateau: Scenario = {
  key: "plateau",
  description:
    "Engineered Progress / Hold / stalled / Deload states side by side.",
  shows: [
    "Barbell Bench Press: Progress (+5 suggestion)",
    "Bent Over Barbell Row: Hold (no tag)",
    "Standing Military Press: stalled — Progress withheld, flat e1RM",
    "Barbell Squat: reactive Deload",
    "Wide-Grip Lat Pulldown: Hold — its below-range deload-week session is excluded (marked on the chart)",
    "Week 4 was a scheduled deload; today is week 6's Push day",
  ],
  build,
  async verify(ctx) {
    for (const [ex, expected] of Object.entries(PLATEAU_EXPECTED) as [
      ExerciseKey,
      string,
    ][]) {
      const p = await ctx.progression(ex, "downtown");
      ctx.note(describe(p));
      ctx.check(
        p.state === expected,
        `${p.exerciseName} should derive ${expected}; the engine derived ${p.state}`,
      );
    }
    const pulldown = await ctx.progression("PULLDOWN", "downtown");
    ctx.check(
      pulldown.points.some((pt) => pt.scheduledDeload),
      "Lat Pulldown's scheduled-deload session should be on the chart, marked",
    );
    const [goal] = await ctx.activeGoals();
    ctx.check(
      goal?.percent != null && goal.percent < 100,
      `Bench goal should be measured below 100%; derived ${goal?.percent}`,
    );
  },
};
