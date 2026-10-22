import { Prisma } from "@prisma/client";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import {
  currentWorkingWeightLbs,
  getLoggedWorkoutDetail,
  getWorkout,
} from "@/lib/logging/queries";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getQualifyingSessionE1rms,
} from "@/lib/progression/queries";
import { createGoal } from "@/lib/goals/goals";
import { getGoalFormContext } from "@/lib/goals/queries";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Bodyweight logging: a pure bodyweight exercise (equipment `bodyweight`) logs
 * reps only. Its external weight is stored as NULL — never 0 or a fake number —
 * and nothing downstream (e1RM, +5 lb suggestion, gym baseline, goal progress)
 * pretends a load exists. External-load exercises are unchanged.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deload every 5 weeks.
 *   week 1 = 11/02, week 2 = 11/09, week 3 = 11/16, week 5 = 11/30 (deload).
 */
const db = () => getTestPrisma();

async function makePlan(opts: {
  name: string;
  equipment: string;
  plannedSets?: number;
  repMin?: number;
  repMax?: number;
}) {
  const meso = await createTestMesocycle();
  const exercise = await createTestExercise({
    name: opts.name,
    equipmentType: opts.equipment as never,
    primaryMuscle: "back",
  });
  const session = await createTestSession(meso.id, {
    name: "Pull Day 1",
    dayOfWeek: 1,
  });
  await createTestSessionExercise(session.id, exercise.id, {
    plannedSets: opts.plannedSets ?? 2,
    targetRepMin: opts.repMin ?? 6,
    targetRepMax: opts.repMax ?? 12,
  });
  const gym = await db().gym.create({
    data: { userId: account.userId, name: "Downtown Gym" },
  });
  return { sessionId: session.id, exerciseId: exercise.id, gymId: gym.id };
}

async function start(
  plan: { sessionId: string; gymId: string },
  scheduledFor: string,
) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: plan.sessionId,
    scheduledFor,
    gymId: plan.gymId,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
  return { loggedSessionId, loggedExerciseId: le.id };
}

/** One complete pull-up session: every planned set reps-only, then finish. */
async function pullUpSession(
  plan: { sessionId: string; gymId: string },
  scheduledFor: string,
  reps: number[],
) {
  const w = await start(plan, scheduledFor);
  for (let i = 0; i < reps.length; i++) {
    await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: i + 1,
      reps: reps[i],
    });
  }
  await completeWorkout(account, { loggedSessionId: w.loggedSessionId });
  return w;
}

const PULL_UPS = { name: "Wide-Grip Pull-Ups", equipment: "bodyweight" };

