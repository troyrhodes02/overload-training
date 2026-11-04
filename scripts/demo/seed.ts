import type { Account } from "@/lib/data/account";
import { addDays, isoWeekday } from "@/lib/plan/calendar";
import { createGym } from "@/lib/gyms/gyms";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import {
  DEMO_BLOCKS,
  DEMO_GYMS,
  DEMO_LIBRARY,
  DEMO_PERFORMANCES,
  DEMO_SESSIONS,
  demoWorkouts,
  expectedCounts,
  type DemoCounts,
  type DemoExercise,
  type DemoGym,
} from "./fixture";

export type { DemoCounts };

/**
 * The demo seed (spec §13, RD-16/RD-17; pitch Appendix A). Operator tooling,
 * never imported by `src/`.
 *
 *  - `inspectDemoTarget` is READ-ONLY and reads only the target account's own
 *    rows through its account-scoped client: it decides whether the account
 *    is empty (seedable), already holds exactly this fixture (a no-op), or
 *    holds anything else (refuse — the seed never edits, merges, or deletes).
 *  - `executeDemoSeed` writes the whole history in ONE transaction through
 *    the application's own write modules — createGym, createMesocycle,
 *    addSession, addSessionExercise, activateMesocycle, startOrResumeWorkout
 *    (with each workout's historical date), logSet, completeWorkout — so
 *    every invariant holds: LoggedSet rows come only from logSet, each set
 *    and its gym-baseline correction commit together, and nothing derived
 *    (call, e1RM, trend) is stored. A failure leaves nothing behind.
 *
 * There is deliberately no delete or reset path.
 */

export type DemoInspection =
  | { state: "empty"; counts: DemoCounts; expected: DemoCounts }
  | { state: "seeded"; counts: DemoCounts; expected: DemoCounts }
  | {
      state: "conflict";
      counts: DemoCounts;
      expected: DemoCounts;
      reason: string;
    };

export class DemoSeedConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedConflict";
  }
}

async function countsFor(account: Account): Promise<DemoCounts> {
  const db = account.db;
  const [
    gyms,
    mesocycles,
    sessions,
    sessionExercises,
    loggedSessions,
    loggedExercises,
    loggedSets,
    customExercises,
    goals,
  ] = await Promise.all([
    db.gym.count(),
    db.mesocycle.count(),
    db.session.count(),
    db.sessionExercise.count(),
    db.loggedSession.count(),
    db.loggedExercise.count(),
    db.loggedSet.count(),
    db.exercise.count({ where: { isCustom: true } }),
    db.goal.count(),
  ]);
  return {
    gyms,
    mesocycles,
    sessions,
    sessionExercises,
    loggedSessions,
    loggedExercises,
    loggedSets,
    customExercises,
    goals,
  };
}

/** Training data the fixture never creates: any of it means "not ours". */
async function foreignRows(account: Account): Promise<number> {
  const db = account.db;
  const [cardio, cardioLogs, favorites] = await Promise.all([
    db.plannedCardio.count(),
    db.cardioLog.count(),
    db.exerciseFavorite.count(),
  ]);
  return cardio + cardioLogs + favorites;
}

export async function inspectDemoTarget(
  account: Account,
): Promise<DemoInspection> {
  const expected = expectedCounts();
  const counts = await countsFor(account);
  const foreign = await foreignRows(account);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + foreign;
  if (total === 0) return { state: "empty", counts, expected };

  const [gyms, mesocycles] = await Promise.all([
    account.db.gym.findMany({ select: { name: true } }),
    account.db.mesocycle.findMany({ select: { name: true } }),
  ]);
  const sameNames = (have: string[], want: string[]) =>
    have.length === want.length &&
    [...have].sort().every((n, i) => n === [...want].sort()[i]);
  const isFixture =
    foreign === 0 &&
    sameNames(
      gyms.map((g) => g.name),
      Object.values(DEMO_GYMS).map((g) => g.name),
    ) &&
    sameNames(
      mesocycles.map((m) => m.name),
      DEMO_BLOCKS.map((b) => b.name),
    ) &&
    (Object.keys(expected) as (keyof DemoCounts)[]).every(
      (k) => counts[k] === expected[k],
    );
  if (isFixture) return { state: "seeded", counts, expected };
  return {
    state: "conflict",
    counts,
    expected,
    reason:
      "The account already holds training data that is not exactly this fixture. The seed never edits, merges into, or deletes existing data: use a fresh, empty local demo account.",
  };
}

