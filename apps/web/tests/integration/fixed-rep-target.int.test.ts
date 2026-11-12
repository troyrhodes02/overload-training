import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { getWorkout } from "@/lib/logging/queries";
import { getSessionDetail } from "@/lib/plan/queries";
import { addSessionExercise, updateSessionExercise } from "@/lib/plan/sessions";
import { formatRepTarget } from "@/lib/plan/rep-target";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestSession,
  createActiveTestMesocycle,
} from "./support/plan-factories";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

/**
 * Workout Logging Refinements — a single rep target plans and logs as one
 * number (spec §3.2, §13; RD-7). It is stored as a range with equal ends
 * through the unchanged plan writers, and the workout snapshot preserves it.
 */
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});
const db = () => getTestPrisma();

describe("3 × 10 through the plan and the workout", () => {
  it("adds, edits, snapshots, and prints a fixed target", async () => {
    const meso = await createActiveTestMesocycle();
    const session = await createTestSession(meso.id, { dayOfWeek: 1 });
    const crunch = await createTestExercise({
      name: "Cable Crunch",
      equipmentType: "cable",
      primaryMuscle: "core",
    });

    const added = await addSessionExercise(account, {
      sessionId: session.id,
      exerciseId: crunch.id,
      plannedSets: "3",
      targetRepMin: "10",
      targetRepMax: "10",
    });
    const slot = await db().sessionExercise.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(slot).toMatchObject({
      plannedSets: 3,
      targetRepMin: 10,
      targetRepMax: 10,
    });
    expect(added).toBeTruthy();

    // A range edited to a fixed target, and back, through the same writer.
    await updateSessionExercise(account, {
      sessionExerciseId: slot.id,
      plannedSets: "3",
      targetRepMin: "8",
      targetRepMax: "12",
    });
    await updateSessionExercise(account, {
      sessionExerciseId: slot.id,
      plannedSets: "3",
      targetRepMin: "10",
      targetRepMax: "10",
    });
    const detail = await getSessionDetail(account, meso.id, session.id);
    const planned = detail!.exercises.find((e) => e.exerciseId === crunch.id)!;
    expect(formatRepTarget(planned.targetRepMin, planned.targetRepMax)).toBe(
      "10",
    );

    const gym = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId: session.id,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    const workout = await getWorkout(account, loggedSessionId);
    const card = workout!.exercises.find(
      (e) => e.performedExerciseId === crunch.id,
    )!;
    expect(card.plannedRepRange).toEqual({ min: 10, max: 10 });
    expect(
      formatRepTarget(card.plannedRepRange.min, card.plannedRepRange.max),
    ).toBe("10");
  });
});
