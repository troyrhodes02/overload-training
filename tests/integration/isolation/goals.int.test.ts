import type { Account } from "@/lib/data/account";
import {
  acknowledgeGoalCompletion,
  archiveGoal,
  createGoal,
  reconcileGoalCompletions,
} from "@/lib/goals/goals";
import {
  activeGoalExerciseMap,
  countActiveGoals,
  countGoalHistory,
  getGoalDetail,
  getSessionGoalSummary,
  listActiveGoals,
  listGoalHistory,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import { completeWorkout } from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { activePlan, library, startToday, type Lib } from "./fixtures";
import { expectForeignLikeMissing, snapshotAccount } from "./support";

/**
 * Cross-account isolation — Goals. Goals, their progress, and their
 * completion are private, and reconciliation only ever touches the acting
 * account's goals.
 */

let a: Account;
let b: Account;
let lib: Lib;
let goalId: string;
let loggedSessionId: string;

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  lib = await library();
  const plan = await activePlan(a, lib, "A");
  // Goal set BEFORE the history that reaches it.
  goalId = (
    await createGoal(a, {
      exerciseId: lib.bench.id,
      targetWeightLbs: 135,
      targetReps: 5,
    })
  ).id;
  const started = await startToday(a, plan);
  loggedSessionId = started.loggedSessionId;
  for (const n of [1, 2, 3]) {
    await logSet(a, {
      loggedExerciseId: started.les[1].id,
      setNumber: n,
      weightLbs: 145,
      reps: 5,
    });
  }
  await completeWorkout(a, { loggedSessionId });
});

it("goal lists and counts are empty for a second account", async () => {
  expect(await listActiveGoals(b)).toEqual([]);
  expect(await countActiveGoals(b)).toBe(0);
  expect(await listGoalHistory(b)).toEqual([]);
  expect(await countGoalHistory(b)).toBe(0);
  expect(await listUnacknowledgedCompletions(b)).toEqual([]);
  expect((await activeGoalExerciseMap(b)).size).toBe(0);
  expect(await countActiveGoals(a)).toBe(1);
});

it("a goal or a session's goal summary by foreign id is not found", async () => {
  expect(
    await expectForeignLikeMissing(goalId, (id) => getGoalDetail(b, id)),
  ).toEqual({ ok: true, value: null });
  expect(
    await expectForeignLikeMissing(loggedSessionId, (id) =>
      getSessionGoalSummary(b, id),
    ),
  ).toEqual({ ok: true, value: [] });
});

it("archive/acknowledge with a foreign goal id behave like a missing id and change nothing", async () => {
  const before = await snapshotAccount(a.userId);
  for (const call of [
    (id: string) => archiveGoal(b, { goalId: id }),
    (id: string) => acknowledgeGoalCompletion(b, { goalId: id }),
  ]) {
    expect(await expectForeignLikeMissing(goalId, call)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  }
  expect(await snapshotAccount(a.userId)).toEqual(before);
});

it("reconciliation by one account never completes another account's goal", async () => {
  expect(await reconcileGoalCompletions(b)).toEqual([]);
  expect(
    (await getTestPrisma().goal.findUniqueOrThrow({ where: { id: goalId } }))
      .status,
  ).toBe("active");
  // The owner's own reconciliation sees its history and completes it.
  expect(await reconcileGoalCompletions(a)).toEqual([goalId]);
});

it("another account's custom exercise can't carry a goal (same as a missing exercise)", async () => {
  const aPlanCustom = await getTestPrisma().exercise.findFirstOrThrow({
    where: { userId: a.userId, isCustom: true },
  });
  const result = await expectForeignLikeMissing(aPlanCustom.id, (id) =>
    createGoal(b, { exerciseId: id, targetWeightLbs: 100, targetReps: 5 }),
  );
  expect(result).toMatchObject({ ok: false, code: "validation_error" });
});

it("a goal a second account creates is its own", async () => {
  const { id } = await createGoal(b, {
    exerciseId: lib.incline.id,
    targetWeightLbs: 100,
    targetReps: 5,
  });
  expect(
    (await getTestPrisma().goal.findUniqueOrThrow({ where: { id } })).userId,
  ).toBe(b.userId);
  expect((await listActiveGoals(a)).map((g) => g.goalId)).not.toContain(id);
});
