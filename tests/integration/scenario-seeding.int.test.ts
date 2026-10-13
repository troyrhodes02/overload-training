import { seedScenario } from "../../scripts/scenarios/run";
import { LIBRARY, type ExerciseKey } from "../../scripts/scenarios/spec";
import { getTestPrisma } from "./support/db";

/**
 * Dev scenario seeding (scripts/scenarios) end to end, against the throwaway
 * test database: every scenario's intended states derive through the
 * application's own read layer, reseeding never duplicates, switching
 * scenarios leaves nothing behind, and the exercise library is never touched.
 */
const prisma = () => getTestPrisma();
const ANCHOR = "2026-10-12";

/** The library rows scenarios look up (the test DB has no catalog import). */
const CATALOG: Record<
  ExerciseKey,
  { name: string; primaryMuscle: string; equipmentType: string }
> = {
  BENCH: {
    name: "Barbell Bench Press - Medium Grip",
    primaryMuscle: "chest",
    equipmentType: "barbell",
  },
  SQUAT: {
    name: "Barbell Squat",
    primaryMuscle: "quads",
    equipmentType: "barbell",
  },
  RDL: {
    name: "Romanian Deadlift",
    primaryMuscle: "hamstrings",
    equipmentType: "barbell",
  },
  ROW: {
    name: "Bent Over Barbell Row",
    primaryMuscle: "back",
    equipmentType: "barbell",
  },
  OHP: {
    name: "Standing Military Press",
    primaryMuscle: "shoulders",
    equipmentType: "barbell",
  },
  INCLINE_DB: {
    name: "Incline Dumbbell Press",
    primaryMuscle: "chest",
    equipmentType: "dumbbell",
  },
  LATERAL: {
    name: "Side Lateral Raise",
    primaryMuscle: "shoulders",
    equipmentType: "dumbbell",
  },
  CURL: {
    name: "Dumbbell Bicep Curl",
    primaryMuscle: "biceps",
    equipmentType: "dumbbell",
  },
  PULLDOWN: {
    name: "Wide-Grip Lat Pulldown",
    primaryMuscle: "back",
    equipmentType: "cable",
  },
  CABLE_ROW: {
    name: "Seated Cable Rows",
    primaryMuscle: "back",
    equipmentType: "cable",
  },
  PUSHDOWN: {
    name: "Triceps Pushdown",
    primaryMuscle: "triceps",
    equipmentType: "cable",
  },
  LEG_PRESS: {
    name: "Leg Press",
    primaryMuscle: "quads",
    equipmentType: "machine",
  },
  LEG_CURL: {
    name: "Seated Leg Curl",
    primaryMuscle: "hamstrings",
    equipmentType: "machine",
  },
  CHEST_PRESS: {
    name: "Leverage Chest Press",
    primaryMuscle: "chest",
    equipmentType: "machine",
  },
};

async function importLibrary() {
  await prisma().exercise.createMany({
    data: (Object.keys(CATALOG) as ExerciseKey[]).map((k) => ({
      ...CATALOG[k],
      primaryMuscle: CATALOG[k].primaryMuscle as never,
      equipmentType: CATALOG[k].equipmentType as never,
      sourceId: LIBRARY[k],
      isCustom: false,
    })),
  });
  // An unrelated custom exercise the lifter made: must survive every reset.
  await prisma().exercise.create({
    data: {
      name: "Belt Squat",
      primaryMuscle: "quads",
      equipmentType: "machine",
      isCustom: true,
      isFavorite: true,
    },
  });
}

/** Everything scenario-owned, as comparable plain data. */
async function snapshot() {
  const p = prisma();
  const order = { orderBy: { id: "asc" as const } };
  return {
    gyms: await p.gym.findMany(order),
    mesocycles: await p.mesocycle.findMany(order),
    sessions: await p.session.findMany(order),
    slots: await p.sessionExercise.findMany(order),
    plannedCardio: await p.plannedCardio.findMany(order),
    loggedSessions: await p.loggedSession.findMany(order),
    loggedExercises: await p.loggedExercise.findMany(order),
    loggedSets: await p.loggedSet.findMany(order),
    resolutions: await p.missedDayResolution.findMany(order),
    cardioLogs: await p.cardioLog.findMany(order),
    goals: await p.goal.findMany(order),
    // Baselines are written by the application's own rule (its own id/time).
    baselines: (await p.gymExerciseBaseline.findMany())
      .map((b) => [b.gymId, b.exerciseId, String(b.weightLbs)])
      .sort(),
  };
}

const library = () => prisma().exercise.findMany({ orderBy: { id: "asc" } });

beforeEach(importLibrary);

