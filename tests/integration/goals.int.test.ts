import { Prisma } from "@prisma/client";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import { completeWorkout } from "@/lib/logging/sessions";
import {
  acknowledgeGoalCompletion,
  archiveGoal,
  createGoal,
  reconcileGoalCompletions,
} from "@/lib/goals/goals";
import {
  getGoalDetail,
  getGoalFormContext,
  getSessionGoalSummary,
  listActiveGoals,
  listGoalHistory,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Goals (OVE-30). Logged history is inserted raw (test-only) to control dates,
 * gyms, completion, and rep ranges precisely — application code writes logged
 * history only through src/lib/logging/*. Goal rows are written ONLY through
 * src/lib/goals/goals.ts, except where a test deliberately bypasses it to prove
 * a database constraint.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5 →
 * week 5 = 11/30 – 12/06 is a SCHEDULED DELOAD week.
 */
const db = () => getTestPrisma();

async function logPerf(opts: {
  mesocycleId: string;
  exerciseId: string;
  plannedExerciseId?: string;
  gymId?: string | null;
  scheduledFor: string;
  plannedSets?: number;
  reps: number[];
  weights: number[];
  status?: "in_progress" | "complete";
}) {
  const p = db();
  const ls = await p.loggedSession.create({
    data: {
      userId: account.userId,
      mesocycleId: opts.mesocycleId,
      performedOn: new Date(`${opts.scheduledFor}T12:00:00Z`),
      scheduledFor: new Date(`${opts.scheduledFor}T00:00:00Z`),
      status: opts.status ?? "complete",
      completedAt:
        (opts.status ?? "complete") === "complete"
          ? new Date(`${opts.scheduledFor}T13:00:00Z`)
          : null,
    },
  });
  const le = await p.loggedExercise.create({
    data: {
      userId: account.userId,
      loggedSessionId: ls.id,
      exerciseId: opts.exerciseId,
      plannedExerciseId: opts.plannedExerciseId ?? opts.exerciseId,
      gymId: opts.gymId ?? null,
      plannedSets: opts.plannedSets ?? opts.reps.length,
      targetRepMin: 3,
      targetRepMax: 8,
    },
  });
  const setIds: string[] = [];
  for (let i = 0; i < opts.reps.length; i++) {
    const s = await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: opts.weights[i],
        reps: opts.reps[i],
      },
    });
    setIds.push(s.id);
  }
  return { loggedSessionId: ls.id, loggedExerciseId: le.id, setIds };
}

async function expectDomainError(
  p: Promise<unknown>,
  code: string,
  details?: Record<string, string>,
) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    if (details) expect((e as DomainError).details).toMatchObject(details);
    return e as DomainError;
  }
  throw new Error(`expected DomainError ${code}`);
}

async function setup() {
  const meso = await createTestMesocycle({ status: "active" });
  const bench = await createTestExercise({
    name: "Barbell Bench Press",
    equipmentType: "barbell",
  });
  const chestPress = await createTestExercise({
    name: "Chest Press Machine",
    equipmentType: "machine",
  });
  const downtown = await db().gym.create({
    data: { userId: account.userId, name: "Downtown Gym" },
  });
  const campus = await db().gym.create({
    data: { userId: account.userId, name: "Campus Rec Center" },
  });
  return { meso, bench, chestPress, downtown, campus };
}

async function historySnapshot() {
  const sets = await db().loggedSet.findMany({
    orderBy: { id: "asc" },
    select: { id: true, weightLbs: true, reps: true, updatedAt: true },
  });
  const baselines = await db().gymExerciseBaseline.findMany({
    orderBy: { id: "asc" },
  });
  return JSON.stringify({ sets, baselines });
}

