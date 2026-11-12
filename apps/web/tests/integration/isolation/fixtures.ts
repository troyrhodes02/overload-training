import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { addPlannedCardio } from "@/lib/plan/cardio";
import { createGym } from "@/lib/gyms/gyms";
import { createCustomExercise } from "@/lib/exercises/exercises";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { addDays, todayIso } from "@/lib/plan/calendar";
import { getTestPrisma } from "../support/db";

/**
 * Real-shaped training data for one account, built ONLY through the
 * application's write modules (so it carries exactly the ownership the app
 * would give it). Accounts in these suites use UTC, so "today" is the UTC date.
 */

export const today = () => todayIso("UTC");
/** ISO 1 = Monday … 7 = Sunday, for today in UTC. */
export const todayWeekday = () => ((new Date().getUTCDay() + 6) % 7) + 1;

/** Shared library rows (ownerless), created once per test like the catalog import. */
export async function library() {
  const p = getTestPrisma();
  const make = (
    name: string,
    equipmentType: "barbell" | "machine",
    primaryMuscle: "chest" | "back" = "chest",
  ) =>
    p.exercise.create({
      data: {
        name,
        primaryMuscle,
        equipmentType,
        isCustom: false,
        sourceId: randomUUID(),
      },
    });
  return {
    bench: await make("Barbell Bench Press", "barbell"),
    chestPress: await make("Chest Press Machine", "machine"),
    incline: await make("Incline Bench Press", "barbell"),
  };
}

export type Lib = Awaited<ReturnType<typeof library>>;

/**
 * An active block whose session (chest press 3×8–10, bench 3×5) and planned
 * cardio fall on today, plus a gym and a custom exercise. Returns the ids a
 * second account will try to reach.
 */
export async function activePlan(
  account: Account,
  lib: Lib,
  label: string,
  opts: { activate?: boolean } = {},
) {
  const gym = await createGym(account, { name: `${label} Gym` });
  const custom = await createCustomExercise(account, {
    name: `${label} Landmine Press`,
    primaryMuscle: "chest",
    equipmentType: "other",
  });
  const meso = await createMesocycle(account, {
    name: `${label} Block`,
    startDate: addDays(today(), -7),
    lengthWeeks: "5",
    deloadEveryWeeks: "5",
    splitType: "custom",
  });
  const session = await addSession(account, {
    mesocycleId: meso.id,
    name: `${label} Push`,
    dayOfWeek: todayWeekday(),
  });
  await addSessionExercise(account, {
    sessionId: session.id,
    exerciseId: lib.chestPress.id,
    plannedSets: "3",
    targetRepMin: "8",
    targetRepMax: "10",
  });
  await addSessionExercise(account, {
    sessionId: session.id,
    exerciseId: lib.bench.id,
    plannedSets: "3",
    targetRepMin: "5",
    targetRepMax: "5",
  });
  await addPlannedCardio(account, {
    mesocycleId: meso.id,
    dayOfWeek: todayWeekday(),
    type: "Incline walk",
    durationMin: "20",
  });
  if (opts.activate !== false) {
    await activateMesocycle(account, {
      mesocycleId: meso.id,
      expectedActiveId: null,
    });
  }
  return { gym, custom, meso, session };
}

/** Starts today's workout and returns its logged exercises by exercise id. */
export async function startToday(
  account: Account,
  plan: Awaited<ReturnType<typeof activePlan>>,
) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: plan.session.id,
    scheduledFor: today(),
    gymId: plan.gym.id,
  });
  const les = await getTestPrisma().loggedExercise.findMany({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
  });
  return { loggedSessionId, les };
}
