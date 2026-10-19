import { Prisma } from "@prisma/client";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { logSet, editLoggedSet } from "@/lib/logging/logged-sets";
import {
  startOrResumeWorkout,
  changeGym,
  swapExercise,
  completeWorkout,
} from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import {
  medianWeight,
  shouldCorrect,
  BASELINE_CORRECTION_THRESHOLD_PERCENT,
} from "@/lib/gyms/baselines";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Guided Workout Logging — the correctness core (Resolved Decisions 9–18,
 * 25–27, 40–48, 57). History-integrity and baseline isolation/atomicity are the
 * highest-risk invariants, so they are tested hard here.
 */

const db = () => getTestPrisma();
const D = (n: number) => new Prisma.Decimal(n);

async function makeGym(name = "Downtown Gym") {
  return db().gym.create({ data: { userId: account.userId, name } });
}

/** A one-exercise session plan. Returns the session + exercise ids. */
async function makePlan(
  opts: {
    equipment?: string;
    plannedSets?: number;
    muscle?: string;
    dayOfWeek?: number;
  } = {},
) {
  const meso = await createTestMesocycle();
  const exercise = await createTestExercise({
    name: "Chest Press Machine",
    equipmentType: (opts.equipment ?? "machine") as never,
    primaryMuscle: (opts.muscle ?? "chest") as never,
  });
  const session = await createTestSession(meso.id, {
    dayOfWeek: opts.dayOfWeek ?? 1,
  });
  await createTestSessionExercise(session.id, exercise.id, {
    plannedSets: opts.plannedSets ?? 3,
  });
  return {
    mesocycleId: meso.id,
    sessionId: session.id,
    exerciseId: exercise.id,
  };
}

async function firstLoggedExercise(loggedSessionId: string) {
  return db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
  });
}

/** Start a workout and log the given working weights (reps = 8 each). */
async function logComplete(
  sessionId: string,
  gymId: string,
  scheduledFor: string,
  weights: number[],
) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId,
    scheduledFor,
    gymId,
  });
  const le = await firstLoggedExercise(loggedSessionId);
  for (let i = 0; i < weights.length; i++) {
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: i + 1,
      weightLbs: weights[i],
      reps: 8,
    });
  }
  return { loggedSessionId, loggedExerciseId: le.id };
}

function baseline(gymId: string, exerciseId: string) {
  return db().gymExerciseBaseline.findUnique({
    where: { gymId_exerciseId: { gymId, exerciseId } },
  });
}