describe("bodyweight set validation and storage", () => {
  it("persists a Wide-Grip Pull-Up set with reps only — weight is NULL, not 0 or 1", async () => {
    const plan = await makePlan(PULL_UPS);
    const { loggedExerciseId } = await start(plan, "2026-11-02");

    const set = await logSet(account, {
      loggedExerciseId,
      setNumber: 1,
      reps: 15,
    });

    expect(set.weightLbs).toBeNull();
    expect(set.reps).toBe(15);
    const raw = await db().$queryRaw<{ weight_lbs: unknown }[]>`
      SELECT weight_lbs FROM logged_sets WHERE id = ${set.id}::uuid`;
    expect(raw[0].weight_lbs).toBeNull();
  });

  it("accepts an explicit null weight the same as an omitted one", async () => {
    const plan = await makePlan(PULL_UPS);
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    const set = await logSet(account, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: null,
      reps: 15,
    });
    expect(set.weightLbs).toBeNull();
  });

  it.each([
    ["zero reps", 0],
    ["negative reps", -1],
    ["fractional reps", 7.5],
  ])("rejects %s and persists nothing", async (_l, reps) => {
    const plan = await makePlan(PULL_UPS);
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    await expect(
      logSet(account, { loggedExerciseId, setNumber: 1, reps }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(await db().loggedSet.count()).toBe(0);
  });

  it.each([
    ["a fake 0 lb", 0],
    ["a fake 1 lb", 1],
    ["a guessed bodyweight", 180],
  ])(
    "rejects %s on a bodyweight exercise (no silent load)",
    async (_l, weightLbs) => {
      const plan = await makePlan(PULL_UPS);
      const { loggedExerciseId } = await start(plan, "2026-11-02");
      await expect(
        logSet(account, {
          loggedExerciseId,
          setNumber: 1,
          weightLbs,
          reps: 15,
        }),
      ).rejects.toMatchObject({
        code: "validation_error",
        details: { weightLbs: expect.any(String) },
      });
      expect(await db().loggedSet.count()).toBe(0);
    },
  );

  it("an identical reps-only retry is idempotent; a different one conflicts", async () => {
    const plan = await makePlan(PULL_UPS);
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    const first = await logSet(account, {
      loggedExerciseId,
      setNumber: 1,
      reps: 15,
    });
    const again = await logSet(account, {
      loggedExerciseId,
      setNumber: 1,
      reps: 15,
    });
    expect(again.id).toBe(first.id);
    await expect(
      logSet(account, { loggedExerciseId, setNumber: 1, reps: 14 }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await db().loggedSet.count()).toBe(1);
  });

  it("the database refuses a stored 0 weight even outside the write module", async () => {
    const plan = await makePlan(PULL_UPS);
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    await expect(
      db().loggedSet.create({
        data: {
          userId: account.userId,
          loggedExerciseId,
          setNumber: 1,
          weightLbs: 0,
          reps: 15,
        },
      }),
    ).rejects.toThrow(/logged_sets_weight_positive_or_null/);
  });
});

describe("external-load validation is unchanged", () => {
  const BENCH = { name: "Barbell Bench Press", equipment: "barbell" };

  it.each([
    ["missing weight", undefined],
    ["null weight", null],
    ["zero weight", 0],
    ["negative weight", -5],
  ])("rejects %s", async (_l, weightLbs) => {
    const plan = await makePlan(BENCH);
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    await expect(
      logSet(account, { loggedExerciseId, setNumber: 1, weightLbs, reps: 8 }),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: { weightLbs: "Enter a weight above 0." },
    });
    expect(await db().loggedSet.count()).toBe(0);
  });

  it("stores a positive weight + reps exactly as entered", async () => {
    const plan = await makePlan(BENCH);
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    const set = await logSet(account, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    expect(set.weightLbs?.equals(new Prisma.Decimal(185))).toBe(true);
    expect(set.reps).toBe(8);
  });

  it("a separate Weighted Pull Ups exercise (equipment `other`) still requires external weight", async () => {
    const plan = await makePlan({
      name: "Weighted Pull Ups",
      equipment: "other",
    });
    const { loggedExerciseId } = await start(plan, "2026-11-02");
    await expect(
      logSet(account, { loggedExerciseId, setNumber: 1, reps: 8 }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const set = await logSet(account, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 25,
      reps: 8,
    });
    expect(Number(set.weightLbs)).toBe(25);
  });

  it("weighted variants keep normal weighted progression (+5 lb, e1RM)", async () => {
    const plan = await makePlan({
      name: "Weighted Pull Ups",
      equipment: "other",
    });
    for (const date of ["2026-11-02", "2026-11-09"]) {
      const w = await start(plan, date);
      for (const n of [1, 2]) {
        await logSet(account, {
          loggedExerciseId: w.loggedExerciseId,
          setNumber: n,
          weightLbs: 25,
          reps: 12,
        });
      }
      await completeWorkout(account, { loggedSessionId: w.loggedSessionId });
    }
    const dto = (await getExerciseProgression(account, plan.exerciseId))!;
    expect(dto.requiresExternalWeight).toBe(true);
    expect(dto.tag).toBe("progress");
    expect(dto.suggestion).toEqual({ lbs: 30, kind: "progress_increment" });
    expect(dto.points).toHaveLength(2);
    expect(dto.currentE1rm).toBe(35); // 25 × (1 + 12/30)
  });
});

describe("bodyweight progression: rep-range rule, no load math", () => {
  it("2×6–12: one qualifying session is insufficient history — no tag", async () => {
    const plan = await makePlan(PULL_UPS);
    const w = await pullUpSession(plan, "2026-11-02", [15, 15]);

    const dto = (await getExerciseProgression(account, plan.exerciseId))!;
    expect(dto.state).toBe("insufficient");
    expect(dto.tag).toBeNull();
    const occ = (await getOccurrenceProgression(account, w.loggedExerciseId))!;
    expect(occ.tag).toBeNull();
  });

  it("2×6–12: two sessions at/above the top progress — with no +5 lb and no e1RM", async () => {
    const plan = await makePlan(PULL_UPS);
    await pullUpSession(plan, "2026-11-02", [15, 15]);
    const w2 = await pullUpSession(plan, "2026-11-09", [15, 15]);

    const dto = (await getExerciseProgression(account, plan.exerciseId))!;
    expect(dto.requiresExternalWeight).toBe(false);
    expect(dto.state).toBe("progress");
    expect(dto.tag).toBe("progress");
    expect(dto.suggestion).toBeNull(); // never "+5 lb"
    expect(dto.points).toEqual([]); // no fake e1RM point
    expect(dto.currentE1rm).toBeNull();

    const occ = (await getOccurrenceProgression(account, w2.loggedExerciseId))!;
    expect(occ.tag).toBe("progress");
    expect(occ.suggestion).toBeNull();
    // No trend line exists for reps-only lifts, but their history page does
    // (Exercise History & PR Intelligence R4): the card links to it.
    expect(occ.historyHref).toBe(`/exercises/${plan.exerciseId}`);

    expect(
      await getQualifyingSessionE1rms(account, plan.exerciseId, null),
    ).toEqual([]);
  });

  it("a third all-top session still progresses (no e1RM stall gate on a missing weight)", async () => {
    const plan = await makePlan(PULL_UPS);
    await pullUpSession(plan, "2026-11-02", [15, 15]);
    await pullUpSession(plan, "2026-11-09", [15, 15]);
    await pullUpSession(plan, "2026-11-16", [15, 15]);
    const dto = (await getExerciseProgression(account, plan.exerciseId))!;
    expect(dto.tag).toBe("progress"); // not "stalled" from 0 → 0
  });

  it("repeated below-range sessions still reach a reactive Deload", async () => {
    const plan = await makePlan(PULL_UPS);
    await pullUpSession(plan, "2026-11-02", [5, 4]);
    await pullUpSession(plan, "2026-11-09", [5, 4]);
    const dto = (await getExerciseProgression(account, plan.exerciseId))!;
    expect(dto.tag).toBe("deload");
    expect(dto.suggestion).toBeNull();
  });

  it("a scheduled-deload week shows the state with no 90% number", async () => {
    const plan = await makePlan(PULL_UPS);
    await pullUpSession(plan, "2026-11-02", [15, 15]);
    const w = await start(plan, "2026-11-30"); // week 5 = scheduled deload
    const occ = (await getOccurrenceProgression(account, w.loggedExerciseId))!;
    expect(occ.scheduledDeloadWeek).toBe(true);
    expect(occ.tag).toBeNull();
    expect(occ.suggestion).toBeNull();
  });
});

describe("bodyweight logging never touches gym baselines", () => {
  it("a complete bodyweight exercise at a gym creates no GymExerciseBaseline", async () => {
    const plan = await makePlan(PULL_UPS);
    await pullUpSession(plan, "2026-11-02", [15, 15]);
    expect(await db().gymExerciseBaseline.count()).toBe(0);
  });

  it("leaves an existing baseline row for that exercise untouched", async () => {
    // Defensive: even a stray pre-existing row is never read or rewritten.
    const plan = await makePlan(PULL_UPS);
    const before = await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: plan.gymId,
        exerciseId: plan.exerciseId,
        weightLbs: 50,
      },
    });
    await pullUpSession(plan, "2026-11-02", [15, 15]);
    const after = await db().gymExerciseBaseline.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.weightLbs.equals(before.weightLbs)).toBe(true);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});

describe("bodyweight reads and history render truthfully", () => {
  it("the logging card has no weight requirement or 'last weight' for pull-ups", async () => {
    const plan = await makePlan(PULL_UPS);
    const w = await start(plan, "2026-11-02");
    await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      reps: 15,
    });

    const workout = (await getWorkout(account, w.loggedSessionId))!;
    const card = workout.exercises[0];
    expect(card.requiresExternalWeight).toBe(false);
    expect(card.suggestedWeightLbs).toBeNull();
    expect(card.sets[0]).toMatchObject({
      setNumber: 1,
      weightLbs: null,
      reps: 15,
      saved: true,
    });
    expect(
      await currentWorkingWeightLbs(
        account,
        plan.exerciseId,
        plan.gymId,
        false,
      ),
    ).toBeNull(); // a NULL set is never read back as 0
  });

  it("history detail shows a null weight (never 0) and edits reps only", async () => {
    const plan = await makePlan(PULL_UPS);
    const w = await pullUpSession(plan, "2026-11-02", [15, 15]);

    const detail = (await getLoggedWorkoutDetail(account, w.loggedSessionId))!;
    const ex = detail.exercises[0];
    expect(ex.requiresExternalWeight).toBe(false);
    expect(ex.sets.map((s) => [s.weightLbs, s.reps])).toEqual([
      [null, 15],
      [null, 15],
    ]);

    const edited = await editLoggedSet(account, {
      loggedSetId: ex.sets[0].loggedSetId,
      reps: 14,
    });
    expect(edited.weightLbs).toBeNull();
    expect(edited.reps).toBe(14);
    await expect(
      editLoggedSet(account, {
        loggedSetId: ex.sets[0].loggedSetId,
        weightLbs: 0,
        reps: 14,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("an external-load correction still requires a positive weight", async () => {
    const plan = await makePlan({
      name: "Barbell Bench Press",
      equipment: "barbell",
    });
    const w = await start(plan, "2026-11-02");
    const set = await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    await expect(
      editLoggedSet(account, { loggedSetId: set.id, reps: 8 }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const unchanged = await db().loggedSet.findUniqueOrThrow({
      where: { id: set.id },
    });
    expect(Number(unchanged.weightLbs)).toBe(185);
  });
});

describe("goals: bodyweight lifts have no valid goal math", () => {
  it("refuses a new goal on a bodyweight exercise and the form says why", async () => {
    const plan = await makePlan(PULL_UPS);
    await expect(
      createGoal(account, {
        exerciseId: plan.exerciseId,
        targetWeightLbs: "10",
        targetReps: "15",
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: { exerciseId: expect.stringMatching(/external weight/) },
    });
    expect(await db().goal.count()).toBe(0);

    const ctx = await getGoalFormContext(account, plan.exerciseId);
    expect(ctx).toEqual({
      kind: "bodyweight_unsupported",
      exerciseName: "Wide-Grip Pull-Ups",
    });
  });
});
