import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import {
  setExerciseSkipped,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import { getWorkout, type ExerciseCardDto } from "@/lib/logging/queries";
import { getOccurrenceProgression } from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

/**
 * Faster Logging UX read path (spec §11.1–§11.3, §14.2; R9–R11): the card's
 * "Last time" context and its working-weight offer come only from the acting
 * account's own records, machines and cables only from the workout's gym, and
 * reading them writes nothing.
 */

let account: Account;
const db = () => getTestPrisma();

beforeEach(async () => {
  account = await defaultAccount();
});

// Mondays of the test mesocycle (start 2026-11-02, every session on Monday).
const W1 = "2026-11-02";
const W2 = "2026-11-09";
const W3 = "2026-11-16";
const W5 = "2026-11-30"; // scheduled deload week (deload every 5)

async function plan(
  equipmentType: "barbell" | "cable" | "bodyweight" = "barbell",
  name = "Barbell Bench Press",
) {
  const meso = await createTestMesocycle();
  const exercise = await createTestExercise({
    name,
    equipmentType,
    primaryMuscle: "chest",
  });
  const session = await createTestSession(meso.id, { dayOfWeek: 1 });
  await createTestSessionExercise(session.id, exercise.id, { plannedSets: 3 });
  return { meso, exercise, session };
}

async function gym(name: string) {
  return db().gym.create({ data: { userId: account.userId, name } });
}

/** Start the occurrence on `date` at `gymId` and log the given sets. */
async function train(
  sessionId: string,
  date: string,
  gymId: string,
  sets: { w: number | null; r: number }[],
): Promise<{ loggedSessionId: string; loggedExerciseId: string }> {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId,
    scheduledFor: date,
    gymId,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
  });
  for (const [i, s] of sets.entries()) {
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: i + 1,
      weightLbs: s.w,
      reps: s.r,
    });
  }
  return { loggedSessionId, loggedExerciseId: le.id };
}

async function card(loggedSessionId: string): Promise<ExerciseCardDto> {
  const w = await getWorkout(account, loggedSessionId);
  return w!.exercises[0];
}

async function ownedCounts() {
  return {
    sessions: await db().loggedSession.count(),
    exercises: await db().loggedExercise.count(),
    sets: await db().loggedSet.count(),
    baselines: await db().gymExerciseBaseline.count(),
  };
}

