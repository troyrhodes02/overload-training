import { addDays } from "@/lib/plan/calendar";
import { estimateOneRepMax } from "@/lib/progression/e1rm";
import { sets } from "../progressions";
import { describe, occurrences, type Scenario } from "../scenario";
import type {
  ExerciseKey,
  MesocycleSpec,
  ScenarioFacts,
  SetSpec,
} from "../spec";

/**
 * `multi-gym` — the same lifts at two gyms whose machines don't agree.
 *
 * Block: 6 weeks (deload week 6), today (A) = week 5's Upper A, still to do.
 * Upper A and Lower are trained at North Gym, Upper B at South Gym:
 *
 *   Leverage Chest Press (machine)  North ~145–150 lb → Progress at North
 *                                   South  ~95–100 lb → Hold at South
 *   Wide-Grip Lat Pulldown (cable)  North ~160–165 lb → Hold at North
 *                                   South ~100–105 lb → Progress at South
 *   Barbell Bench Press (barbell)   both gyms, one global history (8 points)
 *
 * Opposite calls per gym make a cross-gym mix-up obvious: merged, the last two
 * chest-press sessions would be one North and one South, and neither call
 * would appear. Baselines are established per gym by the real baseline rule.
 * A South chest-press goal is measured from South only — North's heavier
 * nominal numbers would already "reach" it.
 */

type PerGym = { north: SetSpec[][]; south: SetSpec[][] };

const CHEST_PRESS: PerGym = {
  north: [
    sets(145, 9, 8, 8),
    sets(150, 9, 9, 8),
    sets(150, 10, 10, 10),
    sets(150, 10, 10, 10),
  ],
  south: [
    sets(95, 10, 9, 9),
    sets(100, 9, 9, 8),
    sets(100, 10, 9, 9),
    sets(100, 10, 10, 9),
  ],
};
const PULLDOWN: PerGym = {
  north: [
    sets(160, 10, 10, 9),
    sets(165, 10, 9, 9),
    sets(165, 11, 10, 10),
    sets(165, 11, 11, 10),
  ],
  south: [
    sets(100, 11, 10, 10),
    sets(105, 10, 10, 10),
    sets(105, 12, 12, 12),
    sets(105, 12, 12, 12),
  ],
};
const BENCH: PerGym = {
  north: [
    sets(185, 8, 7, 7),
    sets(190, 7, 6, 6),
    sets(190, 8, 7, 7),
    sets(195, 6, 6, 6),
  ],
  south: [
    sets(185, 8, 8, 7),
    sets(190, 7, 7, 6),
    sets(190, 8, 8, 7),
    sets(195, 7, 6, 6),
  ],
};
const LOWER: Record<"SQUAT" | "LEG_PRESS", SetSpec[][]> = {
  SQUAT: [
    sets(225, 6, 6, 5),
    sets(225, 7, 6, 6),
    sets(235, 6, 5, 5),
    sets(235, 6, 6, 6),
  ],
  LEG_PRESS: [
    sets(360, 11, 10, 10),
    sets(360, 12, 11, 11),
    sets(380, 10, 10, 10),
    sets(380, 11, 10, 10),
  ],
};

const UPPER_SLOTS = [
  { ex: "BENCH" as const, sets: 3, repMin: 6, repMax: 8 },
  { ex: "CHEST_PRESS" as const, sets: 3, repMin: 8, repMax: 10 },
  { ex: "PULLDOWN" as const, sets: 3, repMin: 10, repMax: 12 },
];

