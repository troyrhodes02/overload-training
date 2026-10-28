import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { editPlannedSets } from "@/lib/logging/sessions";
import { getOccurrenceProgression } from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import { createTestAccount, defaultAccount } from "./support/accounts";

/**
 * Per-session planned-sets correction (OVE feedback follow-up). Lowering the
 * `plannedSets` snapshot on a complete-but-short logged session re-qualifies it
 * for the progress/hold/deload tag, because the gate is computed on read. The
 * correction can only lower (not raise) the snapshot, is scoped to one logged
 * exercise, and another account cannot reach it.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5.
 *   week 1 = 11/02..11/08, week 2 = 11/09..11/15 (both non-deload).
 */
const db = () => getTestPrisma();
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/** A complete session that logged `reps.length` sets against a plan of `plannedSets`. */
async function logShort(opts: {
  mesocycleId: string;
  exerciseId: string;
  scheduledFor: string;
  plannedSets: number;
  reps: number[];
  weight: number;
}) {
  const p = db();
  const ls = await p.loggedSession.create({
    data: {
      userId: account.userId,
      mesocycleId: opts.mesocycleId,
      performedOn: new Date(`${opts.scheduledFor}T12:00:00Z`),
      scheduledFor: new Date(`${opts.scheduledFor}T00:00:00Z`),
      status: "complete",
    },
  });
  const le = await p.loggedExercise.create({
    data: {
      userId: account.userId,
      loggedSessionId: ls.id,
      exerciseId: opts.exerciseId,
      plannedExerciseId: opts.exerciseId,
      plannedSets: opts.plannedSets,
      targetRepMin: 6,
      targetRepMax: 8,
    },
  });
  for (let i = 0; i < opts.reps.length; i++) {
    await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: opts.weight,
        reps: opts.reps[i],
      },
    });
  }
  return le.id;
}

it("a short session doesn't qualify until the planned-sets snapshot is lowered to match", async () => {
  const meso = await createTestMesocycle({ status: "active" });
  const bench = await createTestExercise({ equipmentType: "barbell" });

  // Two complete sessions, each hitting the top of the range (8) but logging
  // only 2 of a planned 3 sets. Rising weight keeps e1RM off a stall.
  const le1 = await logShort({
    mesocycleId: meso.id,
    exerciseId: bench.id,
    scheduledFor: "2026-11-03",
    plannedSets: 3,
    reps: [8, 8],
    weight: 185,
  });
  const le2 = await logShort({
    mesocycleId: meso.id,
    exerciseId: bench.id,
    scheduledFor: "2026-11-10",
    plannedSets: 3,
    reps: [8, 8],
    weight: 190,
  });

  // Short of the plan: neither session qualifies, so there is no tag.
  expect(
    (await getOccurrenceProgression(account, le2))?.tag ?? null,
  ).toBeNull();

  // Lower both snapshots to the 2 sets actually performed.
  await editPlannedSets(account, { loggedExerciseId: le1, plannedSets: 2 });
  await editPlannedSets(account, { loggedExerciseId: le2, plannedSets: 2 });

  // Now both qualify and both are all-top: the lift reads progress.
  expect((await getOccurrenceProgression(account, le2))?.tag).toBe("progress");
});

it("refuses to raise the snapshot above the original plan", async () => {
  const meso = await createTestMesocycle({ status: "active" });
  const bench = await createTestExercise({ equipmentType: "barbell" });
  const le = await logShort({
    mesocycleId: meso.id,
    exerciseId: bench.id,
    scheduledFor: "2026-11-03",
    plannedSets: 3,
    reps: [8, 8],
    weight: 185,
  });
  await expect(
    editPlannedSets(account, { loggedExerciseId: le, plannedSets: 4 }),
  ).rejects.toMatchObject({ code: "validation_error" });
  const row = await db().loggedExercise.findUniqueOrThrow({
    where: { id: le },
  });
  expect(row.plannedSets).toBe(3);
});

it("another account cannot correct this account's logged exercise", async () => {
  const meso = await createTestMesocycle({ status: "active" });
  const bench = await createTestExercise({ equipmentType: "barbell" });
  const le = await logShort({
    mesocycleId: meso.id,
    exerciseId: bench.id,
    scheduledFor: "2026-11-03",
    plannedSets: 3,
    reps: [8, 8],
    weight: 185,
  });
  const other = await createTestAccount();
  await expect(
    editPlannedSets(other, { loggedExerciseId: le, plannedSets: 2 }),
  ).rejects.toMatchObject({ code: "not_found" });
  const row = await db().loggedExercise.findUniqueOrThrow({
    where: { id: le },
  });
  expect(row.plannedSets).toBe(3);
});