describe("goal creation", () => {
  it("creates a free-weight goal with no gym and an active status", async () => {
    const { bench } = await setup();
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: "315",
      targetReps: "1",
    });
    expect(r.outcome).toBe("active");
    const g = await db().goal.findUniqueOrThrow({ where: { id: r.id } });
    expect(g.status).toBe("active");
    expect(g.gymId).toBeNull();
    expect(Number(g.targetWeightLbs)).toBe(315);
    expect(g.targetReps).toBe(1);
    expect(g.archiveReason).toBeNull();
    expect(g.archivedAt).toBeNull();
  });

  it("rejects a gym on a gym-consistent exercise", async () => {
    const { bench, downtown } = await setup();
    await expectDomainError(
      createGoal(account, {
        exerciseId: bench.id,
        gymId: downtown.id,
        targetWeightLbs: "315",
        targetReps: "1",
      }),
      "validation_error",
      { gymId: "This lift isn't measured per gym." },
    );
  });

  it("requires an active gym for a machine/cable exercise", async () => {
    const { chestPress, downtown } = await setup();
    await expectDomainError(
      createGoal(account, {
        exerciseId: chestPress.id,
        targetWeightLbs: "200",
        targetReps: "10",
      }),
      "validation_error",
      { gymId: "Choose the gym this goal is measured at." },
    );
    await db().gym.update({
      where: { id: downtown.id },
      data: { deletedAt: new Date() },
    });
    await expectDomainError(
      createGoal(account, {
        exerciseId: chestPress.id,
        gymId: downtown.id,
        targetWeightLbs: "200",
        targetReps: "10",
      }),
      "validation_error",
      { gymId: "That gym is archived. Choose an active gym." },
    );
    expect(await db().goal.count()).toBe(0);
  });

  it("creates a machine goal scoped to its gym", async () => {
    const { chestPress, downtown } = await setup();
    const r = await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: "200",
      targetReps: "10",
    });
    const g = await db().goal.findUniqueOrThrow({ where: { id: r.id } });
    expect(g.gymId).toBe(downtown.id);
  });

  it("rejects an archived exercise and an unknown exercise", async () => {
    const { bench } = await setup();
    await db().exercise.update({
      where: { id: bench.id },
      data: { deletedAt: new Date() },
    });
    await expectDomainError(
      createGoal(account, {
        exerciseId: bench.id,
        targetWeightLbs: "315",
        targetReps: "1",
      }),
      "validation_error",
      { exerciseId: "Pick an active exercise." },
    );
    await expectDomainError(
      createGoal(account, {
        exerciseId: "3f2c1d1e-8a7b-4c6d-9e0f-112233445566",
        targetWeightLbs: "315",
        targetReps: "1",
      }),
      "validation_error",
    );
  });

  it.each([
    ["missing weight", { targetWeightLbs: "", targetReps: "1" }],
    ["zero weight", { targetWeightLbs: "0", targetReps: "1" }],
    ["negative weight", { targetWeightLbs: "-10", targetReps: "1" }],
    ["missing reps", { targetWeightLbs: "315", targetReps: "" }],
    ["zero reps", { targetWeightLbs: "315", targetReps: "0" }],
    ["negative reps", { targetWeightLbs: "315", targetReps: "-3" }],
    ["non-whole reps", { targetWeightLbs: "315", targetReps: "2.5" }],
  ])("rejects %s and writes nothing", async (_label, fields) => {
    const { bench } = await setup();
    await expectDomainError(
      createGoal(account, { exerciseId: bench.id, ...fields }),
      "validation_error",
    );
    expect(await db().goal.count()).toBe(0);
  });

  it("custom exercises (no image) are eligible", async () => {
    const { meso } = await setup();
    void meso;
    const custom = await createTestExercise({
      name: "Incline Press (Smith)",
      equipmentType: "plate_loaded",
      isCustom: true,
      imageRef: null,
    });
    const r = await createGoal(account, {
      exerciseId: custom.id,
      targetWeightLbs: "225",
      targetReps: "5",
    });
    expect(r.outcome).toBe("active");
  });
});

