import type { Account } from "@/lib/data/account";
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { getTestPrisma } from "./db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestSession,
  createTestSessionExercise,
} from "./plan-factories";

/**
 * Prescription-Aware Intelligence fixtures: one exercise in two recurring
 * workouts, logged through the real write paths (startOrResumeWorkout,
 * logSet, completeWorkout), so every reader sees exactly what production
 * writes. The block starts Monday 2026-10-05 (every date used is past).
 *
 *   Push  (Saturday, dayOfWeek 6): 3 × 3–5
 *   Upper (Wednesday, dayOfWeek 3): 3 × 6–8
 */
export const BLOCK_START = "2026-10-05";
/** Saturdays and Wednesdays of weeks 1–4 (week 5 is the scheduled deload). */
export const SAT = ["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"];
export const WED = ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"];
/** Week 5 (deload every 5 weeks). */
export const SAT_DELOAD = "2026-11-07";
export const WED_DELOAD = "2026-11-04";

export async function twoWorkoutBlock(
  account: Account,
  opts: {
    equipmentType?: "barbell" | "machine" | "cable" | "bodyweight";
    name?: string;
    push?: { reps: [number, number]; sets?: number };
    upper?: { reps: [number, number]; sets?: number };
    /** Use this (e.g. shared library) exercise instead of a new custom one. */
    exercise?: { id: string; equipmentType: string };
    /** Force a session lineage (test-only; the app never accepts one). */
    lineage?: { push?: string; upper?: string };
  } = {},
) {
  const userId = account.userId;
  const meso = await createActiveTestMesocycle({
    userId,
    startDate: new Date(`${BLOCK_START}T00:00:00Z`),
    lengthWeeks: 5,
    deloadEveryWeeks: 5,
  });
  const exercise =
    opts.exercise ??
    (await createTestExercise({
      userId,
      name: opts.name ?? "Barbell Bench Press",
      equipmentType: opts.equipmentType ?? "barbell",
      primaryMuscle: "chest",
    }));
  const push = await createTestSession(meso.id, {
    userId,
    name: "Push",
    dayOfWeek: 6,
    ...(opts.lineage?.push ? { lineageId: opts.lineage.push } : {}),
  });
  const upper = await createTestSession(meso.id, {
    userId,
    name: "Upper",
    dayOfWeek: 3,
    ...(opts.lineage?.upper ? { lineageId: opts.lineage.upper } : {}),
  });
  const p = opts.push ?? { reps: [3, 5] };
  const u = opts.upper ?? { reps: [6, 8] };
  await createTestSessionExercise(push.id, exercise.id, {
    userId,
    plannedSets: p.sets ?? 3,
    targetRepMin: p.reps[0],
    targetRepMax: p.reps[1],
  });
  await createTestSessionExercise(upper.id, exercise.id, {
    userId,
    plannedSets: u.sets ?? 3,
    targetRepMin: u.reps[0],
    targetRepMax: u.reps[1],
  });
  const gym = await getTestPrisma().gym.create({
    data: { userId: account.userId, name: "Downtown Gym" },
  });
  return { meso, exercise, push, upper, gym };
}

/**
 * Start (or resume) the occurrence, log the given sets in order, and finish
 * the workout unless `finish: false`. Returns the workout and the exercise's
 * occurrence id.
 */
export async function logWorkout(
  account: Account,
  input: {
    sessionId: string;
    date: string;
    gymId: string;
    exerciseId: string;
    sets: [number | null, number][];
    finish?: boolean;
  },
) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: input.sessionId,
    scheduledFor: input.date,
    gymId: input.gymId,
  });
  const le = await getTestPrisma().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId, exerciseId: input.exerciseId },
  });
  for (const [i, [weightLbs, reps]] of input.sets.entries()) {
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: i + 1,
      weightLbs,
      reps,
    });
  }
  if (input.finish !== false) {
    await completeWorkout(account, { loggedSessionId });
  }
  return { loggedSessionId, loggedExerciseId: le.id };
}
