import { addDays } from "@/lib/plan/calendar";
import { sets } from "../progressions";
import { describe, type Scenario } from "../scenario";
import type { ExerciseKey, ScenarioFacts } from "../spec";

/**
 * `fresh` — a configured lifter who has barely started.
 *
 * Timeline (anchor = today, A):
 *   A−1  block starts; Full Body A logged (the only workout so far)
 *   A    planned cardio (Incline Walk 20) — a cardio-only day
 *   A+1  Full Body B · A+3 Full Body C, then weekly
 *
 * One completed performance per lift: e1RM shows a single point, and no lift
 * has the two qualifying performances a Progress / Deload call needs.
 */
const LOGGED: ExerciseKey[] = ["SQUAT", "BENCH", "ROW", "PULLDOWN"];

function build(anchorIso: string): ScenarioFacts {
  const start = addDays(anchorIso, -1);
  return {
    gyms: [
      {
        key: "downtown",
        name: "Downtown Gym",
        address: "Downtown, near the river",
      },
    ],
    mesocycles: [
      {
        key: "block1",
        name: "First Block",
        splitType: "custom",
        status: "active",
        startIso: start,
        lengthWeeks: 6,
        deloadEveryWeeks: 6,
        sessions: [
          {
            key: "a",
            name: "Full Body A",
            dayOffset: 0,
            slots: [
              { ex: "SQUAT", sets: 3, repMin: 5, repMax: 7 },
              { ex: "BENCH", sets: 3, repMin: 6, repMax: 8 },
              { ex: "ROW", sets: 3, repMin: 8, repMax: 10 },
              { ex: "PULLDOWN", sets: 3, repMin: 10, repMax: 12 },
            ],
          },
          {
            key: "b",
            name: "Full Body B",
            dayOffset: 2,
            slots: [
              { ex: "RDL", sets: 3, repMin: 8, repMax: 10 },
              { ex: "OHP", sets: 3, repMin: 6, repMax: 8 },
              { ex: "CABLE_ROW", sets: 3, repMin: 10, repMax: 12 },
              { ex: "CURL", sets: 2, repMin: 10, repMax: 12 },
            ],
          },
          {
            key: "c",
            name: "Full Body C",
            dayOffset: 4,
            slots: [
              { ex: "LEG_PRESS", sets: 3, repMin: 10, repMax: 12 },
              { ex: "INCLINE_DB", sets: 3, repMin: 8, repMax: 10 },
              { ex: "PUSHDOWN", sets: 3, repMin: 10, repMax: 12 },
              { ex: "LATERAL", sets: 2, repMin: 12, repMax: 15 },
            ],
          },
        ],
        cardio: [{ dayOffset: 1, type: "Incline Walk", durationMin: 20 }],
      },
    ],
    workouts: [
      {
        meso: "block1",
        session: "a",
        scheduledFor: start,
        gym: "downtown",
        exercises: [
          { ex: "SQUAT", sets: sets(185, 7, 6, 6) },
          { ex: "BENCH", sets: sets(155, 8, 8, 7) },
          { ex: "ROW", sets: sets(135, 10, 9, 9) },
          { ex: "PULLDOWN", sets: sets(110, 12, 11, 10) },
        ],
      },
    ],
    resolutions: [],
    cardioLogs: [],
    goals: [
      // Measured by the one workout so far.
      {
        key: "bench",
        ex: "BENCH",
        targetWeightLbs: 205,
        targetReps: 5,
        createdIso: start,
      },
      // No history yet: the app shows "No performance recorded yet", not 0%.
      {
        key: "rdl",
        ex: "RDL",
        targetWeightLbs: 185,
        targetReps: 8,
        createdIso: start,
      },
    ],
  };
}

export const fresh: Scenario = {
  key: "fresh",
  description:
    "Configured lifter with insufficient history (one workout so far).",
  shows: [
    "Dashboard today: a cardio-only day (Incline Walk 20 min) in a brand-new block",
    "Plan builder: three Full Body sessions with sets and rep ranges",
    "Every lift: insufficient history — no Progress / Deload tag",
    "Single-point e1RM for the lifts logged yesterday",
    "Goals: one measured (from one workout), one 'No performance recorded yet'",
  ],
  build,
  async verify(ctx) {
    for (const ex of LOGGED) {
      const p = await ctx.progression(ex, "downtown");
      ctx.note(describe(p));
      ctx.check(
        p.state === "insufficient" && p.tag === null,
        `${p.exerciseName} should have insufficient history and no tag; derived ${p.state}`,
      );
      ctx.check(
        p.points.length === 1,
        `${p.exerciseName} should have exactly one e1RM point; derived ${p.points.length}`,
      );
    }
    const goals = await ctx.activeGoals();
    const bench = goals.find((g) => g.goalId === ctx.ids.goals.bench);
    const rdl = goals.find((g) => g.goalId === ctx.ids.goals.rdl);
    ctx.check(
      bench?.percent != null && bench.percent > 0 && bench.percent < 100,
      `Bench goal should be measured below 100%; derived ${bench?.percent}`,
    );
    ctx.check(
      rdl?.percent === null,
      `RDL goal should be unmeasured; derived ${rdl?.percent}`,
    );
    if (bench)
      ctx.note(
        `Goal ${bench.exerciseName} ${bench.targetLabel}: ${bench.percent}%`,
      );
    if (rdl)
      ctx.note(
        `Goal ${rdl.exerciseName} ${rdl.targetLabel}: no performance recorded yet`,
      );
  },
};