describe("one active goal per exercise (R6, R7, R18)", () => {
  it("blocks a second active goal on the same exercise — never replaces it", async () => {
    const { bench } = await setup();
    const first = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: "315",
      targetReps: "1",
    });
    await expectDomainError(
      createGoal(account, {
        exerciseId: bench.id,
        targetWeightLbs: "225",
        targetReps: "12",
      }),
      "conflict",
      { existingGoalId: first.id },
    );
    const goals = await db().goal.findMany();
    expect(goals).toHaveLength(1);
    expect(goals[0].status).toBe("active");
    expect(goals[0].targetReps).toBe(1);
  });

  it("blocks a second active machine goal even at a different gym", async () => {
    const { chestPress, downtown, campus } = await setup();
    await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: "200",
      targetReps: "10",
    });
    await expectDomainError(
      createGoal(account, {
        exerciseId: chestPress.id,
        gymId: campus.id,
        targetWeightLbs: "180",
        targetReps: "10",
      }),
      "conflict",
    );
  });

  it("goals on different exercises coexist", async () => {
    const { bench, chestPress, downtown } = await setup();
    const squat = await createTestExercise({
      name: "Hack Squat",
      equipmentType: "barbell",
    });
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await createGoal(account, {
      exerciseId: squat.id,
      targetWeightLbs: 365,
      targetReps: 5,
    });
    await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 200,
      targetReps: 10,
    });
    expect((await listActiveGoals(account)).map((g) => g.exerciseName)).toEqual(
      ["Barbell Bench Press", "Hack Squat", "Chest Press Machine"],
    );
  });

  it("the database itself rejects a second active row (partial unique index)", async () => {
    const { bench } = await setup();
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await expect(
      db().goal.create({
        data: {
          userId: account.userId,
          exerciseId: bench.id,
          targetWeightLbs: 300,
          targetReps: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("database constraints on the goal lifecycle", () => {
  it("rejects inconsistent lifecycle, non-positive targets, and acks on non-completed goals", async () => {
    const { bench } = await setup();
    const bad: Omit<Prisma.GoalUncheckedCreateInput, "userId">[] = [
      { exerciseId: bench.id, targetWeightLbs: 0, targetReps: 1 },
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 0 },
      {
        exerciseId: bench.id,
        targetWeightLbs: 315,
        targetReps: 1,
        status: "archived",
      },
      {
        exerciseId: bench.id,
        targetWeightLbs: 315,
        targetReps: 1,
        archiveReason: "manual",
        archivedAt: new Date(),
      },
      {
        exerciseId: bench.id,
        targetWeightLbs: 315,
        targetReps: 1,
        status: "archived",
        archiveReason: "manual",
        archivedAt: new Date(),
        completionAcknowledgedAt: new Date(),
      },
    ];
    for (const data of bad) {
      // Owned rows, so only the lifecycle/target CHECK can be what rejects them.
      await expect(
        db().goal.create({ data: { ...data, userId: account.userId } }),
      ).rejects.toThrow();
    }
    expect(await db().goal.count()).toBe(0);
  });
});

describe("manual archive (R9, R37, R38)", () => {
  it("archives as manual, keeps the record, and frees the exercise", async () => {
    const { bench } = await setup();
    const first = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await archiveGoal(account, { goalId: first.id });
    const g = await db().goal.findUniqueOrThrow({ where: { id: first.id } });
    expect(g.status).toBe("archived");
    expect(g.archiveReason).toBe("manual");
    expect(g.archivedAt).not.toBeNull();

    const second = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 225,
      targetReps: 12,
    });
    expect(second.outcome).toBe("active");
    expect(await db().goal.count()).toBe(2);
    expect((await listGoalHistory(account)).map((h) => h.goalId)).toEqual([
      first.id,
    ]);
  });

  it("archiving twice is an invalid transition; unknown goals are not found", async () => {
    const { bench } = await setup();
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await archiveGoal(account, { goalId: r.id });
    await expectDomainError(
      archiveGoal(account, { goalId: r.id }),
      "invalid_state_transition",
    );
    await expectDomainError(
      archiveGoal(account, { goalId: "3f2c1d1e-8a7b-4c6d-9e0f-112233445566" }),
      "not_found",
    );
  });
});

describe("goal progress — scope and current best (R13–R20)", () => {
  it("free-weight best spans gyms and uses the max, not the latest", async () => {
    const { meso, bench, downtown, campus } = await setup();
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      reps: [5, 5, 5],
      weights: [225, 225, 235], // best set 235 × 5 = 274.17
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      gymId: campus.id,
      scheduledFor: "2026-11-09",
      reps: [5, 5, 5],
      weights: [215, 215, 215], // weaker, newer, other gym
    });
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    const [g] = await listActiveGoals(account);
    expect(g.goalId).toBe(r.id);
    expect(g.percent).toBe(87);
    expect(g.best).toMatchObject({
      weightLbs: 235,
      reps: 5,
      dateIso: "2026-11-02",
      e1rm: 274,
    });
    expect(g.targetE1rm).toBe(315);
  });

  it("history from before the goal existed counts immediately — no start-date filter", async () => {
    const { meso, bench } = await setup();
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [5],
      weights: [235],
    });
    const r = await createGoal(
      account,
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
      new Date("2027-03-01T00:00:00Z"),
    );
    const detail = await getGoalDetail(account, r.id);
    expect(detail?.kind === "active" && detail.percent).toBe(87);
  });

  it("machine progress uses only the goal's gym; another gym's heavier history is ignored", async () => {
    const { meso, chestPress, downtown, campus } = await setup();
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: chestPress.id,
      gymId: campus.id,
      scheduledFor: "2026-11-02",
      reps: [10, 10],
      weights: [250, 250], // would exceed the goal if compared across gyms
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: downtown.id,
        exerciseId: chestPress.id,
        weightLbs: 300,
      },
    });
    const r = await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 200,
      targetReps: 10,
    });
    expect(r.outcome).toBe("active"); // baseline and other-gym history are not evidence
    let [g] = await listActiveGoals(account);
    expect(g.percent).toBeNull();
    expect(g.best).toBeNull();

    await logPerf({
      mesocycleId: meso.id,
      exerciseId: chestPress.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-09",
      reps: [10, 10],
      weights: [170, 180], // 180 × 10 = 240 / 266.67 = 90%
    });
    [g] = await listActiveGoals(account);
    expect(g.percent).toBe(90);
    expect(g.gymName).toBe("Downtown Gym");
  });

  it("a goal with no qualifying history is unmeasured, never 0%", async () => {
    const { bench } = await setup();
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    const [g] = await listActiveGoals(account);
    expect(g.percent).toBeNull();
    expect(g.best).toBeNull();
  });

  it("incomplete, in-progress, and scheduled-deload performances do not count", async () => {
    const { meso, bench } = await setup();
    // Partial: 2 of 3 planned sets.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      plannedSets: 3,
      reps: [5, 5],
      weights: [300, 300],
    });
    // Session still in progress.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      reps: [5],
      weights: [300],
      status: "in_progress",
    });
    // Scheduled-deload week 5 (11/30).
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-30",
      reps: [5],
      weights: [300],
    });
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    expect(r.outcome).toBe("active");
    const [g] = await listActiveGoals(account);
    expect(g.percent).toBeNull();
  });

  it("a swapped performance counts toward the performed exercise only", async () => {
    const { meso, bench } = await setup();
    const incline = await createTestExercise({
      name: "Incline Dumbbell Press",
      equipmentType: "dumbbell",
    });
    // Planned bench, performed incline.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: incline.id,
      plannedExerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [10],
      weights: [85],
    });
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await createGoal(account, {
      exerciseId: incline.id,
      targetWeightLbs: 100,
      targetReps: 10,
    });
    const goals = await listActiveGoals(account);
    expect(goals.find((g) => g.exerciseId === bench.id)?.percent).toBeNull();
    expect(goals.find((g) => g.exerciseId === incline.id)?.percent).toBe(85);
  });
});