describe("previousPerformance", () => {
  it("free weight: last week's sets, in set order, from any gym (global rule)", async () => {
    const { session } = await plan();
    const a = await gym("Downtown Gym");
    const b = await gym("Campus Rec Center");
    await train(session.id, W1, a.id, [
      { w: 185, r: 8 },
      { w: 185, r: 8 },
      { w: 185, r: 7 },
    ]);
    const today = await train(session.id, W2, b.id, []);

    const c = await card(today.loggedSessionId);
    expect(c.previousPerformance).toEqual({
      dateIso: W1,
      gymScoped: false,
      sets: [
        { setNumber: 1, weightLbs: 185, reps: 8 },
        { setNumber: 2, weightLbs: 185, reps: 8 },
        { setNumber: 3, weightLbs: 185, reps: 7 },
      ],
    });
    expect(c.suggestedWeightLbs).toBe(185);
  });

  it("cable with history only at another gym: no last time and no weight (never cross-gym)", async () => {
    const { session, exercise } = await plan("cable", "Triceps Pushdown");
    const a = await gym("Downtown Gym");
    const b = await gym("Campus Rec Center");
    await train(session.id, W1, a.id, [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ]);
    // Downtown now has a baseline (established on completion).
    expect(
      await db().gymExerciseBaseline.count({
        where: { gymId: a.id, exerciseId: exercise.id },
      }),
    ).toBe(1);

    const atB = await train(session.id, W2, b.id, []);
    const c = await card(atB.loggedSessionId);
    expect(c.isGymVariable).toBe(true);
    expect(c.gymName).toBe("Campus Rec Center");
    expect(c.previousPerformance).toBeNull();
    expect(c.suggestedWeightLbs).toBeNull();
  });

  it("cable at its own gym: Last time here, and the gym's baseline as the working weight", async () => {
    const { session } = await plan("cable", "Triceps Pushdown");
    const a = await gym("Downtown Gym");
    await train(session.id, W1, a.id, [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ]);
    const today = await train(session.id, W2, a.id, []);
    const c = await card(today.loggedSessionId);
    expect(c.previousPerformance).toMatchObject({
      dateIso: W1,
      gymScoped: true,
    });
    expect(c.previousPerformance!.sets.map((s) => s.reps)).toEqual([
      12, 12, 11,
    ]);
    expect(c.suggestedWeightLbs).toBe(50);
  });

  it("cable at a gym with a partial (no baseline yet): that gym's latest weight, still no other gym's", async () => {
    const { session } = await plan("cable", "Triceps Pushdown");
    const a = await gym("Downtown Gym");
    const b = await gym("Campus Rec Center");
    await train(session.id, W1, a.id, [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ]);
    await train(session.id, W2, b.id, [{ w: 70, r: 10 }]); // partial: no baseline at B
    const today = await train(session.id, W3, b.id, []);
    const c = await card(today.loggedSessionId);
    expect(c.suggestedWeightLbs).toBe(70);
    expect(c.previousPerformance).toMatchObject({
      dateIso: W2,
      gymScoped: true,
    });
  });

  it("bodyweight: reps-only history with null weights and no working weight", async () => {
    const { session } = await plan("bodyweight", "Pushups");
    const a = await gym("Downtown Gym");
    await train(session.id, W1, a.id, [
      { w: null, r: 18 },
      { w: null, r: 15 },
    ]);
    const today = await train(session.id, W2, a.id, []);
    const c = await card(today.loggedSessionId);
    expect(c.requiresExternalWeight).toBe(false);
    expect(c.suggestedWeightLbs).toBeNull();
    expect(c.previousPerformance!.sets).toEqual([
      { setNumber: 1, weightLbs: null, reps: 18 },
      { setNumber: 2, weightLbs: null, reps: 15 },
    ]);
  });

  it("never returns the current workout, and ignores a later-dated one (logging a past day late)", async () => {
    const { session } = await plan();
    const a = await gym("Downtown Gym");
    await train(session.id, W1, a.id, [{ w: 175, r: 8 }]);
    await train(session.id, W3, a.id, [{ w: 195, r: 8 }]); // later week, logged first
    // Now the lifter logs week 2 late, and logs set 1 of it.
    const late = await train(session.id, W2, a.id, [{ w: 185, r: 8 }]);
    const c = await card(late.loggedSessionId);
    expect(c.previousPerformance!.dateIso).toBe(W1);
    expect(c.previousPerformance!.sets).toEqual([
      { setNumber: 1, weightLbs: 175, reps: 8 },
    ]);
  });

  it("an exercise left with no sets (skipped) is not 'last time'", async () => {
    const { session } = await plan();
    const a = await gym("Downtown Gym");
    await train(session.id, W1, a.id, [{ w: 185, r: 8 }]);
    const skipped = await train(session.id, W2, a.id, []);
    await setExerciseSkipped(account, {
      loggedExerciseId: skipped.loggedExerciseId,
      skipped: true,
    });
    const today = await train(session.id, W3, a.id, []);
    expect(
      (await card(today.loggedSessionId)).previousPerformance!.dateIso,
    ).toBe(W1);
  });

  it("after a swap, last time is the performed (substitute) exercise's", async () => {
    const { session } = await plan();
    const a = await gym("Downtown Gym");
    const dumbbell = await createTestExercise({
      name: "Dumbbell Bench Press",
      equipmentType: "dumbbell",
      primaryMuscle: "chest",
    });
    // Week 1: swapped to dumbbells, logged 70 × 10.
    const w1 = await train(session.id, W1, a.id, []);
    await swapExercise(account, {
      loggedExerciseId: w1.loggedExerciseId,
      newExerciseId: dumbbell.id,
    });
    await logSet(account, {
      loggedExerciseId: w1.loggedExerciseId,
      setNumber: 1,
      weightLbs: 70,
      reps: 10,
    });

    const w2 = await train(session.id, W2, a.id, []);
    // Planned barbell bench: its own history is empty.
    expect((await card(w2.loggedSessionId)).previousPerformance).toBeNull();
    await swapExercise(account, {
      loggedExerciseId: w2.loggedExerciseId,
      newExerciseId: dumbbell.id,
    });
    const swapped = await card(w2.loggedSessionId);
    expect(swapped.previousPerformance).toMatchObject({ dateIso: W1 });
    expect(swapped.previousPerformance!.sets[0]).toMatchObject({
      weightLbs: 70,
      reps: 10,
    });
  });

  it("saved rows carry their LoggedSet id; unsaved rows carry null", async () => {
    const { session } = await plan();
    const a = await gym("Downtown Gym");
    const today = await train(session.id, W1, a.id, [{ w: 185, r: 8 }]);
    const c = await card(today.loggedSessionId);
    const stored = await db().loggedSet.findFirstOrThrow({
      where: { loggedExerciseId: today.loggedExerciseId, setNumber: 1 },
    });
    expect(c.sets.map((s) => s.loggedSetId)).toEqual([stored.id, null, null]);
  });

  it("reading the card writes nothing", async () => {
    const { session } = await plan("cable", "Triceps Pushdown");
    const a = await gym("Downtown Gym");
    await train(session.id, W1, a.id, [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ]);
    const today = await train(session.id, W2, a.id, [{ w: 50, r: 12 }]);
    const before = await ownedCounts();
    const baseline = await db().gymExerciseBaseline.findFirstOrThrow({});
    await getWorkout(account, today.loggedSessionId);
    await getWorkout(account, today.loggedSessionId);
    expect(await ownedCounts()).toEqual(before);
    const after = await db().gymExerciseBaseline.findFirstOrThrow({});
    expect(after.weightLbs.toString()).toBe(baseline.weightLbs.toString());
    expect(after.updatedAt.getTime()).toBe(baseline.updatedAt.getTime());
  });
});

describe("working weight feeds the display-only suggestions gym-scoped (R10)", () => {
  it("a cable exercise in a scheduled-deload week at a gym with no history shows the state without a number", async () => {
    const { session } = await plan("cable", "Triceps Pushdown");
    const a = await gym("Downtown Gym");
    const b = await gym("Campus Rec Center");
    await train(session.id, W1, a.id, [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ]);
    const deloadAtB = await train(session.id, W5, b.id, []);
    const occ = await getOccurrenceProgression(
      account,
      deloadAtB.loggedExerciseId,
    );
    expect(occ!.scheduledDeloadWeek).toBe(true);
    expect(occ!.suggestion).toBeNull(); // not 90% of Downtown's 50
  });
});