describe("every scenario derives its intended states through the real app code", () => {
  it.each(["fresh", "established", "plateau", "multi-gym"])(
    "%s",
    async (key) => {
      const report = await seedScenario(key, ANCHOR);
      expect(report.failures).toEqual([]);
      expect(report.activeMesocycle).not.toBeNull();
    },
  );

  it("fresh: one workout, no call on any lift", async () => {
    const r = await seedScenario("fresh", ANCHOR);
    expect(r.completedWorkouts).toBe(1);
    expect(
      r.derived.filter((d) => /insufficient \(no tag\)/.test(d)),
    ).toHaveLength(4);
  });

  it("plateau: Progress, Hold, stalled, and Deload side by side", async () => {
    const r = await seedScenario("plateau", ANCHOR);
    const line = (name: string) => r.derived.find((d) => d.startsWith(name));
    expect(line("Barbell Bench Press")).toMatch(/: progress/);
    expect(line("Bent Over Barbell Row")).toMatch(/: hold/);
    expect(line("Standing Military Press")).toMatch(/: stalled/);
    expect(line("Barbell Squat")).toMatch(/: deload/);
  });

  it("multi-gym: per-gym baselines and scopes stay isolated", async () => {
    const r = await seedScenario("multi-gym", ANCHOR);
    expect(r.failures).toEqual([]);
    const baselines = await prisma().gymExerciseBaseline.findMany({
      include: { gym: true, exercise: true },
    });
    const chest = Object.fromEntries(
      baselines
        .filter((b) => b.exercise.sourceId === LIBRARY.CHEST_PRESS)
        .map((b) => [b.gym.name, Number(b.weightLbs)]),
    );
    expect(chest["North Gym"]).toBeGreaterThan(140);
    expect(chest["South Gym"]).toBeLessThan(110);
    // Free weights never get a baseline row.
    expect(baselines.some((b) => b.exercise.sourceId === LIBRARY.BENCH)).toBe(
      false,
    );
  });
});

describe("reset and reseed", () => {
  it("running a scenario twice reproduces it exactly — no duplication", async () => {
    await seedScenario("established", ANCHOR);
    const first = await snapshot();
    await seedScenario("established", ANCHOR);
    expect(await snapshot()).toEqual(first);
  });

  it("switching scenarios leaves nothing of the previous one", async () => {
    await seedScenario("fresh", ANCHOR);
    const freshAlone = await snapshot();
    await seedScenario("established", ANCHOR);
    await seedScenario("fresh", ANCHOR);
    expect(await snapshot()).toEqual(freshAlone);
  });

  it("never duplicates, changes, or removes library or custom exercises", async () => {
    const before = await library();
    for (const key of ["established", "plateau", "multi-gym", "fresh"]) {
      await seedScenario(key, ANCHOR);
    }
    expect(await library()).toEqual(before);
  });

  it("an explicit anchor date produces the same timeline relative to it", async () => {
    const a = await seedScenario("plateau", "2026-10-12");
    const b = await seedScenario("plateau", "2026-11-23");
    expect(a.historyRange).toEqual({ from: "2026-09-07", to: "2026-10-09" });
    expect(b.historyRange).toEqual({ from: "2026-10-19", to: "2026-11-20" });
    expect(b.completedWorkouts).toBe(a.completedWorkouts);
  });

  it("is a data replacement: no migration is applied, reset, or recorded", async () => {
    const migrations = () =>
      prisma().$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "_prisma_migrations"`,
      );
    const before = await migrations();
    await seedScenario("established", ANCHOR);
    await seedScenario("fresh", ANCHOR);
    expect(await migrations()).toEqual(before);
  });

  it("a missing library exercise fails with a message and leaves the current data untouched", async () => {
    await seedScenario("fresh", ANCHOR);
    const before = await snapshot();
    // Simulate a library without the leg press (only in this test database).
    await prisma().exercise.updateMany({
      where: { sourceId: LIBRARY.LEG_PRESS },
      data: { sourceId: "not-imported" },
    });
    await expect(seedScenario("established", ANCHOR)).rejects.toThrow(
      /Leg_Press is not in the exercise library/,
    );
    expect(await snapshot()).toEqual(before);
  });
});

describe("no derived state is stored", () => {
  it("only fact tables gain rows; progression lives nowhere but the read layer", async () => {
    await seedScenario("plateau", ANCHOR);
    const tables = await prisma().$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      "_prisma_migrations",
      "cardio_logs",
      "exercises",
      "goals",
      "gym_exercise_baselines",
      "gyms",
      "logged_exercises",
      "logged_sessions",
      "logged_sets",
      "mesocycles",
      "missed_day_resolutions",
      "planned_cardio",
      "session_exercises",
      "sessions",
    ]);
  });
});