describe("completion (R25–R29)", () => {
  it("a goal existing history already meets completes immediately at creation", async () => {
    const { meso, bench } = await setup();
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1],
      weights: [320],
    });
    const now = new Date("2026-11-20T10:00:00Z");
    const r = await createGoal(
      account,
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
      now,
    );
    expect(r.outcome).toBe("completed");
    const g = await db().goal.findUniqueOrThrow({ where: { id: r.id } });
    expect(g.status).toBe("archived");
    expect(g.archiveReason).toBe("completed");
    expect(g.archivedAt?.getTime()).toBe(now.getTime());
    expect(g.createdAt.getTime()).toBe(now.getTime());
    expect(await listActiveGoals(account)).toEqual([]);
    const [reached] = await listUnacknowledgedCompletions(account);
    expect(reached).toMatchObject({ goalId: r.id, alreadyReached: true });
    // The slot is free again.
    const next = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 335,
      targetReps: 1,
    });
    expect(next.outcome).toBe("active");
  });

  it("an exact-target performance completes; one below stays active", async () => {
    const { meso, bench } = await setup();
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1],
      weights: [310],
    });
    expect(await reconcileGoalCompletions(account)).toEqual([]);
    expect(
      (await db().goal.findUniqueOrThrow({ where: { id: r.id } })).status,
    ).toBe("active");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      reps: [1],
      weights: [315],
    });
    expect(await reconcileGoalCompletions(account)).toEqual([r.id]);
    const g = await db().goal.findUniqueOrThrow({ where: { id: r.id } });
    expect(g.status).toBe("archived");
    expect(g.archiveReason).toBe("completed");
  });

  it("reconciliation is idempotent: one transition, archivedAt written once", async () => {
    const { meso, bench } = await setup();
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 155,
      targetReps: 8,
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [7],
      weights: [160],
    });
    const t1 = new Date("2026-11-02T14:00:00Z");
    const t2 = new Date("2026-11-03T14:00:00Z");
    expect(await reconcileGoalCompletions(account, { now: t1 })).toEqual([
      r.id,
    ]);
    expect(await reconcileGoalCompletions(account, { now: t2 })).toEqual([]);
    const [a, b] = await Promise.all([
      reconcileGoalCompletions(account, { now: t2 }),
      reconcileGoalCompletions(account, { now: t2 }),
    ]);
    expect([...a, ...b]).toEqual([]);
    const g = await db().goal.findUniqueOrThrow({ where: { id: r.id } });
    expect(g.archivedAt?.getTime()).toBe(t1.getTime());
    expect(await db().goal.count()).toBe(1);
  });

  it("acknowledgement is recorded once and only for completed goals", async () => {
    const { meso, bench } = await setup();
    const active = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 400,
      targetReps: 1,
    });
    await expectDomainError(
      acknowledgeGoalCompletion(account, { goalId: active.id }),
      "invalid_state_transition",
    );
    await archiveGoal(account, { goalId: active.id });
    await expectDomainError(
      acknowledgeGoalCompletion(account, { goalId: active.id }),
      "invalid_state_transition",
    );

    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1],
      weights: [320],
    });
    const done = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    const t1 = new Date("2026-11-21T00:00:00Z");
    await acknowledgeGoalCompletion(account, { goalId: done.id }, t1);
    await acknowledgeGoalCompletion(
      account,
      { goalId: done.id },
      new Date("2026-11-22T00:00:00Z"),
    );
    const g = await db().goal.findUniqueOrThrow({ where: { id: done.id } });
    expect(g.completionAcknowledgedAt?.getTime()).toBe(t1.getTime());
    expect(await listUnacknowledgedCompletions(account)).toEqual([]);
  });
});

