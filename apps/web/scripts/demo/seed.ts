import type { Account } from "@/lib/data/account";
import { addDays, isoWeekday } from "@overload/shared/plan/calendar";
import { logCardio } from "@/lib/cardio/cardio-logs";
import { addPlannedCardio } from "@/lib/plan/cardio";
import { createGym } from "@/lib/gyms/gyms";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import {
  demoFixture,
  demoWorkouts,
  expectedCounts,
  type DemoCounts,
  type DemoFixture,
  type DemoVariant,
  type FixtureExercise,
  type FixtureGym,
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
    plannedCardio,
    cardioLogs,
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
    db.plannedCardio.count(),
    db.cardioLog.count(),
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
    plannedCardio,
    cardioLogs,
  };
}

/** Training data no variant creates: any of it means "not ours". */
async function foreignRows(account: Account): Promise<number> {
  return account.db.exerciseFavorite.count();
}

/**
 * What each planned slot looks like, as "session|exercise source id|sets x
 * min-max" lines. Two variants can have identical row counts (`standard` and
 * `bodyweight`), so the plan itself is compared, not only how much of it
 * there is.
 */
function expectedPlan(fixture: DemoFixture): string[] {
  const lines: string[] = [];
  for (let i = 0; i < fixture.blocks.length; i++) {
    for (const session of fixture.sessions) {
      for (const slot of session.slots) {
        lines.push(
          `${session.name}|${fixture.library[slot.ex]}|${slot.sets}x${slot.repMin}-${slot.repMax}`,
        );
      }
    }
  }
  return lines.sort();
}

/**
 * Every logged set as "exercise source id|weight|reps|rir" lines (Pitch 21g).
 * Several insight variants share `standard`'s plan and row counts and differ
 * only in what was lifted, so the sets themselves are compared too: an
 * account seeded with `hold` never reads as `standard`.
 */
function expectedSets(fixture: DemoFixture, variant: DemoVariant): string[] {
  const lines: string[] = [];
  const line = (
    ex: FixtureExercise,
    w: number | null,
    reps: number,
    rir: number | null,
  ) => `${fixture.library[ex]}|${w ?? "bw"}|${reps}|${rir ?? "-"}`;
  for (const w of demoWorkouts(variant)) {
    const session = fixture.sessions.find((s) => s.key === w.session)!;
    for (const slot of session.slots) {
      const [weight, reps, rir] = fixture.performances[slot.ex]![w.weekIndex];
      for (let i = 0; i < slot.sets; i++) {
        lines.push(line(slot.ex, weight, reps[i], rir?.[i] ?? null));
      }
    }
  }
  const open = fixture.inProgressToday;
  if (open) {
    for (const [ex, sets] of Object.entries(open.sets) as [
      FixtureExercise,
      readonly (readonly [number | null, number])[],
    ][]) {
      for (const [w, reps] of sets) lines.push(line(ex, w, reps, null));
    }
  }
  return lines.sort();
}

async function actualSets(account: Account): Promise<string[]> {
  const sets = await account.db.loggedSet.findMany({
    select: {
      weightLbs: true,
      reps: true,
      rir: true,
      loggedExercise: { select: { exercise: { select: { sourceId: true } } } },
    },
  });
  return sets
    .map(
      (x) =>
        `${x.loggedExercise.exercise.sourceId}|${x.weightLbs === null ? "bw" : Number(x.weightLbs)}|${x.reps}|${x.rir ?? "-"}`,
    )
    .sort();
}

async function actualPlan(account: Account): Promise<string[]> {
  const slots = await account.db.sessionExercise.findMany({
    select: {
      plannedSets: true,
      targetRepMin: true,
      targetRepMax: true,
      session: { select: { name: true } },
      exercise: { select: { sourceId: true } },
    },
  });
  return slots
    .map(
      (x) =>
        `${x.session.name}|${x.exercise.sourceId}|${x.plannedSets}x${x.targetRepMin}-${x.targetRepMax}`,
    )
    .sort();
}

