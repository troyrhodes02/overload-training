import type { Prisma } from "@prisma/client";

/**
 * Scenario reset (dev tooling only): removes every scenario-owned row so the
 * next scenario starts from a clean timeline — data fixture replacement, not
 * database recreation. No schema operation, no `migrate reset`, no TRUNCATE.
 *
 * Deleted, children before parents (every FK in the logged chain is
 * Restrict): cardio logs, planned cardio, goals, logged sets, logged
 * exercises, logged sessions, missed-day resolutions, gym baselines, planned
 * exercises, sessions, mesocycles, gyms.
 *
 * Preserved: the `exercises` table in full — the imported library and any
 * custom exercises, with their favorite / archived state — and everything
 * outside the application tables (Supabase auth users, Storage images). There
 * is one lifter; scenarios are alternate timelines of that lifter's data, so
 * the auth account is never created, changed, or removed here.
 */
export async function resetScenarioData(
  tx: Prisma.TransactionClient,
): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  const run = async (name: string, op: Promise<{ count: number }>) => {
    removed[name] = (await op).count;
  };
  await run("cardioLogs", tx.cardioLog.deleteMany({}));
  await run("plannedCardio", tx.plannedCardio.deleteMany({}));
  await run("goals", tx.goal.deleteMany({}));
  await run("loggedSets", tx.loggedSet.deleteMany({}));
  await run("loggedExercises", tx.loggedExercise.deleteMany({}));
  await run("loggedSessions", tx.loggedSession.deleteMany({}));
  await run("missedDayResolutions", tx.missedDayResolution.deleteMany({}));
  await run("gymBaselines", tx.gymExerciseBaseline.deleteMany({}));
  await run("sessionExercises", tx.sessionExercise.deleteMany({}));
  await run("sessions", tx.session.deleteMany({}));
  await run("mesocycles", tx.mesocycle.deleteMany({}));
  await run("gyms", tx.gym.deleteMany({}));
  return removed;
}
