import type { Prisma } from "@prisma/client";
import { getTestPrisma } from "./db";

/**
 * Split & Mesocycle Builder test factories. Rows are inserted directly into
 * the throwaway database (tests only — application code writes plan rows
 * through src/lib/plan/* exclusively).
 */
const prisma = () => getTestPrisma();

export async function createTestExercise(
  overrides: Partial<Prisma.ExerciseUncheckedCreateInput> = {},
) {
  return prisma().exercise.create({
    data: {
      name: "Barbell Bench Press",
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: true,
      ...overrides,
    },
  });
}

export async function createTestMesocycle(
  overrides: Partial<Prisma.MesocycleUncheckedCreateInput> = {},
) {
  return prisma().mesocycle.create({
    data: {
      name: "Strength Block",
      lengthWeeks: 5,
      deloadWeek: 5,
      splitType: "custom",
      status: "draft",
      startDate: new Date("2026-11-02T00:00:00Z"),
      ...overrides,
    },
  });
}

export async function createTestSession(
  mesocycleId: string,
  overrides: Partial<Prisma.SessionUncheckedCreateInput> = {},
) {
  return prisma().session.create({
    data: { mesocycleId, name: "Push Day 1", dayOfWeek: 1, ...overrides },
  });
}

export async function createTestSessionExercise(
  sessionId: string,
  exerciseId: string,
  overrides: Partial<Prisma.SessionExerciseUncheckedCreateInput> = {},
) {
  return prisma().sessionExercise.create({
    data: {
      sessionId,
      exerciseId,
      position: 0,
      plannedSets: 3,
      targetRepMin: 6,
      targetRepMax: 8,
      ...overrides,
    },
  });
}

/** A ready-to-activate draft: one scheduled session with one exercise. */
export async function createReadyDraft(
  overrides: Partial<Prisma.MesocycleUncheckedCreateInput> = {},
) {
  const m = await createTestMesocycle(overrides);
  const exercise = await createTestExercise();
  const session = await createTestSession(m.id);
  const slot = await createTestSessionExercise(session.id, exercise.id);
  return { mesocycle: m, exercise, session, slot };
}

/** Logged history against a plan, inserted raw to prove plan ops never copy it. */
export async function seedLoggedHistory(input: {
  mesocycleId: string;
  sessionId: string;
  exerciseId: string;
}) {
  const p = prisma();
  const loggedSession = await p.loggedSession.create({
    data: {
      mesocycleId: input.mesocycleId,
      sessionId: input.sessionId,
      performedOn: new Date("2026-10-05T12:00:00Z"),
    },
  });
  const loggedExercise = await p.loggedExercise.create({
    data: { loggedSessionId: loggedSession.id, exerciseId: input.exerciseId },
  });
  await p.loggedSet.create({
    data: {
      loggedExerciseId: loggedExercise.id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    },
  });
}

export async function historyCounts() {
  const p = prisma();
  return {
    loggedSessions: await p.loggedSession.count(),
    loggedExercises: await p.loggedExercise.count(),
    loggedSets: await p.loggedSet.count(),
    goals: await p.goal.count(),
    baselines: await p.gymExerciseBaseline.count(),
  };
}