/** Library exercise ids by fixture key; refuses missing or archived ones. */
async function resolveLibrary(
  account: Account,
): Promise<Record<DemoExercise, string>> {
  const rows = await account.db.exercise.findMany({
    where: { sourceId: { in: Object.values(DEMO_LIBRARY) }, isCustom: false },
    select: { id: true, sourceId: true, deletedAt: true },
  });
  const out = {} as Record<DemoExercise, string>;
  const missing: string[] = [];
  for (const [key, sourceId] of Object.entries(DEMO_LIBRARY) as [
    DemoExercise,
    string,
  ][]) {
    const row = rows.find((r) => r.sourceId === sourceId && !r.deletedAt);
    if (row) out[key] = row.id;
    else missing.push(sourceId);
  }
  if (missing.length > 0) {
    throw new DemoSeedConflict(
      `The exercise library is missing (or has archived) ${missing.join(", ")}. Import the library into the LOCAL database first (npm run db:seed with local env).`,
    );
  }
  return out;
}

export type DemoSeedResult = { created: DemoCounts };

/**
 * Seeds the fixture into an EMPTY account, in one transaction. Refuses a
 * seeded or conflicting account without writing. `anchorIso` is the demo's
 * "today" (the account's own calendar date).
 */
export async function executeDemoSeed(
  account: Account,
  anchorIso: string,
): Promise<DemoSeedResult> {
  const inspection = await inspectDemoTarget(account);
  if (inspection.state !== "empty") {
    throw new DemoSeedConflict(
      inspection.state === "seeded"
        ? "This account already holds the demo fixture. Nothing to do."
        : inspection.reason,
    );
  }
  const library = await resolveLibrary(account);

  await account.db.$transaction(
    async (tx) => {
      const gymIds = {} as Record<DemoGym, string>;
      for (const [key, gym] of Object.entries(DEMO_GYMS) as [
        DemoGym,
        { name: string },
      ][]) {
        gymIds[key] = (
          await createGym(account, { name: gym.name, address: "" }, tx)
        ).id;
      }

      const workouts = demoWorkouts();
      let activeId: string | null = null;
      for (const block of DEMO_BLOCKS) {
        const startIso = addDays(anchorIso, -block.startDaysBeforeAnchor);
        const { id: mesocycleId } = await createMesocycle(
          account,
          {
            name: block.name,
            startDate: startIso,
            lengthWeeks: block.lengthWeeks,
            deloadEveryWeeks: block.deloadEveryWeeks,
            splitType: "custom",
          },
          tx,
        );
        const sessionIds = {} as Record<string, string>;
        for (const session of DEMO_SESSIONS) {
          const { id: sessionId } = await addSession(
            account,
            {
              mesocycleId,
              name: session.name,
              dayOfWeek: isoWeekday(addDays(startIso, session.dayOffset)),
            },
            tx,
          );
          sessionIds[session.key] = sessionId;
          for (const slot of session.slots) {
            await addSessionExercise(
              account,
              {
                sessionId,
                exerciseId: library[slot.ex],
                plannedSets: slot.sets,
                targetRepMin: slot.repMin,
                targetRepMax: slot.repMax,
              },
              tx,
            );
          }
        }
        await activateMesocycle(
          account,
          { mesocycleId, expectedActiveId: activeId },
          tx,
        );
        activeId = mesocycleId;

        // This block's workouts, oldest first, through the real write path.
        for (const w of workouts.filter((x) => x.block === block.key)) {
          const scheduledFor = addDays(anchorIso, -w.daysBeforeAnchor);
          const { loggedSessionId } = await startOrResumeWorkout(
            account,
            {
              sessionId: sessionIds[w.session],
              scheduledFor,
              gymId: gymIds[w.gym],
            },
            tx,
          );
          const loggedExercises = await tx.loggedExercise.findMany({
            where: { loggedSessionId },
            select: { id: true, plannedExerciseId: true },
            orderBy: { position: "asc" },
          });
          const session = DEMO_SESSIONS.find((s) => s.key === w.session)!;
          for (const slot of session.slots) {
            const le = loggedExercises.find(
              (x) => x.plannedExerciseId === library[slot.ex],
            )!;
            const [weightLbs, reps] = DEMO_PERFORMANCES[slot.ex][w.weekIndex];
            for (let i = 0; i < slot.sets; i++) {
              await logSet(
                account,
                {
                  loggedExerciseId: le.id,
                  setNumber: i + 1,
                  weightLbs,
                  reps: reps[i],
                },
                tx,
              );
            }
          }
          await completeWorkout(account, { loggedSessionId }, tx);
        }
      }
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  const created = await countsFor(account);
  return { created };
}

/** A plain-text plan of what a dry run would create (counts only). */
export function formatInspection(inspection: DemoInspection): string {
  const lines = [`Target state: ${inspection.state.toUpperCase()}`];
  if (inspection.state === "conflict") lines.push(`  ${inspection.reason}`);
  lines.push("  rows            now   fixture");
  for (const key of Object.keys(inspection.expected) as (keyof DemoCounts)[]) {
    lines.push(
      `  ${key.padEnd(16)}${String(inspection.counts[key]).padStart(4)}   ${String(inspection.expected[key]).padStart(7)}`,
    );
  }
  return lines.join("\n");
}
