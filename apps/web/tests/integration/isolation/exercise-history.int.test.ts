import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { getExerciseGoals } from "@/lib/goals/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { expectForeignLikeMissing, snapshotAccount } from "./support";

/**
 * Cross-account isolation — Exercise History & PR Intelligence (spec §9,
 * §14.2). No new owned model: the page reads LoggedExercise / LoggedSet /
 * Goal / Gym rows through the account-scoped layer. A second account sees
 * none of the first's sessions, records, calls, points, scopes, or goals —
 * on a shared library exercise or by naming the first's ids.
 */

let a: Account;
let b: Account;
let libraryId: string;
let customId: string;
let gymId: string;

const db = () => getTestPrisma();

async function perf(
  owner: Account,
  exerciseId: string,
  date: string,
  w: number,
) {
  const meso = await db().mesocycle.findFirst({
    where: { userId: owner.userId },
  });
  const ls = await db().loggedSession.create({
    data: {
      userId: owner.userId,
      mesocycleId: meso!.id,
      performedOn: new Date(`${date}T12:00:00Z`),
      scheduledFor: new Date(`${date}T00:00:00Z`),
      status: "complete",
    },
  });
  const le = await db().loggedExercise.create({
    data: {
      userId: owner.userId,
      loggedSessionId: ls.id,
      exerciseId,
      plannedExerciseId: exerciseId,
      gymId,
      plannedSets: 1,
      targetRepMin: 8,
      targetRepMax: 10,
    },
  });
  await db().loggedSet.create({
    data: {
      userId: owner.userId,
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: w,
      reps: 10,
    },
  });
}

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  await db().mesocycle.create({
    data: {
      userId: a.userId,
      name: "Block",
      lengthWeeks: 5,
      deloadEveryWeeks: 5,
      splitType: "custom",
      status: "active",
      startDate: new Date("2026-11-02T00:00:00Z"),
    },
  });
  libraryId = (
    await db().exercise.create({
      data: {
        name: "Chest Press Machine",
        primaryMuscle: "chest",
        equipmentType: "machine",
        isCustom: false,
        sourceId: randomUUID(),
      },
    })
  ).id;
  customId = (
    await db().exercise.create({
      data: {
        userId: a.userId,
        name: "Landmine Press",
        primaryMuscle: "shoulders",
        equipmentType: "barbell",
        isCustom: true,
      },
    })
  ).id;
  gymId = (
    await db().gym.create({ data: { userId: a.userId, name: "Downtown Gym" } })
  ).id;
  await perf(a, libraryId, "2026-11-02", 140);
  await perf(a, libraryId, "2026-11-05", 145);
  await perf(a, customId, "2026-11-02", 95);
  await db().goal.create({
    data: {
      userId: a.userId,
      exerciseId: libraryId,
      gymId,
      targetWeightLbs: 160,
      targetReps: 10,
    },
  });
});

describe("exercise history across accounts", () => {
  it("a shared library exercise shows B nothing of A's history or goals", async () => {
    const mine = await getExerciseHistory(a, libraryId);
    expect(mine?.hasHistory).toBe(true);

    const theirs = await getExerciseHistory(b, libraryId);
    expect(theirs).toMatchObject({
      hasHistory: false,
      scopes: [],
      selectedScope: null,
      next: null,
      records: null,
      sessions: { rows: [], total: 0 },
    });
    expect(JSON.stringify(theirs)).not.toMatch(/Downtown|140|145/);
    expect(await getExerciseGoals(b, libraryId)).toMatchObject({
      active: null,
      past: [],
    });
  });

  it("naming A's gym as the scope is ignored for B, exactly like a random id", async () => {
    const plain = await getExerciseHistory(b, libraryId);
    expect(await getExerciseHistory(b, libraryId, { scope: gymId })).toEqual(
      plain,
    );
  });

  it("A's custom exercise is not-found for B, indistinguishable from a missing id", async () => {
    const outcome = await expectForeignLikeMissing(customId, (id) =>
      getExerciseHistory(b, id),
    );
    expect(outcome).toEqual({ ok: true, value: null });
    await expectForeignLikeMissing(customId, (id) => getExerciseGoals(b, id));
  });

  it("B's reads change nothing of A's", async () => {
    const before = await snapshotAccount(a.userId);
    await getExerciseHistory(b, libraryId, { scope: gymId, allSessions: true });
    await getExerciseHistory(b, customId);
    await getExerciseGoals(b, libraryId);
    expect(await snapshotAccount(a.userId)).toEqual(before);
  });
});