describe("historical corrections (R29, R30, R28)", () => {
  it("editing a past set re-derives an active goal's percent — nothing stored goes stale", async () => {
    const { meso, bench } = await setup();
    const perf = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [5],
      weights: [235], // 87%
    });
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    expect((await listActiveGoals(account))[0].percent).toBe(87);

    await editLoggedSet(account, {
      loggedSetId: perf.setIds[0],
      weightLbs: 215,
      reps: 5,
    });
    expect((await listActiveGoals(account))[0].percent).toBe(79);

    await editLoggedSet(account, {
      loggedSetId: perf.setIds[0],
      weightLbs: 245,
      reps: 5,
    });
    expect((await listActiveGoals(account))[0].percent).toBe(90);
  });

  it("an upward correction to the target completes the goal on reconciliation", async () => {
    const { meso, bench } = await setup();
    const perf = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1],
      weights: [305],
    });
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await editLoggedSet(account, {
      loggedSetId: perf.setIds[0],
      weightLbs: 315,
      reps: 1,
    });
    expect(await reconcileGoalCompletions(account)).toEqual([r.id]);
  });

  it("a completed goal never reopens after a downward correction", async () => {
    const { meso, bench } = await setup();
    const perf = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1],
      weights: [320],
    });
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    expect(r.outcome).toBe("completed");
    const before = await db().goal.findUniqueOrThrow({ where: { id: r.id } });

    await editLoggedSet(account, {
      loggedSetId: perf.setIds[0],
      weightLbs: 300,
      reps: 1,
    });
    await reconcileGoalCompletions(account);
    const after = await db().goal.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("archived");
    expect(after.archiveReason).toBe("completed");
    expect(after.archivedAt?.getTime()).toBe(before.archivedAt?.getTime());
    const detail = await getGoalDetail(account, r.id);
    expect(detail?.kind).toBe("archived");
  });
});