function meso(anchorIso: string): MesocycleSpec {
  return {
    key: "travel",
    name: "Two-Gym Block",
    splitType: "custom",
    status: "active",
    startIso: addDays(anchorIso, -28),
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
    sessions: [
      { key: "upper-a", name: "Upper A", dayOffset: 0, slots: UPPER_SLOTS },
      {
        key: "lower",
        name: "Lower",
        dayOffset: 2,
        slots: [
          { ex: "SQUAT", sets: 3, repMin: 5, repMax: 7 },
          { ex: "LEG_PRESS", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
      { key: "upper-b", name: "Upper B", dayOffset: 4, slots: UPPER_SLOTS },
    ],
  };
}

const GOAL_TARGET = { weight: 125, reps: 10 }; // South chest press

function build(anchorIso: string): ScenarioFacts {
  const m = meso(anchorIso);
  const workouts = occurrences(m)
    .filter((o) => o.date < anchorIso)
    .map((o) => {
      const i = o.week - 1;
      if (o.session === "lower") {
        return {
          meso: m.key,
          session: o.session,
          scheduledFor: o.date,
          gym: "north",
          exercises: (["SQUAT", "LEG_PRESS"] as const).map((ex) => ({
            ex,
            sets: LOWER[ex][i],
          })),
        };
      }
      const gym = o.session === "upper-a" ? "north" : "south";
      return {
        meso: m.key,
        session: o.session,
        scheduledFor: o.date,
        gym,
        exercises: [
          { ex: "BENCH" as const, sets: BENCH[gym][i] },
          { ex: "CHEST_PRESS" as const, sets: CHEST_PRESS[gym][i] },
          { ex: "PULLDOWN" as const, sets: PULLDOWN[gym][i] },
        ],
      };
    });
  return {
    gyms: [
      {
        key: "north",
        name: "North Gym",
        address: "North side, by the station",
      },
      { key: "south", name: "South Gym", address: "South end, past the park" },
    ],
    mesocycles: [m],
    workouts,
    resolutions: [],
    cardioLogs: [],
    goals: [
      {
        key: "chest-south",
        ex: "CHEST_PRESS",
        gym: "south",
        targetWeightLbs: GOAL_TARGET.weight,
        targetReps: GOAL_TARGET.reps,
        createdIso: addDays(anchorIso, -25),
      },
      {
        key: "bench",
        ex: "BENCH",
        targetWeightLbs: 225,
        targetReps: 5,
        createdIso: addDays(anchorIso, -25),
      },
    ],
  };
}

const range = (s: SetSpec[][]) => {
  const w = s.flat().map((x) => x.weightLbs);
  return { min: Math.min(...w), max: Math.max(...w) };
};
const bestE1rm = (s: SetSpec[][]) =>
  Math.max(...s.flat().map((x) => estimateOneRepMax(x.weightLbs, x.reps)));

export const multiGym: Scenario = {
  key: "multi-gym",
  description: "Gym-variable machine isolation across two gyms.",
  shows: [
    "Leverage Chest Press: Progress at North Gym, Hold at South Gym (gym selector on the exercise page)",
    "Wide-Grip Lat Pulldown: Hold at North, Progress at South",
    "Independent per-gym baselines (~145 vs ~95 lb chest press)",
    "Barbell Bench Press: one global trend across both gyms",
    "South chest-press goal measured from South only",
  ],
  build,
  async verify(ctx) {
    const expect = async (
      ex: ExerciseKey,
      gym: "north" | "south",
      state: string,
    ) => {
      const p = await ctx.progression(ex, gym);
      ctx.note(describe(p));
      ctx.check(p.isGymVariable, `${p.exerciseName} should be gym-variable`);
      ctx.check(
        p.selectedGymId === ctx.ids.gyms[gym],
        `${p.exerciseName} should be scoped to ${gym}`,
      );
      ctx.check(
        p.state === state,
        `${p.exerciseName} at ${gym} should derive ${state}; derived ${p.state}`,
      );
      const gymName = gym === "north" ? "North Gym" : "South Gym";
      ctx.check(
        p.points.length === 4 && p.points.every((pt) => pt.gymName === gymName),
        `${p.exerciseName} at ${gym} should chart only its own 4 sessions`,
      );
    };
    await expect("CHEST_PRESS", "north", "progress");
    await expect("CHEST_PRESS", "south", "hold");
    await expect("PULLDOWN", "north", "hold");
    await expect("PULLDOWN", "south", "progress");

    const bench = await ctx.progression("BENCH");
    ctx.note(describe(bench));
    ctx.check(!bench.isGymVariable, "Bench should be gym-consistent");
    // Gym-consistent: one global history. (The read deliberately carries no
    // gym on a global point, so the gyms come from the facts it charts.)
    const benchGyms = new Set(
      ctx.facts.workouts
        .filter((w) => w.exercises.some((e) => e.ex === "BENCH"))
        .map((w) => w.gym),
    );
    ctx.check(
      bench.points.length === 8 &&
        bench.selectedGymId === null &&
        benchGyms.size === 2,
      `Bench should chart all 8 sessions from both gyms as one history; derived ${bench.points.length} points (scope ${bench.selectedGymName ?? "global"})`,
    );

    // Baselines: established per gym by the real rule, each inside its own
    // gym's nominal range and outside the other's.
    for (const [ex, data] of [
      ["CHEST_PRESS", CHEST_PRESS],
      ["PULLDOWN", PULLDOWN],
    ] as const) {
      for (const gym of ["north", "south"] as const) {
        const other = gym === "north" ? "south" : "north";
        const row = await ctx.baseline(ex, gym);
        const own = range(data[gym]);
        const theirs = range(data[other]);
        ctx.check(
          row !== null &&
            row >= own.min &&
            row <= own.max &&
            (row < theirs.min || row > theirs.max),
          `${ex} baseline at ${gym} should sit in ${gym}'s own range ${own.min}–${own.max}; found ${row}`,
        );
        if (row !== null) ctx.note(`Baseline ${ex} @ ${gym}: ${row} lb`);
      }
    }

    // The South goal is measured from South only.
    const goals = await ctx.activeGoals();
    const south = goals.find((g) => g.goalId === ctx.ids.goals["chest-south"]);
    const target = estimateOneRepMax(GOAL_TARGET.weight, GOAL_TARGET.reps);
    const expected = Math.floor((bestE1rm(CHEST_PRESS.south) / target) * 100);
    ctx.check(
      south?.percent === expected && bestE1rm(CHEST_PRESS.north) > target,
      `South chest-press goal should read ${expected}% from South history only; derived ${south?.percent}`,
    );
    if (south) {
      ctx.note(
        `Goal ${south.exerciseName} @ ${south.gymName} ${south.targetLabel}: ${south.percent}% (North's heavier numbers ignored)`,
      );
    }
  },
};