export async function inspectDemoTarget(
  account: Account,
  variant: DemoVariant = "standard",
): Promise<DemoInspection> {
  const fixture = demoFixture(variant);
  const expected = expectedCounts(variant);
  const counts = await countsFor(account);
  const foreign = await foreignRows(account);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + foreign;
  if (total === 0) return { state: "empty", counts, expected };

  const [gyms, mesocycles, plan, sets] = await Promise.all([
    account.db.gym.findMany({ select: { name: true } }),
    account.db.mesocycle.findMany({ select: { name: true } }),
    actualPlan(account),
    actualSets(account),
  ]);
  const wantPlan = expectedPlan(fixture);
  const wantSets = expectedSets(fixture, variant);
  const sameNames = (have: string[], want: string[]) =>
    have.length === want.length &&
    [...have].sort().every((n, i) => n === [...want].sort()[i]);
  const isFixture =
    foreign === 0 &&
    sameNames(
      gyms.map((g) => g.name),
      Object.values(fixture.gyms).map((g) => g.name),
    ) &&
    sameNames(
      mesocycles.map((m) => m.name),
      fixture.blocks.map((b) => b.name),
    ) &&
    (Object.keys(expected) as (keyof DemoCounts)[]).every(
      (k) => counts[k] === expected[k],
    ) &&
    plan.length === wantPlan.length &&
    plan.every((line, i) => line === wantPlan[i]) &&
    sets.length === wantSets.length &&
    sets.every((line, i) => line === wantSets[i]);
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
  fixture: DemoFixture,
): Promise<Record<FixtureExercise, string>> {
  const wanted = Object.entries(fixture.library) as [FixtureExercise, string][];
  const rows = await account.db.exercise.findMany({
    where: { sourceId: { in: wanted.map(([, id]) => id) }, isCustom: false },
    select: { id: true, sourceId: true, deletedAt: true },
  });
  const out = {} as Record<FixtureExercise, string>;
  const missing: string[] = [];
  for (const [key, sourceId] of wanted) {
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
 * "today" (the account's own calendar date). `variant` picks the scenario
 * (fixture.ts); `standard` writes exactly what this seed always has.
 */
export async function executeDemoSeed(
  account: Account,
  anchorIso: string,
  variant: DemoVariant = "standard",
): Promise<DemoSeedResult> {
  const inspection = await inspectDemoTarget(account, variant);
  if (inspection.state !== "empty") {
    throw new DemoSeedConflict(
      inspection.state === "seeded"
        ? "This account already holds the demo fixture. Nothing to do."
        : inspection.reason,
    );
  }
  const fixture = demoFixture(variant);
  const library = await resolveLibrary(account, fixture);
  const blocks = fixture.blocks;
  const activeBlock = blocks[blocks.length - 1];

  await account.db.$transaction(
    async (tx) => {
      const gymIds = {} as Record<FixtureGym, string>;
      for (const [key, gym] of Object.entries(fixture.gyms) as [
        FixtureGym,
        { name: string },
      ][]) {
        gymIds[key] = (
          await createGym(account, { name: gym.name, address: "" }, tx)
        ).id;
      }

      const workouts = demoWorkouts(variant);
      let activeId: string | null = null;
      let activeSessionIds: Record<string, string> = {};
      for (const block of blocks) {
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
        for (const session of fixture.sessions) {
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
        // Planned cardio belongs to the active block (the cardio variant).
        if (block.key === activeBlock.key) {
          for (const cardio of fixture.plannedCardio) {
            const planned = await addPlannedCardio(
              account,
              {
                mesocycleId,
                dayOfWeek: isoWeekday(addDays(startIso, cardio.dayOffset)),
                type: cardio.type,
                durationMin: cardio.durationMin,
              },
              tx,
            );
            // The fixture's one timestamp adjustment, the same one the QA
            // fixture makes: planned cardio has occurrences only from the day
            // its plan row was created, and in the story it was planned with
            // the block, so its creation date is the block's start (a plan
            // row, never logged history).
            await tx.plannedCardio.update({
              where: { id: planned.id },
              data: { createdAt: new Date(`${startIso}T00:00:00.000Z`) },
            });
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
          const session = fixture.sessions.find((s) => s.key === w.session)!;
          for (const slot of session.slots) {
            const le = loggedExercises.find(
              (x) => x.plannedExerciseId === library[slot.ex],
            )!;
            const [weightLbs, reps, rir] =
              fixture.performances[slot.ex]![w.weekIndex];
            for (let i = 0; i < slot.sets; i++) {
              const setRir = rir?.[i] ?? null;
              await logSet(
                account,
                {
                  loggedExerciseId: le.id,
                  setNumber: i + 1,
                  // A bodyweight set has no weight: stored NULL, never 0.
                  ...(weightLbs === null ? {} : { weightLbs }),
                  reps: reps[i],
                  // Recorded RIR only (21g `rir`, `edit`); unrecorded stays NULL.
                  ...(setRir === null ? {} : { rir: setRir }),
                },
                tx,
              );
            }
          }
          await completeWorkout(account, { loggedSessionId }, tx);
        }

        if (block.key === activeBlock.key) activeSessionIds = sessionIds;

        // Cardio done in the active block, through the real write path, by
        // each planned day's own date (the cardio variant).
        if (block.key === activeBlock.key) {
          for (const log of fixture.cardioLogs) {
            await logCardio(
              account,
              {
                mesocycleId,
                scheduledFor: addDays(
                  startIso,
                  (log.week - 1) * 7 + log.dayOffset,
                ),
                type: log.type,
                durationMin: log.durationMin,
              },
              tx,
            );
          }
        }
      }

      // Today's workout left in progress (21g `recovery`): started on the
      // anchor date and partly logged, never finished — as a lifter leaves it.
      const open = fixture.inProgressToday;
      if (open) {
        const { loggedSessionId } = await startOrResumeWorkout(
          account,
          {
            sessionId: activeSessionIds[open.session],
            scheduledFor: anchorIso,
            gymId: gymIds[open.gym],
          },
          tx,
        );
        const loggedExercises = await tx.loggedExercise.findMany({
          where: { loggedSessionId },
          select: { id: true, plannedExerciseId: true },
        });
        for (const [ex, sets] of Object.entries(open.sets) as [
          FixtureExercise,
          readonly (readonly [number | null, number])[],
        ][]) {
          const le = loggedExercises.find(
            (x) => x.plannedExerciseId === library[ex],
          )!;
          for (const [i, [weightLbs, reps]] of sets.entries()) {
            await logSet(
              account,
              {
                loggedExerciseId: le.id,
                setNumber: i + 1,
                ...(weightLbs === null ? {} : { weightLbs }),
                reps,
              },
              tx,
            );
          }
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