describe("goals never mutate logged history or baselines", () => {
  it("create, reconcile, archive, and acknowledge leave sets and baselines identical", async () => {
    const { meso, bench, chestPress, downtown } = await setup();
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1, 3],
      weights: [320, 300],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: chestPress.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      reps: [10],
      weights: [180],
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: downtown.id,
        exerciseId: chestPress.id,
        weightLbs: 180,
      },
    });
    const before = await historySnapshot();

    const done = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    const machine = await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 220,
      targetReps: 10,
    });
    await reconcileGoalCompletions(account);
    await acknowledgeGoalCompletion(account, { goalId: done.id });
    await archiveGoal(account, { goalId: machine.id });

    expect(await historySnapshot()).toBe(before);
  });
});

describe("exercise and gym archival keep goals readable (R39–R41)", () => {
  it("an archived exercise's active goal stays readable and marked; new goals are refused", async () => {
    const { bench } = await setup();
    const r = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    await db().exercise.update({
      where: { id: bench.id },
      data: { deletedAt: new Date() },
    });
    const [g] = await listActiveGoals(account);
    expect(g).toMatchObject({ goalId: r.id, exerciseArchived: true });
    const detail = await getGoalDetail(account, r.id);
    expect(detail).toMatchObject({ kind: "active", exerciseArchived: true });
    expect(await getGoalFormContext(account, bench.id)).toMatchObject({
      kind: "archived_exercise",
    });
    // Still archivable by hand.
    await archiveGoal(account, { goalId: r.id });
    expect((await listGoalHistory(account))[0]).toMatchObject({
      goalId: r.id,
      exerciseArchived: true,
      outcome: "manual",
    });
  });

  it("an archived gym's machine goal stays scoped to that gym, readable and marked", async () => {
    const { chestPress, downtown } = await setup();
    const r = await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 200,
      targetReps: 10,
    });
    await db().gym.update({
      where: { id: downtown.id },
      data: { deletedAt: new Date() },
    });
    const detail = await getGoalDetail(account, r.id);
    expect(detail).toMatchObject({
      kind: "active",
      gymId: downtown.id,
      gymName: "Downtown Gym",
      gymArchived: true,
    });
  });

  it("a hard delete of an exercise or gym referenced by a goal is rejected", async () => {
    const { chestPress, downtown } = await setup();
    await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 200,
      targetReps: 10,
    });
    await expect(
      db().exercise.delete({ where: { id: chestPress.id } }),
    ).rejects.toThrow();
    await expect(
      db().gym.delete({ where: { id: downtown.id } }),
    ).rejects.toThrow();
    expect(await db().goal.count()).toBe(1);
  });
});

describe("the target form context (design Screen 3)", () => {
  it("reports duplicate, no-gym, and gym preselection states", async () => {
    const { bench, chestPress, downtown, campus } = await setup();
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    expect(await getGoalFormContext(account, bench.id)).toMatchObject({
      kind: "duplicate",
      existing: { targetLabel: "315 lb × 1" },
    });

    expect(
      await getGoalFormContext(account, chestPress.id, campus.id),
    ).toMatchObject({
      kind: "ok",
      gymVariable: true,
      defaultGymId: campus.id,
    });
    expect(await getGoalFormContext(account, chestPress.id)).toMatchObject({
      kind: "ok",
      defaultGymId: null,
    });
    for (const id of [downtown.id, campus.id]) {
      await db().gym.update({ where: { id }, data: { deletedAt: new Date() } });
    }
    expect(await getGoalFormContext(account, chestPress.id)).toMatchObject({
      kind: "no_gyms",
    });
  });
});