describe("set validation (Decision 11)", () => {
  async function started() {
    const { sessionId } = await makePlan();
    const gym = await makeGym();
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    return (await firstLoggedExercise(loggedSessionId)).id;
  }

  it.each([
    ["zero weight", 0, 8],
    ["negative weight", -5, 8],
    ["zero reps", 100, 0],
    ["negative reps", 100, -3],
    ["fractional reps", 100, 1.5],
  ])("rejects %s and persists nothing", async (_label, weightLbs, reps) => {
    const loggedExerciseId = await started();
    await expect(
      logSet(account, { loggedExerciseId, setNumber: 1, weightLbs, reps }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(await db().loggedSet.count()).toBe(0);
  });

  it("rejects an extra set until every planned set is logged (Decision 12, amended)", async () => {
    const loggedExerciseId = await started();
    await expect(
      logSet(account, {
        loggedExerciseId,
        setNumber: 4,
        weightLbs: 100,
        reps: 8,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(await db().loggedSet.count()).toBe(0);
  });
});

describe("retry idempotency and conflict (Decision 14)", () => {
  it("an identical retry returns the existing set and never duplicates", async () => {
    const { sessionId } = await makePlan();
    const gym = await makeGym();
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    const le = await firstLoggedExercise(loggedSessionId);
    const a = await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    const b = await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    expect(b.id).toBe(a.id);
    expect(await db().loggedSet.count()).toBe(1);
  });

  it("a changed value for the same set is a conflict, not an overwrite", async () => {
    const { sessionId } = await makePlan();
    const gym = await makeGym();
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    const le = await firstLoggedExercise(loggedSessionId);
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    await expect(
      logSet(account, {
        loggedExerciseId: le.id,
        setNumber: 1,
        weightLbs: 190,
        reps: 8,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("start/resume idempotency (Decision 2)", () => {
  it("resuming the same occurrence returns the same LoggedSession and never duplicates", async () => {
    const { sessionId } = await makePlan();
    const gym = await makeGym();
    const a = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    const b = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    expect(b.loggedSessionId).toBe(a.loggedSessionId);
    expect(await db().loggedSession.count()).toBe(1);
    expect(await db().loggedExercise.count()).toBe(1);
  });
});

describe("gym selection and lock (Decision 5)", () => {
  it("allows changing the gym before the first set, locks it after", async () => {
    const { sessionId } = await makePlan();
    const gymA = await makeGym("Gym A");
    const gymB = await makeGym("Gym B");
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gymA.id,
    });
    await changeGym(account, { loggedSessionId, gymId: gymB.id });
    const le = await firstLoggedExercise(loggedSessionId);
    expect(le.gymId).toBe(gymB.id);

    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    await expect(
      changeGym(account, { loggedSessionId, gymId: gymA.id }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("refuses to start at an archived gym", async () => {
    const { sessionId } = await makePlan();
    const gym = await db().gym.create({
      data: { userId: account.userId, name: "Old Gym", deletedAt: new Date() },
    });
    await expect(
      startOrResumeWorkout(account, {
        sessionId,
        scheduledFor: "2026-11-02",
        gymId: gym.id,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("exercise swap (Decisions 25–27)", () => {
  async function startedWithCandidates() {
    const { sessionId, exerciseId } = await makePlan({ muscle: "chest" });
    const gym = await makeGym();
    const sameMuscle = await createTestExercise({
      name: "Incline DB Press",
      primaryMuscle: "chest",
    });
    const otherMuscle = await createTestExercise({
      name: "Lat Pulldown",
      primaryMuscle: "back",
    });
    const archived = await createTestExercise({
      name: "Old Chest",
      primaryMuscle: "chest",
      deletedAt: new Date(),
    });
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    const le = await firstLoggedExercise(loggedSessionId);
    return { le, exerciseId, sessionId, sameMuscle, otherMuscle, archived };
  }

  it("swaps to an active same-primary-muscle exercise without touching the plan", async () => {
    const { le, exerciseId, sessionId, sameMuscle } =
      await startedWithCandidates();
    await swapExercise(account, {
      loggedExerciseId: le.id,
      newExerciseId: sameMuscle.id,
    });
    const after = await db().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
    });
    expect(after.exerciseId).toBe(sameMuscle.id); // performed changed
    expect(after.plannedExerciseId).toBe(exerciseId); // planned unchanged
    // Session template untouched.
    const slot = await db().sessionExercise.findFirstOrThrow({
      where: { sessionId },
    });
    expect(slot.exerciseId).toBe(exerciseId);
  });

  it("rejects a different primary muscle", async () => {
    const { le, otherMuscle } = await startedWithCandidates();
    await expect(
      swapExercise(account, {
        loggedExerciseId: le.id,
        newExerciseId: otherMuscle.id,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("rejects an archived candidate", async () => {
    const { le, archived } = await startedWithCandidates();
    await expect(
      swapExercise(account, {
        loggedExerciseId: le.id,
        newExerciseId: archived.id,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("is locked once a set is logged", async () => {
    const { le, sameMuscle } = await startedWithCandidates();
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    await expect(
      swapExercise(account, {
        loggedExerciseId: le.id,
        newExerciseId: sameMuscle.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });
});

describe("completion (Decisions 16–18)", () => {
  it("needs at least one logged set, then finishes even if an exercise is incomplete", async () => {
    const { sessionId } = await makePlan({ plannedSets: 3 });
    const gym = await makeGym();
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    await expect(
      completeWorkout(account, { loggedSessionId }),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
    const le = await firstLoggedExercise(loggedSessionId);
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    await completeWorkout(account, { loggedSessionId });
    const ls = await db().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    expect(ls.status).toBe("complete");
    expect(ls.completedAt).not.toBeNull();
    // Partly logged: kept as logged, not marked "not done".
    expect(
      (await db().loggedExercise.findUniqueOrThrow({ where: { id: le.id } }))
        .skippedAt,
    ).toBeNull();
  });

  it("a completed workout's sets remain editable (Decision 19)", async () => {
    const { sessionId } = await makePlan({ plannedSets: 1 });
    const gym = await makeGym();
    const { loggedSessionId, loggedExerciseId } = await logComplete(
      sessionId,
      gym.id,
      "2026-11-02",
      [100],
    );
    await completeWorkout(account, { loggedSessionId });
    const set = await db().loggedSet.findFirstOrThrow({
      where: { loggedExerciseId },
    });
    const edited = await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 105,
      reps: 7,
    });
    expect(Number(edited.weightLbs)).toBe(105);
    expect(edited.reps).toBe(7);
  });
});

describe("gym baselines — establish, correct, isolate (Decisions 42–48)", () => {
  it("first gym-variable log establishes the baseline (not a correction); other gym untouched", async () => {
    const { sessionId, exerciseId } = await makePlan({
      equipment: "machine",
      plannedSets: 3,
    });
    const gymA = await makeGym("Gym A");
    const gymB = await makeGym("Gym B");
    await logComplete(sessionId, gymA.id, "2026-11-02", [100, 100, 100]);
    expect(Number((await baseline(gymA.id, exerciseId))!.weightLbs)).toBe(100);
    expect(await baseline(gymB.id, exerciseId)).toBeNull();
  });

  it("uses the median working weight (odd and even counts)", async () => {
    const odd = await makePlan({ equipment: "machine", plannedSets: 3 });
    const gym1 = await makeGym("G1");
    await logComplete(odd.sessionId, gym1.id, "2026-11-02", [90, 100, 110]);
    expect(Number((await baseline(gym1.id, odd.exerciseId))!.weightLbs)).toBe(
      100,
    );

    const even = await makePlan({ equipment: "machine", plannedSets: 4 });
    const gym2 = await makeGym("G2");
    await logComplete(
      even.sessionId,
      gym2.id,
      "2026-11-02",
      [100, 100, 110, 110],
    );
    expect(Number((await baseline(gym2.id, even.exerciseId))!.weightLbs)).toBe(
      105,
    );
  });

  it.each([
    ["below threshold (14%)", [114, 114, 114], 100],
    ["at threshold (15%)", [115, 115, 115], 115],
    ["above threshold (20%)", [120, 120, 120], 120],
  ])("correction boundary — %s", async (_label, second, expected) => {
    const { sessionId, exerciseId } = await makePlan({
      equipment: "machine",
      plannedSets: 3,
    });
    const gym = await makeGym();
    await logComplete(sessionId, gym.id, "2026-11-02", [100, 100, 100]); // establish 100
    await logComplete(sessionId, gym.id, "2026-11-09", second);
    expect(Number((await baseline(gym.id, exerciseId))!.weightLbs)).toBe(
      expected,
    );
  });

  it("free-weight exercises create no baseline", async () => {
    const { sessionId, exerciseId } = await makePlan({
      equipment: "barbell",
      plannedSets: 3,
    });
    const gym = await makeGym();
    await logComplete(sessionId, gym.id, "2026-11-02", [225, 225, 225]);
    expect(await baseline(gym.id, exerciseId)).toBeNull();
  });

  it("a correction at Gym A never changes Gym B", async () => {
    const { sessionId, exerciseId } = await makePlan({
      equipment: "machine",
      plannedSets: 3,
    });
    const gymA = await makeGym("A");
    const gymB = await makeGym("B");
    await logComplete(sessionId, gymA.id, "2026-11-02", [100, 100, 100]);
    await logComplete(sessionId, gymB.id, "2026-11-09", [150, 150, 150]);
    expect(Number((await baseline(gymA.id, exerciseId))!.weightLbs)).toBe(100);
    expect(Number((await baseline(gymB.id, exerciseId))!.weightLbs)).toBe(150);
  });

  it("editing a historical set does not replay or change the baseline (Decisions 53/54)", async () => {
    const { sessionId, exerciseId } = await makePlan({
      equipment: "machine",
      plannedSets: 3,
    });
    const gym = await makeGym();
    const { loggedExerciseId } = await logComplete(
      sessionId,
      gym.id,
      "2026-11-02",
      [100, 100, 100],
    );
    const set = await db().loggedSet.findFirstOrThrow({
      where: { loggedExerciseId, setNumber: 1 },
    });
    await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 300,
      reps: 8,
    });
    expect(Number((await baseline(gym.id, exerciseId))!.weightLbs)).toBe(100);
  });
});

describe("baseline pure helpers", () => {
  it("medianWeight handles odd and even counts", () => {
    expect(Number(medianWeight([D(100), D(100), D(100)]))).toBe(100);
    expect(Number(medianWeight([D(90), D(100), D(110)]))).toBe(100);
    expect(Number(medianWeight([D(100), D(100), D(110), D(110)]))).toBe(105);
  });
  it("shouldCorrect fires only at/above the named threshold", () => {
    expect(BASELINE_CORRECTION_THRESHOLD_PERCENT).toBe(15);
    expect(shouldCorrect(D(114), D(100))).toBe(false);
    expect(shouldCorrect(D(115), D(100))).toBe(true);
    expect(shouldCorrect(D(85), D(100))).toBe(true); // 15% below also corrects
    expect(shouldCorrect(D(86), D(100))).toBe(false);
  });
});

describe("missed-day resolution is immutable (Decision 33)", () => {
  it("records one resolution per day and rejects a second", async () => {
    const meso = await createTestMesocycle();
    await createTestSession(meso.id, { dayOfWeek: 1 });
    await resolveMissedDay(account, {
      mesocycleId: meso.id,
      missedOn: "2026-11-02",
      outcome: "skipped",
    });
    expect(await db().missedDayResolution.count()).toBe(1);
    await expect(
      resolveMissedDay(account, {
        mesocycleId: meso.id,
        missedOn: "2026-11-02",
        outcome: "shifted",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("links the resolution to the planned session for that weekday", async () => {
    const meso = await createTestMesocycle();
    const session = await createTestSession(meso.id, { dayOfWeek: 1 }); // Monday
    // 2026-11-02 is a Monday.
    await resolveMissedDay(account, {
      mesocycleId: meso.id,
      missedOn: "2026-11-02",
      outcome: "skipped",
    });
    const row = await db().missedDayResolution.findFirstOrThrow({
      where: { mesocycleId: meso.id },
    });
    expect(row.sessionId).toBe(session.id);
    expect(row.outcome).toBe("skipped");
  });
});