describe("completion through the real logging write path (OVE-31)", () => {
  it("logSet + completeWorkout, then the post-commit reconcile, completes the goal once", async () => {
    const { meso, bench } = await setup();
    const goal = await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 155,
      targetReps: 8,
    });
    const ls = await db().loggedSession.create({
      data: {
        userId: account.userId,
        mesocycleId: meso.id,
        performedOn: new Date("2026-11-02T12:00:00Z"),
        scheduledFor: new Date("2026-11-02T00:00:00Z"),
      },
    });
    const le = await db().loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: bench.id,
        plannedExerciseId: bench.id,
        plannedSets: 2,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });

    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 160,
      reps: 7,
    });
    // In progress: not yet qualifying, so nothing completes.
    expect(await reconcileGoalCompletions(account)).toEqual([]);
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 2,
      weightLbs: 150,
      reps: 8,
    });
    await completeWorkout(account, { loggedSessionId: ls.id });

    expect(await reconcileGoalCompletions(account)).toEqual([goal.id]);
    expect(await reconcileGoalCompletions(account)).toEqual([]);
    // Completion never generates the next goal (R35, R36).
    expect(await db().goal.count()).toBe(1);

    // The record survives in history, the reached card is pending once.
    expect(await listActiveGoals(account)).toEqual([]);
    expect((await listGoalHistory(account))[0]).toMatchObject({
      goalId: goal.id,
      outcome: "completed",
    });
    const pending = await listUnacknowledgedCompletions(account);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      goalId: goal.id,
      alreadyReached: false,
      newGoalHref: `/goals/new/${bench.id}`,
    });
    await acknowledgeGoalCompletion(account, { goalId: goal.id });
    expect(await listUnacknowledgedCompletions(account)).toEqual([]);

    // The logged sets are exactly as entered.
    const sets = await db().loggedSet.findMany({
      where: { loggedExerciseId: le.id },
      orderBy: { setNumber: "asc" },
    });
    expect(sets.map((x) => [Number(x.weightLbs), x.reps])).toEqual([
      [160, 7],
      [150, 8],
    ]);
  });

  it("the archived detail offers a new goal only when the exercise is free and active", async () => {
    const { meso, chestPress, downtown } = await setup();
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: chestPress.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      reps: [10],
      weights: [210],
    });
    const done = await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 200,
      targetReps: 10,
    });
    expect(done.outcome).toBe("completed");
    expect(await getGoalDetail(account, done.id)).toMatchObject({
      kind: "archived",
      outcome: "completed",
      unacknowledged: true,
      alreadyReached: true,
      newGoalHref: `/goals/new/${chestPress.id}?gymId=${downtown.id}`,
    });

    const next = await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 230,
      targetReps: 10,
    });
    expect(next.outcome).toBe("active");
    expect(await getGoalDetail(account, done.id)).toMatchObject({
      newGoalHref: null,
    });

    await archiveGoal(account, { goalId: next.id });
    await db().gym.update({
      where: { id: downtown.id },
      data: { deletedAt: new Date() },
    });
    // Archived gym: the new-goal link keeps the lift but drops the gym.
    expect(await getGoalDetail(account, done.id)).toMatchObject({
      newGoalHref: `/goals/new/${chestPress.id}`,
    });
  });
});

describe("post-session goal rows (OVE-32; design Screen 8)", () => {
  it("shows only touched goals: before → after for progress, reached for a completion", async () => {
    const { meso, bench, chestPress, downtown } = await setup();
    const ohp = await createTestExercise({
      name: "Overhead Press",
      equipmentType: "barbell",
    });
    const squat = await createTestExercise({
      name: "Hack Squat",
      equipmentType: "barbell",
    });
    // Prior bench session → 87%.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [5],
      weights: [235],
    });
    const benchGoal = await createGoal(
      account,
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
      new Date("2026-11-03T00:00:00Z"),
    );
    const ohpGoal = await createGoal(
      account,
      { exerciseId: ohp.id, targetWeightLbs: 155, targetReps: 8 },
      new Date("2026-11-03T00:01:00Z"),
    );
    await createGoal(
      account,
      { exerciseId: squat.id, targetWeightLbs: 365, targetReps: 5 },
      new Date("2026-11-03T00:00:00Z"),
    );
    await createGoal(
      account,
      {
        exerciseId: chestPress.id,
        gymId: downtown.id,
        targetWeightLbs: 200,
        targetReps: 10,
      },
      new Date("2026-11-03T00:00:00Z"),
    );

    // Today's workout: bench 245 × 5 (→ 90%), OHP 160 × 7 (reaches 155 × 8).
    const today = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      reps: [5],
      weights: [245],
    });
    const ohpLe = await db().loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: today.loggedSessionId,
        exerciseId: ohp.id,
        plannedExerciseId: ohp.id,
        position: 1,
        plannedSets: 1,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });
    await db().loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: ohpLe.id,
        setNumber: 1,
        weightLbs: 160,
        reps: 7,
      },
    });
    await reconcileGoalCompletions(account, {
      now: new Date("2026-11-09T14:00:00Z"),
    });

    const rows = await getSessionGoalSummary(account, today.loggedSessionId);
    expect(rows).toEqual([
      {
        goalId: benchGoal.id,
        exerciseName: "Barbell Bench Press",
        targetLabel: "315 × 1",
        kind: "progress",
        percentBefore: 87,
        percentAfter: 90,
      },
      {
        goalId: ohpGoal.id,
        exerciseName: "Overhead Press",
        targetLabel: "155 × 8",
        kind: "reached",
        percentBefore: null,
        percentAfter: null,
      },
    ]);
    // Hack Squat and the machine goal were not trained: absent.
  });

  it("a goal set after the workout was completed is not shown as moved by it", async () => {
    const { meso, bench } = await setup();
    const s = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02", // completed 2026-11-02T13:00Z
      reps: [5],
      weights: [235],
    });
    await createGoal(
      account,
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
      new Date("2026-11-02T18:00:00Z"),
    );
    expect(await getSessionGoalSummary(account, s.loggedSessionId)).toEqual([]);
  });

  it("a first measured session has no 'before'", async () => {
    const { meso, bench } = await setup();
    await createGoal(
      account,
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
      new Date("2026-11-01T00:00:00Z"),
    );
    const s = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [5],
      weights: [235],
    });
    expect(
      await getSessionGoalSummary(account, s.loggedSessionId),
    ).toMatchObject([
      { kind: "progress", percentBefore: null, percentAfter: 87 },
    ]);
  });

  it("a machine goal is touched only at its gym; a swap counts to the performed exercise", async () => {
    const { meso, bench, chestPress, downtown, campus } = await setup();
    await createGoal(account, {
      exerciseId: chestPress.id,
      gymId: downtown.id,
      targetWeightLbs: 200,
      targetReps: 10,
    });
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });

    const atCampus = await logPerf({
      mesocycleId: meso.id,
      exerciseId: chestPress.id,
      gymId: campus.id,
      scheduledFor: "2026-11-02",
      reps: [10],
      weights: [180],
    });
    expect(
      await getSessionGoalSummary(account, atCampus.loggedSessionId),
    ).toEqual([]);

    // Bench was planned but Chest Press Machine was performed (swap) at Downtown.
    const swapped = await logPerf({
      mesocycleId: meso.id,
      exerciseId: chestPress.id,
      plannedExerciseId: bench.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-09",
      reps: [10],
      weights: [180],
    });
    expect(
      await getSessionGoalSummary(account, swapped.loggedSessionId),
    ).toMatchObject([
      {
        exerciseName: "Chest Press Machine",
        kind: "progress",
        percentAfter: 90,
      },
    ]);
  });

  it("an in-progress or scheduled-deload session touches no goal", async () => {
    const { meso, bench } = await setup();
    await createGoal(account, {
      exerciseId: bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    const inProgress = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [5],
      weights: [235],
      status: "in_progress",
    });
    expect(
      await getSessionGoalSummary(account, inProgress.loggedSessionId),
    ).toEqual([]);
    const deloadWeek = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-30",
      reps: [5],
      weights: [215],
    });
    expect(
      await getSessionGoalSummary(account, deloadWeek.loggedSessionId),
    ).toEqual([]);
  });

  it("a goal completed by an earlier session is not re-announced by a later one", async () => {
    const { meso, bench } = await setup();
    await createGoal(
      account,
      { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
      new Date("2026-11-01T00:00:00Z"),
    );
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [1],
      weights: [320],
    });
    await reconcileGoalCompletions(account, {
      now: new Date("2026-11-02T14:00:00Z"),
    });
    const later = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      reps: [1],
      weights: [325],
    });
    expect(await getSessionGoalSummary(account, later.loggedSessionId)).toEqual(
      [],
    );
  });
});
